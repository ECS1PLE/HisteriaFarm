import re
import uuid
from datetime import timedelta
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from telethon import errors, functions, types, utils

from . import telegram
from .models import Account, PublicationBatch, PublicationDelivery
from .security import decrypt, encrypt, session_lock


class PublicationStop(telegram.TelegramFailure):
    def __init__(self, message, status=400, unknown=False, *, stop_batch=False):
        super().__init__(message, status)
        self.unknown = unknown
        self.stop_batch = stop_batch


def parse_target(raw, mode):
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 512:
        raise ValidationError("Каждая ссылка должна содержать от 1 до 512 символов.")

    raw = raw.strip()
    locator, post_id = None, None

    if mode == "direct" and re.fullmatch(r"\+[\d ()-]+", raw):
        phone = re.sub(r"\D", "", raw)
        if not re.fullmatch(r"[1-9]\d{6,14}", phone):
            raise ValidationError("Укажи номер с кодом страны, например +79991234567.")
        return {"link": raw, "locator": {"phone": phone}, "postId": None}

    if re.fullmatch(r"@?[A-Za-z][A-Za-z0-9_]{0,31}", raw):
        locator = {"username": raw.removeprefix("@").lower()}
    else:
        url = urlsplit(raw if "://" in raw else "https://" + raw)
        if (
            url.scheme not in ("http", "https")
            or url.netloc.lower() not in ("t.me", "telegram.me")
            or url.fragment
            or url.query not in (("",) if mode == "direct" else ("", "single"))
        ):
            raise ValidationError("Нужна прямая ссылка t.me без параметров комментария или пересылки.")

        path = url.path.strip("/")
        invite = re.fullmatch(r"(?:\+|joinchat/)([A-Za-z0-9_-]+)", path)
        private = re.fullmatch(r"c/([1-9]\d*)(?:/([1-9]\d*))?", path)
        public = re.fullmatch(r"(?:s/)?([A-Za-z][A-Za-z0-9_]{0,31})(?:/([1-9]\d*))?", path)

        if invite and mode == "messages":
            locator = {"invite": invite[1]}
        elif private:
            locator, post_id = {"channelId": int(private[1])}, private[2]
        elif public and public[1].lower() not in (
            "share", "proxy", "socks", "login", "boost", "addstickers", "joinchat",
        ):
            locator, post_id = {"username": public[1].lower()}, public[2]
        else:
            raise ValidationError("Ссылка не указывает на чат или пост Telegram.")

        if mode == "direct" and ("channelId" in locator or path.startswith("s/") or post_id):
            raise ValidationError("Для личного сообщения укажи @username, прямую ссылку на пользователя или номер телефона.")

    if mode == "comments":
        if not post_id or int(post_id) > 2147483647:
            raise ValidationError("Для комментария нужна ссылка на конкретный пост канала.")
        post_id = int(post_id)
    elif post_id:
        raise ValidationError("Для сообщения укажи ссылку на сам чат; для поста выбери «Комментарии».")

    return {"link": raw, "locator": locator, "postId": post_id}


