"""Interactive reporting from exactly one owned Telegram session."""
import re
from datetime import timedelta
from urllib.parse import urlsplit
from django.core.exceptions import ValidationError
from django.utils import timezone
from telethon import functions, types
from . import telegram
from .models import ReportDraft
from .security import decrypt, encrypt, session_lock

REASONS = {
    "spam": ("Спам", types.InputReportReasonSpam),
    "violence": ("Насилие", types.InputReportReasonViolence),
    "pornography": ("Порнография", types.InputReportReasonPornography),
    "child_abuse": ("Насилие над детьми", types.InputReportReasonChildAbuse),
    "copyright": ("Нарушение авторских прав", types.InputReportReasonCopyright),
    "fake": ("Выдаёт себя за другого", types.InputReportReasonFake),
    "illegal_drugs": ("Незаконные наркотики", types.InputReportReasonIllegalDrugs),
    "personal_details": ("Публикация личных данных", types.InputReportReasonPersonalDetails),
    "geo_irrelevant": ("Неверная геолокация группы", types.InputReportReasonGeoIrrelevant),
    "other": ("Другое", types.InputReportReasonOther),
}

def text(data, key):
    value = data.get(key, "")
    if not isinstance(value, str):
        raise ValidationError("Поля жалобы должны содержать текст.")
    return value.strip()

def comment(data):
    value = text(data, "message")
    if len(value) > 1000:
        raise ValidationError("Пояснение — до 1000 символов.")
    return value

def target(data):
    kind, raw = text(data, "kind"), text(data, "target")
    if not raw or len(raw) > 512:
        raise ValidationError("Укажи username или ссылку длиной до 512 символов.")
    if kind not in ("peer", "message"):
        raise ValidationError("Выбери аккаунт/чат или сообщение.")
    peer, message_id = None, None
    if re.fullmatch(r"@?[A-Za-z][A-Za-z0-9_]{0,31}", raw):
        peer = "@" + raw.removeprefix("@")
    else:
        url = urlsplit(raw if "://" in raw else "https://" + raw)
        if url.scheme not in ("http", "https") or url.netloc.lower() not in ("t.me", "telegram.me") or url.fragment or url.query not in ("", "single"):
            raise ValidationError("Нужен @username или прямая ссылка t.me на аккаунт/сообщение; ссылки на комментарии не поддерживаются.")
        path = url.path.strip("/")
        match = re.fullmatch(r"(?:s/)?([A-Za-z][A-Za-z0-9_]{0,31})(?:/(\d+))?(?:/(\d+))?", path)
        private = re.fullmatch(r"c/([1-9]\d*)(?:/(\d+))?(?:/(\d+))?", path)
        if private:
            peer = int("-100" + private[1])
            message_id = private[3] or private[2]
        elif match and match[1] not in ("joinchat", "addstickers", "share", "proxy", "socks", "login", "boost"):
            peer = "@" + match[1]
            message_id = match[3] or match[2]
        else:
            raise ValidationError("Ссылка не указывает на аккаунт или сообщение Telegram.")
    if kind == "peer" and (message_id or isinstance(peer, int)):
        raise ValidationError("Для жалобы на сообщение выбери тип «Сообщение».")
    if kind == "message":
        manual_id = text(data, "messageId")
        if manual_id and message_id and manual_id != message_id:
            raise ValidationError("ID сообщения не совпадает со ссылкой.")
        message_id = message_id or manual_id
        if not message_id or not re.fullmatch(r"[1-9]\d{0,9}", message_id) or int(message_id) > 2147483647:
            raise ValidationError("Укажи ссылку на сообщение или username чата и положительный ID сообщения.")
        message_id = int(message_id)
    return {"kind": kind, "target": raw, "peer": peer, "messageId": message_id}

def serialize(draft, payload=None):
    payload = payload or decrypt(draft.payload)
    return {"id": str(draft.id), "state": draft.state, "target": payload["target"], "kind": payload["kind"],
        "title": payload.get("title", "Подтверждение жалобы"), "options": payload.get("options", []),
        "commentRequired": payload.get("commentRequired", False),
        "selectedReasons": payload.get("selectedReasons", []),
        "reason": REASONS[payload["reason"]][0] if payload.get("reason") else "", "expiresAt": draft.expires.isoformat()}

def prepare(account, data):
    if account.status != "ready":
        raise ValidationError("Для жалобы нужен готовый аккаунт. Сначала проверь его в Telegram.")
    payload = {**target(data), "message": comment(data)}
    if payload["kind"] == "peer":
        reason = text(data, "reason")
        if reason not in REASONS:
            raise ValidationError("Выбери причину жалобы.")
        if reason == "other" and not payload["message"]:
            raise ValidationError("Для причины «Другое» опиши нарушение.")
        payload["reason"] = reason
    draft = ReportDraft.objects.create(account=account, payload=encrypt(payload), expires=timezone.now() + timedelta(minutes=15))
    return serialize(draft, payload)

