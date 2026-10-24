"""Persistent polling with a durable cursor and at most one attempt per message."""
import logging
import re
import uuid
from datetime import timedelta
from threading import Event
from django.core.exceptions import ValidationError
from django.db import close_old_connections, transaction
from django.utils import timezone
from telethon import functions, types, utils
from . import telegram
from .access import available_accounts, can_use
from .models import Account, MonitorRule, MonitorDelivery
from .security import decrypt, session_lock

logger = logging.getLogger(__name__)


def serialize(rule):
    return {"id": str(rule.pk), "accountId": str(rule.account_id), "accountName": rule.account.first_name,
            "mode": rule.mode, "target": rule.target, "title": rule.title, "keyword": rule.keyword,
            "text": rule.text, "status": rule.status, "sent": rule.sent, "error": rule.error,
            "lastMessageId": rule.cursor,
            "uncertain": rule.deliveries.filter(state="attempted").count(),
            "failed": rule.deliveries.filter(state="failed").count()}


def parse_target(value):
    value = str(value).strip()
    match = re.fullmatch(r"(?:https?://t\.me/|@)?([A-Za-z][A-Za-z0-9_]{3,31})/?", value)
    if match:
        return "@" + match[1]
    if re.fullmatch(r"-\d{1,16}", value):
        return value
    raise ValidationError("Укажи @username, ссылку t.me на канал/группу или отрицательный ID чата.")


async def connect(account):
    client = telegram.client_for(decrypt(account.session))
    try:
        await client.connect()
        me = await client.get_me()
        if not me or me.id != account.telegram_id or getattr(me, "deleted", False):
            raise telegram.TelegramFailure("Сессия отозвана или не принадлежит выбранному аккаунту.", 409)
        return client
    except BaseException:
        await client.disconnect()
        raise


async def resolve(client, target, mode):
    if target.startswith("-"):
        await client.get_dialogs()
    entity = await client.get_entity(int(target) if target.startswith("-") else target)
    if mode == "channel":
        if not isinstance(entity, types.Channel) or not entity.broadcast:
            raise ValidationError("Для комментариев выбери канал.")
        full = await client(functions.channels.GetFullChannelRequest(entity))
        if not getattr(full.full_chat, "linked_chat_id", None):
            raise ValidationError("У канала нет подключённой группы обсуждений.")
    elif not (isinstance(entity, types.Chat) or isinstance(entity, types.Channel) and entity.megagroup):
        raise ValidationError("Для ключевых слов выбери группу или супергруппу.")
    return entity


def create(owner, data):
    mode = data.get("mode")
    text, keyword = str(data.get("text", "")).strip(), str(data.get("keyword", "")).strip()
    if mode not in ("channel", "chat") or not text or len(text) > 4000:
        raise ValidationError("Выбери режим и введи ответ длиной от 1 до 4000 символов.")
    if mode == "chat" and not 1 <= len(keyword) <= 200:
        raise ValidationError("Укажи ключевую фразу длиной до 200 символов.")
    try:
        account_id = uuid.UUID(str(data.get("accountId")))
    except (TypeError, ValueError):
        raise ValidationError("Выбери аккаунт отправителя.") from None
    account = available_accounts(owner).filter(pk=account_id, status="ready").first()
    if not account:
        raise ValidationError("Аккаунт не готов или недоступен на твоём тарифе.")
    target = parse_target(data.get("target", ""))
    with session_lock(f"monitor-owner-{owner.pk}"), session_lock(account.pk):
        if MonitorRule.objects.filter(owner=owner).count() >= 100:
            raise ValidationError("Доступно до 100 правил. Удали ненужные.")
        async def initialize():
            client = await connect(account)
            try:
                entity = await resolve(client, target, mode)
                latest = await client.get_messages(entity, limit=1)
                return utils.get_peer_id(entity), entity.title, latest[0].id if latest else 0
            finally:
                await client.disconnect()
        target_id, title, cursor = telegram.run(initialize())
        if MonitorRule.objects.filter(owner=owner, account=account, target_id=target_id, mode=mode, keyword=keyword if mode == "chat" else "").exists():
            raise ValidationError("Такое правило уже существует.")
        rule = MonitorRule.objects.create(owner=owner, account=account, mode=mode, target=target,
            target_id=target_id, title=title[:255], cursor=cursor, keyword=keyword if mode == "chat" else "",
            text=text, next_poll_at=timezone.now())
        telegram.record(owner, "Отслеживание включено", title[:255])
        return rule


def change(owner, rule_id, action):
    with session_lock(f"monitor-{rule_id}", blocking=True):
        rule = MonitorRule.objects.filter(pk=rule_id, owner=owner).select_related("account").first()
        if not rule:
            return None
        if action == "delete":
            rule.delete()
            return True
        if action not in ("pause", "resume"):
            raise ValidationError("Выбери паузу или продолжение.")
        if action == "resume" and not can_use(owner, rule.account):
            raise ValidationError("Аккаунт недоступен на твоём тарифе.")
        rule.status = "running" if action == "resume" else "paused"
        rule.error = ""
        rule.next_poll_at = timezone.now()
        rule.save(update_fields=["status", "error", "next_poll_at"])
        return rule


