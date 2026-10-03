import json
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors, functions, types
from .models import Account, Activity, ReportDraft
from .security import decrypt, encrypt, session_lock
from .tests import FakeClient

class ReportingClient(FakeClient):
    def __init__(self, results=None):
        super().__init__()
        self.results = list(results if results is not None else [True])
        self.peer = types.InputPeerUser(54321, 67890)
        self.found = types.Message(id=123, peer_id=types.PeerUser(54321), message="Сообщение")
        self.dialogs_loaded = False

    async def get_input_entity(self, value):
        self.resolved = value
        return self.peer

    async def get_dialogs(self):
        self.dialogs_loaded = True
        return []

    async def get_messages(self, peer, ids):
        self.message_id = ids
        return self.found

    async def __call__(self, request):
        self.requests.append(request)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

class ReportTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username="report-owner")
        self.other = users.objects.create_user(username="report-other")
        self.client.force_login(self.owner)
        self.account = Account.objects.create(owner=self.owner, telegram_id=12345, first_name="Анна", phone="+79991234567", session=encrypt({"session": "private-session", "credentials": {"apiId": 123, "apiHash": "a" * 32}}))
        self.url = f"/api/accounts/{self.account.id}/report/"
        self.peer_data = {"kind": "peer", "target": "@reported_user", "reason": "spam", "message": "Нежелательная реклама"}

    def post(self, url, data):
        return self.client.post(url, json.dumps(data), content_type="application/json")

    def prepare(self, data=None):
        response = self.post(self.url, data or self.peer_data)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["report"]

    def submit(self, report, **data):
        return self.post(self.url + report["id"] + "/", {"confirmed": True, **data})

    def test_prepare_is_local_and_payload_is_encrypted(self):
        with patch("accounts.telegram.client_for") as factory:
            report = self.prepare()
            factory.assert_not_called()
        draft = ReportDraft.objects.get(pk=report["id"])
        self.assertNotIn("Нежелательная реклама", draft.payload)
        self.assertEqual(decrypt(draft.payload)["peer"], "@reported_user")
        self.assertEqual(report["state"], "confirm")
        self.assertNotIn("private-session", json.dumps(report))

    def test_peer_report_confirmation_and_single_session(self):
        extra = Account.objects.create(owner=self.owner, telegram_id=999, first_name="Другой", phone="+79990000000", session=self.account.session)
        report = self.prepare()
        fake = ReportingClient()
        with patch("accounts.telegram.client_for", return_value=fake) as factory:
            for confirmed in (None, False, "true", 1):
                response = self.post(self.url + report["id"] + "/", {"confirmed": confirmed})
                self.assertEqual(response.status_code, 400)
            factory.assert_not_called()
            response = self.submit(report)
            self.assertEqual(response.json()["report"]["state"], "reported")
            factory.assert_called_once()
            self.assertEqual(self.submit(report).status_code, 409)
        self.assertEqual(len(fake.requests), 1)
        request = fake.requests[0]
        self.assertIsInstance(request, functions.account.ReportPeerRequest)
        self.assertIsInstance(request.reason, types.InputReportReasonSpam)
        self.assertEqual(request.message, self.peer_data["message"])
        self.assertTrue(fake.disconnected)
        self.assertEqual(Activity.objects.filter(title="Жалоба принята Telegram").count(), 1)
        self.assertFalse(ReportDraft.objects.filter(account=extra).exists())

    def test_dynamic_nested_reasons_and_required_comment(self):
        fake = ReportingClient([
            types.ReportResultChooseOption("Причина", [types.MessageReportOption(text="Спам", option=b"first")]),
            types.ReportResultChooseOption("Уточнение", [types.MessageReportOption(text="Реклама", option=b"second")]),
            types.ReportResultAddComment(b"comment", optional=False),
            types.ReportResultReported(),
        ])
        report = self.prepare({"kind": "message", "target": "https://t.me/news_channel/123"})
        with patch("accounts.telegram.client_for", return_value=fake):
            report = self.submit(report).json()["report"]
            self.assertEqual(report["state"], "choose")
            self.assertEqual(self.submit(report, option="bad").status_code, 400)
            self.assertEqual(len(fake.requests), 1)
            report = self.submit(report, option=b"first".hex()).json()["report"]
            report = self.submit(report, option=b"second".hex()).json()["report"]
            self.assertEqual(report["selectedReasons"], ["Спам", "Реклама"])
            self.assertTrue(report["commentRequired"])
            self.assertEqual(self.submit(report, message=" ").status_code, 400)
            self.assertEqual(self.submit(report, message="Подробности нарушения").json()["report"]["state"], "reported")
        self.assertEqual([r.option for r in fake.requests], [b"", b"first", b"second", b"comment"])
        self.assertEqual(fake.requests[-1].message, "Подробности нарушения")
        self.assertTrue(all(r.id == [123] for r in fake.requests))
        self.assertTrue(fake.disconnected)

    def test_optional_comment_can_be_empty(self):
        report = self.prepare({"kind": "message", "target": "@news_channel", "messageId": "42"})
        fake = ReportingClient([types.ReportResultAddComment(b"next", optional=True), types.ReportResultReported()])
        with patch("accounts.telegram.client_for", return_value=fake):
            report = self.submit(report).json()["report"]
            self.assertFalse(report["commentRequired"])
            self.assertEqual(self.submit(report, message="").json()["report"]["state"], "reported")
        self.assertEqual(fake.requests[-1].message, "")

    def test_terminal_reason_may_finish_without_comment(self):
        fake = ReportingClient([types.ReportResultChooseOption("Причина", [types.MessageReportOption(text="Спам", option=b"spam")]), types.ReportResultReported()])
        report = self.prepare({"kind": "message", "target": "https://t.me/s/news_channel/123"})
        with patch("accounts.telegram.client_for", return_value=fake):
            report = self.submit(report).json()["report"]
            self.assertEqual(self.submit(report, option=b"spam".hex()).json()["report"]["state"], "reported")

    def test_username_change_does_not_change_reported_peer(self):
        report = self.prepare({"kind": "message", "target": "https://t.me/news_channel/123"})
        fake = ReportingClient([types.ReportResultChooseOption("Причина", [types.MessageReportOption(text="Спам", option=b"spam")]), types.ReportResultReported()])
        with patch("accounts.telegram.client_for", return_value=fake):
            report = self.submit(report).json()["report"]
            fake.peer = types.InputPeerUser(99999, 11111)
            self.assertEqual(self.submit(report, option=b"spam".hex()).status_code, 200)
        self.assertEqual([request.peer.user_id for request in fake.requests], [54321, 54321])

    def test_private_topic_link_resolves_accessible_dialogs(self):
        report = self.prepare({"kind": "message", "target": "https://t.me/c/54321/7/123"})
        fake = ReportingClient([types.ReportResultReported()])
        with patch("accounts.telegram.client_for", return_value=fake):
            self.assertEqual(self.submit(report).status_code, 200)
        self.assertTrue(fake.dialogs_loaded)
        self.assertEqual(fake.resolved, -10054321)
        self.assertEqual(fake.message_id, 123)

    def test_missing_message_never_reports(self):
        report = self.prepare({"kind": "message", "target": "https://t.me/news_channel/123"})
        fake = ReportingClient()
        fake.found = types.MessageEmpty(id=123, peer_id=types.PeerUser(54321))
        with patch("accounts.telegram.client_for", return_value=fake):
            response = self.submit(report)
        self.assertEqual(response.status_code, 400)
        self.assertIn("не найдено", response.json()["error"])
        self.assertEqual(fake.requests, [])
        self.assertTrue(fake.disconnected)

    def test_rejected_or_unknown_result_cannot_be_replayed(self):
        for result in (False, types.ReportResultChooseOption("Пусто", []), TimeoutError(), errors.FloodWaitError(None, capture=30)):
            report = self.prepare()
            fake = ReportingClient([result])
            with patch("accounts.telegram.client_for", return_value=fake):
                self.assertEqual(self.submit(report).status_code, 400)
                self.assertEqual(self.submit(report).status_code, 409)
            self.assertTrue(fake.disconnected)
            self.assertEqual(ReportDraft.objects.get(pk=report["id"]).state, "failed")
        self.assertFalse(Activity.objects.filter(title="Жалоба принята Telegram").exists())

    def test_access_expiry_and_lock_prevent_remote_calls(self):
        report = self.prepare()
        with patch("accounts.telegram.client_for") as factory:
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(self.url).status_code, 404)
            self.assertEqual(self.post(self.url, self.peer_data).status_code, 404)
            self.assertEqual(self.submit(report).status_code, 404)
            self.client.force_login(self.owner)
            with session_lock(self.account.id):
                self.assertEqual(self.submit(report).status_code, 400)
            ReportDraft.objects.filter(pk=report["id"]).update(expires=timezone.now() - timedelta(seconds=1))
            self.assertEqual(self.submit(report).status_code, 410)
            factory.assert_not_called()

    def test_validation_prevents_remote_calls(self):
        cases = [
            {**self.peer_data, "reason": "invented"},
            {**self.peer_data, "reason": "other", "message": ""},
            {**self.peer_data, "message": "a" * 1001},
            {**self.peer_data, "target": "https://evil.example/user"},
            {**self.peer_data, "target": "https://t.me/news_channel/123"},
            {"kind": "message", "target": "https://t.me/news_channel/123?comment=456"},
            {"kind": "message", "target": "https://t.me/news_channel/123", "messageId": "456"},
            {"kind": "message", "target": "@news_channel", "messageId": "0"},
            {"kind": "message", "target": "@news_channel", "messageId": "2147483648"},
            {"kind": "message", "target": "https://t.me/+invite"},
            {"kind": "message", "target": "@news_channel"},
        ]
        with patch("accounts.telegram.client_for") as factory:
            for data in cases:
                with self.subTest(data=data):
                    self.assertEqual(self.post(self.url, data).status_code, 400)
            self.account.status = "error"
            self.account.save()
            self.assertEqual(self.post(self.url, self.peer_data).status_code, 400)
            factory.assert_not_called()
        self.assertFalse(ReportDraft.objects.exists())

    def test_reporting_requires_authentication_and_csrf(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.get(self.url).status_code, 401)
        browser.force_login(self.owner)
        self.assertEqual(browser.post(self.url, json.dumps(self.peer_data), content_type="application/json").status_code, 403)
