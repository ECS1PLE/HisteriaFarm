import asyncio
import io
import re
from datetime import timedelta
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from telethon import TelegramClient, functions, errors
from telethon.sessions import StringSession
from PIL import Image, ImageOps, UnidentifiedImageError
from .models import Account, LoginAttempt, TelegramSettings, Activity
from .security import encrypt, decrypt, session_lock

class TelegramFailure(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def error_message(exc):
    if isinstance(exc, errors.FloodWaitError):
        return f"Telegram просит подождать {exc.seconds} сек. Повтори после этого срока."
    messages = {
        "PhoneCodeInvalidError": "Неверный код подтверждения.",
        "PhoneCodeExpiredError": "Код истёк. Запроси новый код.",
        "PasswordHashInvalidError": "Неверный пароль двухэтапной проверки.",
        "PhoneNumberInvalidError": "Telegram не принял номер телефона.",
        "PhoneNumberBannedError": "Номер заблокирован Telegram.",
        "UsernameOccupiedError": "Этот username уже занят.",
        "UsernameInvalidError": "Telegram не принял username.",
        "UsernamePurchaseAvailableError": "Этот username доступен только для покупки.",
        "AuthKeyUnregisteredError": "Сессия отозвана. Добавь аккаунт заново.",
        "SessionRevokedError": "Сессия отозвана. Добавь аккаунт заново.",
        "AuthKeyDuplicatedError": "Telegram отозвал сессию из-за параллельного подключения. Добавь аккаунт заново.",
        "UserDeactivatedBanError": "Аккаунт заблокирован Telegram.",
        "ApiIdInvalidError": "Неверные Telegram API ID или API Hash.",
    }
    if isinstance(exc, (TimeoutError, OSError)):
        return "Не удалось подключиться к Telegram. Проверь сеть и повтори."
    return messages.get(type(exc).__name__, "Telegram отклонил операцию. Проверь профиль и повтори позже.")

def credentials(owner):
    row = TelegramSettings.objects.filter(owner=owner).first()
    if row:
        return decrypt(row.credentials)
    if settings.TELEGRAM_API_ID and settings.TELEGRAM_API_HASH:
        return {"apiId": int(settings.TELEGRAM_API_ID), "apiHash": settings.TELEGRAM_API_HASH}
    raise TelegramFailure("Настрой Telegram API ID и API Hash в настройках панели.", 409)

def configured(owner):
    return bool(TelegramSettings.objects.filter(owner=owner).exists() or (settings.TELEGRAM_API_ID and settings.TELEGRAM_API_HASH))

def run(coro):
    try:
        return asyncio.run(asyncio.wait_for(coro, timeout=60))
    except TelegramFailure:
        raise
    except (errors.RPCError, OSError, TimeoutError) as exc:
        raise TelegramFailure(error_message(exc)) from None

def client_for(payload):
    c = payload["credentials"]
    return TelegramClient(StringSession(payload.get("session", "")), c["apiId"], c["apiHash"], connection_retries=1, request_retries=0, flood_sleep_threshold=0, timeout=15)

async def read_profile(client):
    me = await client.get_me()
    if not me:
        raise TelegramFailure("Сессия больше не действительна. Добавь аккаунт заново.", 409)
    full = await client(functions.users.GetFullUserRequest(me))
    avatar = await client.download_profile_photo(me, file=bytes)
    return {
        "telegram_id": me.id, "first_name": me.first_name or "", "last_name": me.last_name or "",
        "username": me.username or "", "bio": full.full_user.about or "", "premium": bool(me.premium),
        "phone": "+" + (me.phone or ""), "avatar": avatar,
    }

def start_login(owner, phone, group):
    phone = "+" + re.sub(r"\D", "", str(phone))
    if not re.fullmatch(r"\+[1-9]\d{6,14}", phone):
        raise ValidationError("Введи номер с кодом страны, например +79991234567.")
    if Account.objects.filter(owner=owner, phone=phone).exclude(status="error").exists():
        raise ValidationError("Этот аккаунт уже добавлен.")
    LoginAttempt.objects.filter(expires__lt=timezone.now()).delete()
    if LoginAttempt.objects.filter(owner=owner).count() >= 3:
        raise ValidationError("Заверши или закрой предыдущие попытки входа.")
    payload = {"credentials": credentials(owner), "phone": phone, "group": str(group).strip()[:64] or "Основная"}
    async def operation():
        client = client_for(payload)
        try:
            await client.connect()
            sent = await client.send_code_request(phone)
            payload.update(session=client.session.save(), hash=sent.phone_code_hash)
            return type(sent.type).__name__
        finally:
            await client.disconnect()
    delivery = run(operation())
    row = LoginAttempt.objects.create(owner=owner, payload=encrypt(payload), expires=timezone.now() + timedelta(minutes=10))
    return {"attemptId": str(row.id), "step": "code", "delivery": delivery, "expiresAt": row.expires.isoformat()}

def finish_login(owner, attempt_id, code="", password=""):
    with session_lock(f"auth-{attempt_id}"):
        row = LoginAttempt.objects.filter(pk=attempt_id, owner=owner).first()
        if not row or row.expires < timezone.now():
            if row:
                row.delete()
            raise TelegramFailure("Попытка входа истекла. Запроси новый код.", 410)
        payload = decrypt(row.payload)
        async def operation():
            client = client_for(payload)
            try:
                await client.connect()
                if payload.get("passwordRequired"):
                    if not password:
                        raise ValidationError("Введи пароль двухэтапной проверки.")
                    await client.sign_in(password=password)
                else:
                    if not re.fullmatch(r"\d{4,8}", str(code)):
                        raise ValidationError("Введи код из сообщения Telegram.")
                    try:
                        await client.sign_in(phone=payload["phone"], code=code, phone_code_hash=payload["hash"])
                    except errors.SessionPasswordNeededError:
                        payload.update(passwordRequired=True, session=client.session.save())
                        return None
                profile = await read_profile(client)
                payload["session"] = client.session.save()
                return profile
            finally:
                await client.disconnect()
        profile = run(operation())
        if profile is None:
            row.payload = encrypt(payload)
            row.save(update_fields=["payload"])
            return None
        existing = Account.objects.filter(telegram_id=profile["telegram_id"]).first()
        if existing and existing.owner_id != owner.pk:
            row.delete()
            raise TelegramFailure("Аккаунт уже подключён к другому пользователю панели.", 409)
        account, _ = Account.objects.update_or_create(telegram_id=profile["telegram_id"], defaults={
            **profile, "owner": owner, "group": payload["group"], "session": encrypt({"credentials": payload["credentials"], "session": payload["session"]}), "status": "ready", "error": "",
        })
        row.delete()
        record(owner, "Аккаунт подключён", account.first_name, "success")
        return account

def record(owner, title, detail, type="info"):
    Activity.objects.create(owner=owner, title=title, detail=detail[:255], type=type)

def normalize_avatar(upload):
    if upload.size > 5 * 1024 * 1024:
        raise ValidationError("Аватарка должна быть меньше 5 МБ.")
    try:
        raw = upload.read()
        with Image.open(io.BytesIO(raw)) as img:
            if img.format not in ("JPEG", "PNG", "WEBP") or img.width * img.height > 20_000_000:
                raise ValidationError("Нужна PNG, JPEG или WebP до 20 мегапикселей.")
            img = ImageOps.exif_transpose(img)
            img = ImageOps.fit(img.convert("RGB"), (640, 640))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=90)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError("Файл не является допустимым изображением.") from None