def matches(rule, message, managed_ids):
    if getattr(message, "action", None):
        return False
    if rule.mode == "channel":
        return True
    if getattr(message, "out", False):
        return False
    if getattr(message, "sender_id", None) in managed_ids or getattr(message, "via_bot_id", None):
        return False
    return rule.keyword.casefold() in (getattr(message, "message", "") or "").casefold()


def poll(rule):
    with session_lock(rule.account_id):
        managed_ids = set(Account.objects.values_list("telegram_id", flat=True))
        async def read():
            client = await connect(rule.account)
            try:
                entity = await resolve(client, rule.target, rule.mode)
                if utils.get_peer_id(entity) != rule.target_id:
                    raise ValidationError("Адресат изменился. Создай правило заново.")
                cursor, candidate = rule.cursor, None
                async for message in client.iter_messages(entity, min_id=rule.cursor, reverse=True, limit=50):
                    cursor = message.id
                    if matches(rule, message, managed_ids):
                        if rule.mode == "chat":
                            sender = await message.get_sender()
                            if getattr(sender, "bot", False):
                                continue
                        candidate = message.id
                        break
                return utils.get_input_peer(entity), cursor, candidate
            finally:
                await client.disconnect()
        peer, cursor, candidate = telegram.run(read())
        if not can_use(rule.owner, rule.account):
            raise ValidationError("Доступ к аккаунту изменился. Проверь тариф.")
        with transaction.atomic():
            rule.cursor = cursor
            rule.error = ""
            rule.save(update_fields=["cursor", "error"])
            if candidate is None:
                return
            delivery, created = MonitorDelivery.objects.get_or_create(rule=rule, message_id=candidate)
        if not created:
            return
        # Claim before sending: a crash or lost Telegram response never triggers a duplicate.
        async def send():
            client = await connect(rule.account)
            try:
                options = {"comment_to": candidate} if rule.mode == "channel" else {"reply_to": candidate}
                sent = await client.send_message(peer, rule.text, parse_mode=None, link_preview=False, **options)
                if not sent or not isinstance(sent.id, int) or sent.id <= 0:
                    raise telegram.TelegramFailure("Результат отправки неизвестен. Повтора не будет.")
            finally:
                await client.disconnect()
        try:
            telegram.run(send())
        except Exception as exc:
            # Preserve 'attempted' for uncertain network/timeout results; never retry them.
            delivery.error = "Отправка не подтверждена. Автоматического повтора не будет."
            if isinstance(exc, telegram.TelegramFailure) and not isinstance(exc.__context__, (OSError, TimeoutError)):
                delivery.state = "failed"
            delivery.save(update_fields=["error", "state"])
            raise
        delivery.state = "sent"
        delivery.save(update_fields=["state"])
        rule.sent += 1
        rule.save(update_fields=["sent"])
        telegram.record(rule.owner, "Автоответ отправлен", f"{rule.title} · сообщение {candidate}", "success")


def tick():
    ids = list(MonitorRule.objects.filter(status="running", next_poll_at__lte=timezone.now()).values_list("pk", flat=True))
    for rule_id in ids:
        try:
            with session_lock(f"monitor-{rule_id}"):
                rule = MonitorRule.objects.filter(pk=rule_id, status="running").select_related("owner", "account").first()
                if not rule:
                    continue
                if not can_use(rule.owner, rule.account):
                    rule.status, rule.error = "paused", "Доступ к аккаунту изменился. Проверь тариф."
                    rule.save(update_fields=["status", "error"])
                    continue
                rule.next_poll_at = timezone.now() + timedelta(seconds=5)
                rule.save(update_fields=["next_poll_at"])
                try:
                    poll(rule)
                except ValidationError as exc:
                    rule.error = " ".join(exc.messages)[:255]
                    # A busy session is transient; a changed target or permissions needs review.
                    if "уже выполняет операцию" not in rule.error:
                        rule.status = "paused"
                    rule.save(update_fields=["status", "error"])
                except telegram.TelegramFailure as exc:
                    rule.error = str(exc)[:255]
                    rule.next_poll_at = timezone.now() + timedelta(seconds=max(60, exc.retry_after))
                    rule.save(update_fields=["error", "next_poll_at"])
                    telegram.record(rule.owner, "Ошибка отслеживания", rule.error, "warning")
        except ValidationError:
            continue
        except Exception:
            logger.exception("Monitor poll failed for rule %s", rule_id)
            MonitorRule.objects.filter(pk=rule_id).update(error="Ошибка отслеживания. Проверь сессию и адресата.", next_poll_at=timezone.now() + timedelta(seconds=60))


def worker_online():
    try:
        with session_lock("monitor-worker"):
            return False
    except ValidationError:
        return True


def run_worker(stop_event=None):
    stop_event = stop_event or Event()
    try:
        with session_lock("monitor-worker"):
            while not stop_event.is_set():
                close_old_connections()
                try:
                    tick()
                except Exception:
                    logger.exception("Monitor worker tick failed")
                finally:
                    close_old_connections()
                stop_event.wait(5)
    except ValidationError:
        logger.info("A monitor worker is already running on this host")