async def resolve(client, target, mode):
    locator = target["locator"]
    try:
        if "phone" in locator and mode == "direct":
            resolved = await client(functions.contacts.ResolvePhoneRequest(phone=locator["phone"]))
            entity = next((user for user in resolved.users if isinstance(resolved.peer, types.PeerUser) and user.id == resolved.peer.user_id), None)
        elif "invite" in locator:
            invite = await client(functions.messages.CheckChatInviteRequest(hash=locator["invite"]))
            if not isinstance(invite, types.ChatInviteAlready):
                raise telegram.TelegramFailure("Аккаунт не состоит в чате по этой ссылке. Добавь его в Telegram самостоятельно.")
            entity = await client.get_entity(utils.get_input_peer(invite.chat))
        elif "channelId" in locator:
            await client.get_dialogs()
            entity = await client.get_entity(types.PeerChannel(locator["channelId"]))
        else:
            entity = await client.get_entity("@" + locator["username"])
    except ValueError:
        raise telegram.TelegramFailure("Получатель недоступен аккаунту. Проверь username или настройки поиска по номеру." if mode == "direct" else "Чат недоступен аккаунту. Проверь ссылку и его участие в чате.") from None

    if mode == "direct":
        if not isinstance(entity, types.User) or entity.bot or entity.deleted:
            raise telegram.TelegramFailure("Для личного сообщения нужен действующий аккаунт пользователя, а не бот, чат или канал.")
        return entity, None, {
            "sourceId": utils.get_peer_id(entity),
            "destinationId": utils.get_peer_id(entity),
            "replyId": None,
            "title": " ".join(part for part in (entity.first_name, entity.last_name) if part) or ("@" + entity.username if entity.username else "Пользователь Telegram"),
            "discussionTitle": None,
        }

    if not isinstance(entity, (types.Channel, types.Chat)):
        raise PublicationStop("Для чатов и каналов выбери соответствующий режим; для личной переписки — «Личные сообщения».", 403)

    destination, reply_id = entity, None
    if mode == "comments":
        if not isinstance(entity, types.Channel) or not entity.broadcast:
            raise PublicationStop("Комментарии поддерживаются только под постами канала.")

        result = await client(functions.messages.GetDiscussionMessageRequest(
            peer=entity, msg_id=target["postId"],
        ))
        candidates = [
            message for message in result.messages
            if isinstance(message, types.Message)
            and isinstance(message.peer_id, types.PeerChannel)
            and message.peer_id.channel_id != entity.id
        ]
        if not candidates:
            raise PublicationStop("У поста нет доступной группы обсуждения или комментарии отключены.")

        root = min(candidates, key=lambda message: message.id)
        group = next((
            chat for chat in result.chats
            if isinstance(chat, types.Channel) and chat.id == root.peer_id.channel_id
        ), None)
        if not group:
            raise PublicationStop("Telegram не вернул группу обсуждения поста.")

        destination = await client.get_entity(utils.get_input_peer(group))
        if not isinstance(destination, types.Channel) or not destination.megagroup:
            raise PublicationStop("Группа обсуждения недоступна.")
        reply_id = root.id

    return destination, reply_id, {
        "sourceId": utils.get_peer_id(entity),
        "destinationId": utils.get_peer_id(destination),
        "replyId": reply_id,
        "title": entity.title,
        "discussionTitle": destination.title if reply_id else None,
    }


def serialize_delivery(delivery):
    return {
        "id": str(delivery.pk),
        "accountId": str(delivery.account_id),
        "name": delivery.account.first_name,
        "targetIndex": delivery.target_index,
        "state": delivery.state,
        "messageId": delivery.message_id,
        "error": delivery.error,
    }


def serialize(batch):
    payload = decrypt(batch.payload)
    return {
        "id": str(batch.pk),
        "mode": payload["mode"],
        "text": payload["text"],
        "expiresAt": batch.expires.isoformat(),
        "cancelled": batch.cancelled,
        "error": batch.error,
        "targets": [
            {"link": target["link"], "title": target["title"], "discussionTitle": target["discussionTitle"]}
            for target in payload["targets"]
        ],
        "deliveries": [
            serialize_delivery(delivery)
            for delivery in batch.deliveries.select_related("account").order_by("target_index", "account_id")
        ],
    }