def validate_profile(data, account):
    first = str(data.get("firstName", account.first_name)).strip()
    last = str(data.get("lastName", account.last_name)).strip()
    username = str(data.get("username", account.username)).strip().removeprefix("@")
    bio = str(data.get("bio", account.bio)).strip()
    if not first or len(first) > 64 or len(last) > 64:
        raise ValidationError("Имя обязательно; имя и фамилия - до 64 символов.")
    if username and not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", username):
        raise ValidationError("Username: 5–32 символа, латиница, цифры и подчёркивание.")
    if len(bio) > (140 if account.premium else 70):
        raise ValidationError("Описание слишком длинное для этого аккаунта.")
    return first, last, username, bio

def update_account(account, data=None, avatar=None):
    values = validate_profile(data or {}, account)
    errors_list = []
    with session_lock(account.id):
        payload = decrypt(account.session)
        async def operation():
            client = client_for(payload)
            try:
                await client.connect()
                if not await client.is_user_authorized():
                    raise TelegramFailure("Сессия отозвана. Добавь аккаунт заново.", 409)
                if data is not None:
                    first, last, username, bio = values
                    operations = []
                    if (first, last, bio) != (account.first_name, account.last_name, account.bio):
                        operations.append(("Имя и описание", functions.account.UpdateProfileRequest(first_name=first, last_name=last, about=bio)))
                    if username != account.username:
                        operations.append(("Username", functions.account.UpdateUsernameRequest(username)))
                    for label, request in operations:
                        try:
                            await client(request)
                        except errors.RPCError as exc:
                            errors_list.append(f"{label}: {error_message(exc)}")
                            if isinstance(exc, errors.FloodWaitError):
                                break
                    if avatar and not errors_list:
                        try:
                            f = io.BytesIO(avatar)
                            f.name = "profile.jpg"
                            await client(functions.photos.UploadProfilePhotoRequest(file=await client.upload_file(f)))
                        except errors.RPCError as exc:
                            errors_list.append(f"Аватарка: {error_message(exc)}")
                    elif avatar:
                        errors_list.append("Аватарка не изменена: сначала исправь ошибки профиля.")
                return await read_profile(client)
            finally:
                await client.disconnect()
        try:
            profile = run(operation())
        except TelegramFailure as exc:
            account.status = "error"
            account.error = str(exc)
            account.save(update_fields=["status", "error", "last_active"])
            record(account.owner, "Ошибка подключения", str(exc), "warning")
            raise
        for key, value in profile.items():
            setattr(account, key, value)
        account.status = "ready"
        account.error = "; ".join(errors_list)[:255]
        account.save()
    record(account.owner, "Профиль обновлён" if data is not None else "Аккаунт проверен", account.first_name + (" · есть ошибки" if errors_list else ""), "warning" if errors_list else "success")
    return errors_list
