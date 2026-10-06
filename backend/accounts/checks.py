"""Explicit, owner-scoped session and official SpamBot checks."""
import asyncio
import re
from contextlib import suppress
from datetime import timedelta

from cryptography.fernet import InvalidToken
from django.core.exceptions import ValidationError
from django.utils import timezone
from telethon import errors

from . import telegram
from .security import decrypt, session_lock


INVALID_SESSION_ERRORS = {
    "AuthKeyUnregisteredError", "SessionRevokedError", "AuthKeyDuplicatedError",
    "UserDeactivatedError", "UserDeactivatedBanError", "SessionExpiredError",
}


def spam_status(text):
    normalized = " ".join(text.casefold().split())
    if any(phrase in normalized for phrase in (
        "no limits are currently applied to your account",
        "your account is free from any restrictions",
        "на ваш аккаунт не наложено никаких ограничений",
        "ваш аккаунт свободен от каких-либо ограничений",
    )):
        return "clear"
    if any(phrase in normalized for phrase in (
        "your account is now limited", "your account is limited",
        "your account has been limited", "your account was limited",
        "your account has been blocked", "your account is frozen",
        "ваш аккаунт ограничен", "ваш аккаунт был ограничен",
        "ваш аккаунт временно ограничен", "ваш аккаунт заблокирован",
    )) or re.search(r"на ваш аккаунт (?:были |временно )?наложены ограничения", normalized):
        return "restricted"
    return "unknown"


async def ask_spambot(client):
    bot = await client.get_entity("SpamBot")
    if not bot.bot or (bot.username or "").casefold() != "spambot":
        raise telegram.TelegramFailure("Не удалось подтвердить официальный @SpamBot.")
    async with client.conversation(bot, timeout=20, total_timeout=25, max_messages=10) as conversation:
        sent = await conversation.send_message("/start")
        reply = await conversation.get_response(sent)
        text = reply.raw_text or ""
        return spam_status(text), text[:4096] or "@SpamBot вернул ответ без текста."


def check_account(account, kind):
    if kind not in ("session", "spam", "all"):
        raise ValidationError("Выбери проверку сессии, спамблока или обе проверки.")
    issues = []
    with session_lock(account.pk):
        # Read inside the lock so another check's FloodWait is respected.
        account.refresh_from_db()
        if account.check_retry_at and account.check_retry_at > timezone.now():
            raise telegram.TelegramFailure(
                "Telegram просит подождать. Следующая проверка доступна после "
                + timezone.localtime(account.check_retry_at).strftime("%d.%m %H:%M:%S") + ".", 429,
            )
        now = timezone.now()
        account.check_retry_at = None
        session_verified = False

        async def operation():
            nonlocal session_verified
            try:
                payload = decrypt(account.session)
                client = telegram.client_for(payload)
            except (InvalidToken, ValueError, KeyError, TypeError, AttributeError):
                account.session_status = "invalid"
                account.session_checked_at = timezone.now()
                account.session_error = "Сохранённая сессия повреждена. Добавь аккаунт заново."
                issues.append(account.session_error)
                return
            stage = "session"
            try:
                await client.connect()
                authorized = await client.is_user_authorized()
                me = await client.get_me() if authorized else None
                account.session_checked_at = timezone.now()
                if not me or getattr(me, "deleted", False) or me.id != account.telegram_id:
                    account.session_status = "invalid"
                    account.session_error = "Сессия отозвана или не принадлежит этому аккаунту. Добавь аккаунт заново."
                    issues.append(account.session_error)
                    return
                account.session_status, account.session_error = "valid", ""
                session_verified = True
                if kind in ("spam", "all"):
                    stage = "spam"
                    account.spam_status, account.spam_detail = await ask_spambot(client)
                    account.spam_checked_at = timezone.now()
            except Exception as exc:
                detail = str(exc) if isinstance(exc, telegram.TelegramFailure) else telegram.error_message(exc)
                issues.append(detail)
                if type(exc).__name__ in INVALID_SESSION_ERRORS:
                    account.session_status, account.session_error = "invalid", detail
                    account.session_checked_at = timezone.now()
                elif stage == "session":
                    account.session_status, account.session_error = "error", detail
                    account.session_checked_at = timezone.now()
                if stage == "spam":
                    account.spam_status, account.spam_detail = "error", detail
                    account.spam_checked_at = timezone.now()
                if isinstance(exc, errors.FloodWaitError):
                    account.check_retry_at = timezone.now() + timedelta(seconds=exc.seconds)
            finally:
                with suppress(errors.RPCError, OSError, TimeoutError):
                    await client.disconnect()

        # Bound connection + bot wait; persist a timeout without declaring a revoked session.
        try:
            asyncio.run(asyncio.wait_for(operation(), timeout=55))
        except TimeoutError:
            detail = "Проверка не завершилась вовремя. Повтори позже."
            issues.append(detail)
            if session_verified and kind in ("spam", "all"):
                account.spam_status, account.spam_detail, account.spam_checked_at = "error", detail, timezone.now()
            else:
                account.session_status, account.session_error, account.session_checked_at = "error", detail, timezone.now()
        if account.session_status == "invalid":
            account.status, account.error = "error", account.session_error
            if kind in ("spam", "all"):
                account.spam_status, account.spam_detail, account.spam_checked_at = "unknown", "Спамблок не проверен: сессия недействительна.", now
        elif account.session_status == "valid":
            account.status, account.error = "ready", ""
        account.save(update_fields=[
            "session_status", "session_checked_at", "session_error", "spam_status",
            "spam_checked_at", "spam_detail", "check_retry_at", "status", "error",
        ])
    telegram.record(account.owner, "Проверка аккаунта", f"{account.first_name} · сессия: {account.session_status}" + (f" · спамблок: {account.spam_status}" if kind != "session" else ""), "warning" if issues or account.spam_status == "restricted" else "info")
    return issues
