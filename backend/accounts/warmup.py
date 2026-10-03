import logging
import random
import uuid
from datetime import timedelta
from threading import Event

from django.core.exceptions import ValidationError
from django.db import close_old_connections, transaction
from django.utils import timezone
from telethon import errors, functions

from . import telegram
from .models import Account, WarmupJob, WarmupParticipant
from .security import decrypt, session_lock

logger = logging.getLogger(__name__)


def next_message_time(now):
    return now + timedelta(seconds=random.randint(40 * 60, 80 * 60))


def serialize(job):
    participants = list(job.participants.select_related("account").order_by("id"))
    now = timezone.now()
    return {
        "id": str(job.pk), "status": job.status,
        "startedAt": job.started_at.isoformat(), "endsAt": job.ends_at.isoformat(),
        "error": job.error, "sent": sum(p.sent for p in participants),
        "progress": min(100, max(0, round((now - job.started_at).total_seconds() / 86400 * 100))),
        "participants": [{"accountId": str(p.account_id), "name": p.account.first_name,
            "sent": p.sent, "nextMessageAt": p.next_message_at.isoformat() if job.status == "running" and p.next_message_at < job.ends_at else None}
            for p in participants],
    }


def start(owner, data):
    ids, messages = data.get("accountIds"), data.get("messages")
    if not isinstance(ids, list) or not 2 <= len(ids) <= 100:
        raise ValidationError("Выбери от 2 до 100 своих аккаунтов.")
    try:
        ids = [uuid.UUID(str(value)) for value in ids]
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("Некорректный список аккаунтов.") from None
    if len(set(ids)) != len(ids):
        raise ValidationError("Аккаунты в списке не должны повторяться.")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 50 or any(
        not isinstance(text, str) or not text.strip() or len(text) > 1000 for text in messages
    ):
        raise ValidationError("Добавь от 1 до 50 сообщений, каждое до 1000 символов.")
    with session_lock(f"warmup-owner-{owner.pk}"), transaction.atomic():
        if WarmupJob.objects.filter(owner=owner, status="running").exists():
            raise ValidationError("Прогрев уже запущен. Сначала останови текущую задачу.")
        accounts = list(Account.objects.filter(owner=owner, pk__in=ids))
        if len(accounts) != len(ids):
            raise ValidationError("Можно выбрать только свои подключённые аккаунты.")
        if any(account.status != "ready" for account in accounts):
            raise ValidationError("Все выбранные аккаунты должны быть готовы к работе.")
        now = timezone.now()
        job = WarmupJob.objects.create(owner=owner, messages=[text.strip() for text in messages], started_at=now, ends_at=now + timedelta(hours=24))
        WarmupParticipant.objects.bulk_create([
            WarmupParticipant(job=job, account=account, next_message_at=next_message_time(now)) for account in accounts
        ])
        telegram.record(owner, "Прогрев запущен", f"{len(accounts)} аккаунтов · 24 часа · интервал 40–80 минут")
    return job


def finish(job, status, detail=""):
    job.status, job.error = status, detail[:255] if status == "failed" else ""
    job.save(update_fields=["status", "error"])
    title = {"completed": "Прогрев завершён", "cancelled": "Прогрев остановлен", "failed": "Ошибка прогрева"}[status]
    telegram.record(job.owner, title, detail or "Отправка сообщений завершена.", "warning" if status == "failed" else "info")


def stop(owner, job_id):
    with session_lock(f"warmup-owner-{owner.pk}", blocking=True):
        job = WarmupJob.objects.filter(pk=job_id, owner=owner).first()
        if job and job.status == "running":
            finish(job, "cancelled")
        return job


def send_message(sender, recipient, text, deadline):
    with session_lock(sender.pk):
        payload = decrypt(sender.session)

        async def operation():
            client = telegram.client_for(payload)
            try:
                await client.connect()
                if not await client.is_user_authorized():
                    raise telegram.TelegramFailure("Сессия отозвана. Добавь аккаунт заново.", 409)
                if recipient.username:
                    resolved = await client(functions.contacts.ResolveUsernameRequest(recipient.username))
                else:
                    resolved = await client(functions.contacts.ResolvePhoneRequest(recipient.phone.lstrip("+")))
                user = next((u for u in resolved.users if u.id == recipient.telegram_id), None)
                if user is None:
                    raise telegram.TelegramFailure("Получатель не найден или его username изменился. Обнови аккаунты.")
                if timezone.now() >= deadline:
                    return False
                await client.send_message(user, text, parse_mode=None)
                return True
            finally:
                await client.disconnect()

        return telegram.run(operation())


def tick():
    for job_id, owner_id in WarmupJob.objects.filter(status="running").values_list("pk", "owner_id"):
        try:
            with session_lock(f"warmup-owner-{owner_id}"):
                job = WarmupJob.objects.select_related("owner").get(pk=job_id)
                if job.status != "running":
                    continue
                if timezone.now() >= job.ends_at:
                    finish(job, "completed", "Прошло 24 часа.")
                    continue
                participants = list(job.participants.select_related("account").order_by("id"))
                if len(participants) < 2:
                    finish(job, "failed", "Для обмена сообщениями осталось меньше двух аккаунтов.")
                    continue
                for participant in participants:
                    now = timezone.now()
                    if now >= job.ends_at:
                        finish(job, "completed", "Прошло 24 часа.")
                        break
                    if participant.next_message_at > now:
                        continue
                    recipient = random.choice([p.account for p in participants if p.account_id != participant.account_id])
                    participant.next_message_at = next_message_time(now)
                    participant.save(update_fields=["next_message_at"])
                    try:
                        sent = send_message(participant.account, recipient, random.choice(job.messages), job.ends_at)
                    except ValidationError:
                        telegram.record(job.owner, "Сообщение отложено", f"{participant.account.first_name}: аккаунт занят", "warning")
                        continue
                    except (telegram.TelegramFailure, errors.RPCError, OSError, TimeoutError, ValueError) as exc:
                        detail = str(exc) if isinstance(exc, telegram.TelegramFailure) else telegram.error_message(exc)
                        finish(job, "failed", f"{participant.account.first_name}: {detail}")
                        break
                    except Exception as exc:
                        logger.error("Warmup send failed (%s)", type(exc).__name__)
                        finish(job, "failed", f"{participant.account.first_name}: не удалось отправить сообщение. Проверь сессию аккаунта.")
                        break
                    if sent:
                        participant.sent += 1
                        participant.next_message_at = next_message_time(timezone.now())
                        participant.save(update_fields=["sent", "next_message_at"])
                        telegram.record(job.owner, "Сообщение отправлено", f"{participant.account.first_name} → {recipient.first_name}", "success")
                    break
        except ValidationError:
            continue


def worker_online():
    try:
        with session_lock("warmup-worker"):
            return False
    except ValidationError:
        return True


def run_worker(stop_event=None):
    stop_event = stop_event or Event()
    try:
        with session_lock("warmup-worker"):
            while not stop_event.is_set():
                close_old_connections()
                try:
                    tick()
                except Exception:
                    logger.exception("Warmup worker tick failed")
                finally:
                    close_old_connections()
                stop_event.wait(5)
    except ValidationError:
        logger.info("A warmup worker is already running on this host")