def prepare(owner, data):
    mode, text, links, ids = data.get("mode"), data.get("text"), data.get("targets"), data.get("accountIds")
    if mode not in ("messages", "comments", "direct"):
        raise ValidationError("Выбери сообщения в чаты, комментарии или личные сообщения.")
    if not isinstance(text, str) or not text.strip() or len(text.encode("utf-16-le")) // 2 > 4096:
        raise ValidationError("Укажи текст до 4096 символов Telegram.")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 100:
        raise ValidationError("Выбери от 1 до 100 своих готовых аккаунтов.")

    try:
        ids = [uuid.UUID(str(value)) for value in ids]
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("Некорректный список аккаунтов.") from None
    if len(set(ids)) != len(ids):
        raise ValidationError("Аккаунты не должны повторяться.")

    account_map = {
        account.pk: account
        for account in Account.objects.filter(owner=owner, pk__in=ids, status="ready")
    }
    if len(account_map) != len(ids):
        raise ValidationError("Используй только свои готовые аккаунты.")
    accounts = [account_map[account_id] for account_id in ids]

    if not isinstance(links, list) or not 1 <= len(links) <= 10:
        raise ValidationError("Добавь от 1 до 10 ссылок, по одной на строку.")
    targets = [parse_target(link, mode) for link in links]
    sender = accounts[0]

    with session_lock(sender.pk):
        async def verify():
            client = telegram.client_for(decrypt(sender.session))
            try:
                await client.connect()
                if not await client.is_user_authorized():
                    raise telegram.TelegramFailure("Сессия первого отправителя отозвана.", 409)
                if mode == "direct":
                    me = await client.get_me()
                    if not me or me.id != sender.telegram_id or me.deleted:
                        raise telegram.TelegramFailure("Сессия первого отправителя не принадлежит выбранному аккаунту. Проверь её в панели.", 409)

                seen = set()
                for target in targets:
                    _, _, resolved = await resolve(client, target, mode)
                    key = (resolved["destinationId"], resolved["replyId"])
                    if key in seen:
                        raise ValidationError("Один получатель указан несколько раз." if mode == "direct" else "Один чат или пост указан несколько раз.")
                    seen.add(key)
                    target.update(resolved)
            finally:
                await client.disconnect()

        telegram.run(verify())

    with transaction.atomic():
        batch = PublicationBatch.objects.create(
            owner=owner,
            payload=encrypt({"mode": mode, "text": text, "targets": targets}),
            expires=timezone.now() + timedelta(hours=1),
        )
        PublicationDelivery.objects.bulk_create([
            PublicationDelivery(batch=batch, account=account, target_index=index)
            for index in range(len(targets)) for account in accounts
        ])
    return batch


def cancel(owner, batch_id):
    with session_lock(f"publication-{batch_id}", blocking=True):
        batch = PublicationBatch.objects.filter(pk=batch_id, owner=owner).first()
        if batch:
            batch.cancelled = True
            batch.save(update_fields=["cancelled"])
            batch.deliveries.filter(state="pending").update(state="skipped")
        return batch


def skip_sender(batch, row):
    """Never retry another target using a sender that failed in this batch."""
    batch.deliveries.filter(account_id=row.account_id, state="pending").exclude(pk=row.pk).update(
        state="skipped", error=("Аккаунт пропущен: " + (row.error or "Ответ на предыдущий запрос не получен."))[:255],
    )


def delivery_result(batch, row, *, skipped=False):
    return {
        "delivery": serialize_delivery(row), "stop": batch.cancelled,
        "skippedAccountId": str(row.account_id) if skipped else None,
    }


def skip_delivery_account(owner, batch_id, delivery_id, data):
    if data.get("confirmed") is not True:
        raise ValidationError("Подтверди отправку перед пропуском аккаунта.")
    # A lost HTTP response can leave an operation running. Wait for its lock,
    # then preserve a confirmed result or mark an interrupted attempt unknown.
    with session_lock(f"publication-{batch_id}", blocking=True):
        batch = PublicationBatch.objects.filter(pk=batch_id, owner=owner).first()
        row = PublicationDelivery.objects.filter(pk=delivery_id, batch=batch, account__owner=owner).select_related("account").first() if batch else None
        if not row:
            raise telegram.TelegramFailure("Публикация не найдена.", 404)
        if row.state in ("pending", "sending"):
            row.error = "Ответ сервера не получен. Аккаунт пропущен; повторной отправки не будет."
            row.state = "unknown" if row.state == "sending" else "skipped"
            row.save(update_fields=["state", "error"])
            telegram.record(owner, "Аккаунт пропущен", f"{row.account.first_name}: {row.error}", "warning")
        skip_sender(batch, row)
        return delivery_result(batch, row, skipped=True)


