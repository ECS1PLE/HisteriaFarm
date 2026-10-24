import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors

from .models import Account
from .security import encrypt, session_lock
from .tests import FakeClient


class BotConversation:
    def __init__(self, client):
        self.client = client

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def send_message(self, text):
        self.client.sent.append(text)
        return SimpleNamespace(id=42)

    async def get_response(self, sent):
        if self.client.bot_error:
            raise self.client.bot_error
        return SimpleNamespace(raw_text=self.client.reply)


class CheckClient(FakeClient):
    def __init__(self, reply="Good news, no limits are currently applied to your account."):
        super().__init__()
        self.reply = reply
        self.sent = []
        self.bot_error = None
        self.bot = SimpleNamespace(bot=True, username="SpamBot")

    async def get_entity(self, entity):
        assert entity == "SpamBot"
        return self.bot

    def conversation(self, bot, **kwargs):
        assert bot is self.bot
        return BotConversation(self)


class AccountCheckTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="check-owner")
        self.client.force_login(self.owner)
        self.account = Account.objects.create(owner=self.owner, telegram_id=12345, first_name="Анна", phone="+79991234567", session=encrypt({"credentials": {"apiId": 123, "apiHash": "a" * 32}, "session": "private-session"}))
        self.url = f"/api/accounts/{self.account.pk}/check/"

    def check(self, kind="all", fake=None):
        fake = fake or CheckClient()
        with patch("accounts.telegram.client_for", return_value=fake):
            response = self.client.post(self.url, json.dumps({"kind": kind}), content_type="application/json")
        self.assertTrue(fake.disconnected)
        return response

    def test_session_check_is_read_only_and_result_survives_reload(self):
        fake = CheckClient()
        result = self.check("session", fake).json()
        self.assertEqual(result["account"]["sessionStatus"], "valid")
        self.assertEqual(result["account"]["spamStatus"], "unchecked")
        self.assertEqual(fake.sent, [])
        self.assertEqual(fake.requests, [])
        self.assertEqual(result["account"]["sessionStatus"], self.client.get("/api/workspace/").json()["accounts"][0]["sessionStatus"])
        self.assertNotIn("private-session", json.dumps(result))
        self.assertNotIn("apiHash", json.dumps(result))

    def test_spambot_results_preserve_reply_and_only_send_start(self):
        for reply, status in [
            ("Good news, no limits are currently applied to your account.", "clear"),
            ("Ваш аккаунт временно ограничен до 12 октября.", "restricted"),
            ("Your account is now limited until 12 Oct 2026.", "restricted"),
            ("На Ваш аккаунт не наложено никаких ограничений.", "clear"),
            ("Welcome! Here is a new response we don't recognize.", "unknown"),
        ]:
            with self.subTest(status=status, reply=reply):
                fake = CheckClient(reply)
                result = self.check("spam", fake).json()["account"]
                self.assertEqual(result["spamStatus"], status)
                self.assertEqual(result["spamDetail"], reply)
                self.assertEqual(result["sessionStatus"], "valid")
                self.assertTrue(result["spamCheckedAt"])
                self.assertEqual(fake.sent, ["/start"])

    def test_revoked_or_mismatched_session_does_not_contact_bot(self):
        for authorized, identity in [(False, 12345), (True, 99999)]:
            fake = CheckClient()
            fake.is_user_authorized = AsyncMock(return_value=authorized)
            fake.me.id = identity
            result = self.check("all", fake).json()
            self.assertEqual(result["account"]["sessionStatus"], "invalid")
            self.assertEqual(result["account"]["status"], "error")
            self.assertEqual(result["account"]["spamStatus"], "unknown")
            self.assertTrue(result["errors"])
            self.assertEqual(fake.sent, [])

    def test_transport_error_is_not_a_revoked_session_and_recovers(self):
        fake = CheckClient()
        fake.connect = AsyncMock(side_effect=OSError("private-detail"))
        result = self.check("session", fake).json()
        self.assertEqual(result["account"]["sessionStatus"], "error")
        self.assertNotIn("private-detail", json.dumps(result))
        self.assertEqual(self.check("session").json()["account"]["sessionStatus"], "valid")

    def test_rpc_revocation_is_persisted(self):
        fake = CheckClient()
        fake.connect = AsyncMock(side_effect=errors.SessionRevokedError(None))
        self.assertEqual(self.check("session", fake).json()["account"]["sessionStatus"], "invalid")

    def test_bot_timeout_keeps_valid_session_and_does_not_keep_old_clear_result(self):
        self.check("spam")
        fake = CheckClient()
        fake.bot_error = TimeoutError()
        result = self.check("spam", fake).json()["account"]
        self.assertEqual(result["sessionStatus"], "valid")
        self.assertEqual(result["spamStatus"], "error")

    def test_floodwait_is_persisted_and_blocks_following_checks(self):
        fake = CheckClient()
        fake.bot_error = errors.FloodWaitError(None, capture=7200)
        result = self.check("spam", fake).json()["account"]
        self.assertTrue(result["checkRetryAt"])
        self.account.refresh_from_db()
        self.assertGreater(self.account.check_retry_at, timezone.now() + timedelta(seconds=7198))
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.client.post(self.url, '{}', content_type="application/json").status_code, 429)
            factory.assert_not_called()

    def test_unverified_bot_is_not_contacted(self):
        fake = CheckClient()
        fake.bot.username = "FakeBot"
        result = self.check("spam", fake).json()["account"]
        self.assertEqual(result["spamStatus"], "error")
        self.assertEqual(fake.sent, [])

    def test_corrupted_session_is_not_exposed(self):
        self.account.session = "private-corrupted-session"
        self.account.save()
        result = self.client.post(self.url, '{}', content_type="application/json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["account"]["sessionStatus"], "invalid")
        self.assertNotIn("private-corrupted-session", result.content.decode())

    def test_ownership_csrf_and_validation(self):
        foreign = get_user_model().objects.create_user(username="check-other")
        self.client.force_login(foreign)
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.client.post(self.url, '{}', content_type="application/json").status_code, 404)
            factory.assert_not_called()
        self.client.logout()
        self.assertEqual(self.client.post(self.url, '{}', content_type="application/json").status_code, 401)
        self.client.force_login(self.owner)
        self.assertEqual(self.client.post(self.url, '{"kind":"bad"}', content_type="application/json").status_code, 400)
        with session_lock(self.account.pk), patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.client.post(self.url, '{}', content_type="application/json").status_code, 400)
            factory.assert_not_called()
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(browser.post(self.url, '{}', content_type="application/json").status_code, 403)
        token = browser.get("/api/status/").json()["csrfToken"]
        with patch("accounts.telegram.client_for", return_value=CheckClient()):
            self.assertEqual(browser.post(self.url, '{"kind":"session"}', content_type="application/json", HTTP_X_CSRFTOKEN=token).status_code, 200)