def advance(draft, data):
    if data.get("confirmed") is not True:
        raise ValidationError("Подтверди отправку жалобы с выбранного аккаунта.")
    with session_lock(draft.account_id):
        draft.refresh_from_db()
        if draft.expires <= timezone.now():
            raise telegram.TelegramFailure("Форма жалобы истекла. Открой новую.", 410)
        if draft.state not in ("confirm", "choose", "comment"):
            raise telegram.TelegramFailure("Эта попытка уже завершена или её результат неизвестен. Повторная отправка запрещена.", 409)
        account = draft.account
        if account.status != "ready":
            raise ValidationError("Аккаунт не готов. Сначала проверь его в Telegram.")
        payload = decrypt(draft.payload)
        option, message = b"", ""
        if draft.state == "choose":
            chosen = text(data, "option")
            if chosen not in [item["value"] for item in payload["options"]]:
                raise ValidationError("Выбери одну из причин, предложенных Telegram.")
            option = bytes.fromhex(chosen)
            payload.setdefault("selectedReasons", []).append(next(item["label"] for item in payload["options"] if item["value"] == chosen))
        elif draft.state == "comment":
            message = comment(data)
            if payload["commentRequired"] and not message:
                raise ValidationError("Telegram требует пояснение к жалобе.")
            option = bytes.fromhex(payload["option"])
        draft.state = "submitting"
        draft.save(update_fields=["state"])

        async def operation():
            client = telegram.client_for(decrypt(account.session))
            try:
                await client.connect()
                if not await client.is_user_authorized():
                    raise telegram.TelegramFailure("Сессия отозвана. Добавь аккаунт заново.", 409)
                try:
                    if payload.get("resolvedPeer"):
                        saved = dict(payload["resolvedPeer"])
                        constructor = saved.pop("_")
                        peer = getattr(types, constructor)(**saved)
                    else:
                        if isinstance(payload["peer"], int):
                            # StringSession does not persist an entity cache. Load accessible dialogs.
                            await client.get_dialogs()
                        peer = await client.get_input_entity(payload["peer"])
                        if not isinstance(peer, (types.InputPeerUser, types.InputPeerChannel, types.InputPeerChat)):
                            raise telegram.TelegramFailure("Этот тип цели не поддерживает жалобу в панели.")
                        # Bind all later steps to the same entity even if its username changes.
                        payload["resolvedPeer"] = peer.to_dict()
                except ValueError:
                    raise telegram.TelegramFailure("Цель недоступна этому аккаунту. Проверь username и доступ к чату.") from None
                if payload["kind"] == "peer":
                    return await client(functions.account.ReportPeerRequest(peer=peer, reason=REASONS[payload["reason"]][1](), message=payload["message"]))
                found = await client.get_messages(peer, ids=payload["messageId"])
                if not found or isinstance(found, types.MessageEmpty):
                    raise telegram.TelegramFailure("Сообщение не найдено или недоступно этому аккаунту.")
                return await client(functions.messages.ReportRequest(peer=peer, id=[payload["messageId"]], option=option, message=message))
            finally:
                await client.disconnect()

        try:
            result = telegram.run(operation())
            if payload["kind"] == "peer":
                if result is not True:
                    raise telegram.TelegramFailure("Telegram не подтвердил приём жалобы.")
                draft.state = "reported"
            elif isinstance(result, types.ReportResultReported):
                draft.state = "reported"
            elif isinstance(result, types.ReportResultChooseOption):
                draft.state = "choose"
                payload.update(title=result.title, options=[{"label": item.text, "value": item.option.hex()} for item in result.options])
                if not payload["options"]:
                    raise telegram.TelegramFailure("Telegram не вернул доступных причин жалобы.")
            elif isinstance(result, types.ReportResultAddComment):
                draft.state = "comment"
                payload.update(option=result.option.hex(), commentRequired=not bool(result.optional), title="Пояснение для модераторов")
            else:
                raise telegram.TelegramFailure("Неожиданный ответ Telegram. Приём жалобы не подтверждён.")
        except Exception:
            # Persist before re-raising: a timeout/crash must never cause automatic replay.
            draft.state = "failed"
            draft.save(update_fields=["state"])
            raise
        draft.payload = encrypt(payload)
        draft.save(update_fields=["state", "payload"])
        if draft.state == "reported":
            telegram.record(account.owner, "Жалоба принята Telegram", f"{account.first_name} → {payload['target']}", "success")
        return serialize(draft, payload)