def deliver(owner, batch_id, delivery_id, data):
    if data.get("confirmed") is not True:
        raise ValidationError("Подтверди текст, адресатов и аккаунты перед отправкой.")

    with session_lock(f"publication-{batch_id}"):
        batch = PublicationBatch.objects.filter(pk=batch_id, owner=owner).first()
        row = PublicationDelivery.objects.filter(
            pk=delivery_id, batch=batch, account__owner=owner,
        ).select_related("account").first() if batch else None
        if not row:
            raise telegram.TelegramFailure("Публикация не найдена.", 404)

        if row.state != "pending":
            if row.state == "sending":
                row.state, row.error = "unknown", "Результат предыдущей отправки неизвестен; повтор запрещён."
                row.save(update_fields=["state", "error"])
            skipped = row.state in ("failed", "unknown", "skipped")
            if skipped:
                skip_sender(batch, row)
            return delivery_result(batch, row, skipped=skipped)

        if batch.cancelled or timezone.now() >= batch.expires:
            raise telegram.TelegramFailure("Отправка остановлена или срок формы истёк.", 409)

        payload = decrypt(batch.payload)
        target = payload["targets"][row.target_index]

        try:
            with session_lock(row.account_id):
                if row.account.status != "ready":
                    raise telegram.TelegramFailure("Аккаунт отправителя не готов. Проверь его в Telegram.")
                row.state = "sending"
                row.save(update_fields=["state"])

                async def operation():
                    client = telegram.client_for(decrypt(row.account.session))
                    try:
                        await client.connect()
                        if not await client.is_user_authorized():
                            raise telegram.TelegramFailure("Сессия отправителя отозвана.", 409)
                        if payload["mode"] == "direct":
                            me = await client.get_me()
                            if not me or me.id != row.account.telegram_id or me.deleted:
                                raise telegram.TelegramFailure("Сессия не принадлежит выбранному отправителю. Проверь её в панели.", 409)

                        destination, reply_id, resolved = await resolve(client, target, payload["mode"])
                        if any(resolved[key] != target[key] for key in ("sourceId", "destinationId", "replyId")):
                            raise PublicationStop("Адресат или обсуждение изменились. Открой новую форму.", 409, stop_batch=True)

                        options = {"parse_mode": None, "link_preview": False}
                        if payload["mode"] != "direct":
                            options.update(reply_to=reply_id, send_as=types.InputPeerSelf())
                        sent = await client.send_message(destination, payload["text"], **options)
                        if not sent or not isinstance(sent.id, int) or sent.id <= 0:
                            raise PublicationStop("Telegram не подтвердил отправку. Автоматического повтора нет.", unknown=True)
                        return sent.id
                    except (errors.FloodWaitError, errors.SlowModeWaitError, errors.PeerFloodError) as exc:
                        raise PublicationStop(telegram.error_message(exc), 429) from None
                    except (OSError, TimeoutError) as exc:
                        raise PublicationStop(telegram.error_message(exc), 503, unknown=True) from None
                    finally:
                        await client.disconnect()

                row.message_id = telegram.run(operation())
                row.state = "sent"
        except ValidationError as exc:
            row.state, row.error = "failed", " ".join(exc.messages)[:255]
        except telegram.TelegramFailure as exc:
            uncertain = (isinstance(exc, PublicationStop) and exc.unknown) or isinstance(exc.__context__, (TimeoutError, OSError))
            row.state = "unknown" if uncertain else "failed"
            row.error = str(exc)[:255]
            if isinstance(exc, PublicationStop) and exc.stop_batch:
                batch.cancelled, batch.error = True, row.error
                batch.save(update_fields=["cancelled", "error"])
                batch.deliveries.filter(state="pending").update(state="skipped")
        except Exception:
            row.state, row.error = "unknown", "Результат неизвестен. Повторная отправка запрещена."

        row.save(update_fields=["state", "message_id", "error"])
        skipped = row.state != "sent"
        if skipped:
            skip_sender(batch, row)
            telegram.record(owner, "Публикация не подтверждена", f"{row.account.first_name}: {row.error}", "warning")
        else:
            telegram.record(owner, {"comments": "Комментарий отправлен", "messages": "Сообщение отправлено", "direct": "Личное сообщение отправлено"}[payload["mode"]], f"{row.account.first_name} → {target['title']}", "success")
        return delivery_result(batch, row, skipped=skipped)
