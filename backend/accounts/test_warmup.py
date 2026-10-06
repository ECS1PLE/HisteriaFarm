import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, Client
from django.utils import timezone
from telethon import errors

from . import warmup, telegram
from .models import Account, WarmupJob, Activity
from .security import encrypt, session_lock
from .tests import FakeClient


class MessagingClient(FakeClient):
    def __init__(self, recipient_id):
        super().__init__()
        self.recipient_id = recipient_id
        self.sent = []
        self.flood_wait = False

    async def __call__(self, request):
        return SimpleNamespace(users=[SimpleNamespace(id=self.recipient_id, access_hash=123)])

    async def send_message(self, user, text, **kwargs):
        if self.flood_wait:
            raise errors.FloodWaitError(None, capture=120)
        self.sent.append((user.id, text, kwargs))


class WarmupTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="warmup-owner")
        self.other = get_user_model().objects.create_user(username="warmup-other")
        self.client.force_login(self.user)
        payload = encrypt({"session": "test-session", "credentials": {"apiId": 123, "apiHash": "a" * 32}})
        self.accounts = [Account.objects.create(owner=self.user, telegram_id=7000 + i,
            first_name=f"Участник {i}", phone=f"+7999000000{i}", username=f"participant_{i}", session=payload) for i in range(2)]
        self.data = {"accountIds": [str(a.pk) for a in self.accounts], "messages": ["Автосообщение: привет", "Автосообщение: на связи"]}

    def start(self, data=None):
        return self.client.post("/api/warmups/", json.dumps(data or self.data), content_type="application/json")

    def due(self, job):
        job.participants.update(next_message_at=timezone.now() - timedelta(seconds=1))

    def test_start_schedules_every_account_and_workspace_survives_reload(self):
        before = timezone.now()
        response = self.start()
        self.assertEqual(response.status_code, 201)
        job = WarmupJob.objects.get()
        self.assertEqual(job.ends_at - job.started_at, timedelta(hours=24))
        for p in job.participants.all():
            self.assertGreaterEqual(p.next_message_at, before + timedelta(minutes=40))
            self.assertLessEqual(p.next_message_at, timezone.now() + timedelta(minutes=80))
        self.assertEqual(self.client.get("/api/workspace/").json()["warmups"][0]["id"], str(job.pk))
        self.assertEqual(self.start().status_code, 400)

    def test_validation_and_ownership(self):
        foreign = Account.objects.create(owner=self.other, telegram_id=9000, first_name="Другой", phone="+79990000900", session="unused")
        for ids in [[], [self.data["accountIds"][0]], [str(foreign.pk), self.data["accountIds"][0]], ["bad", "ids"], self.data["accountIds"][:1] * 2]:
            self.assertEqual(self.start({**self.data, "accountIds": ids}).status_code, 400)
        for messages in [[], [""], ["a" * 1001], [None], "text"]:
            self.assertEqual(self.start({**self.data, "messages": messages}).status_code, 400)
        self.accounts[0].status = "error"
        self.accounts[0].save()
        self.assertEqual(self.start().status_code, 400)
        self.assertFalse(WarmupJob.objects.exists())

    def test_due_sends_are_not_replayed_and_all_accounts_participate(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        with patch("accounts.warmup.send_message", return_value=True) as send:
            warmup.tick()
            warmup.tick()
            self.assertEqual(send.call_count, 2)
            for sender, recipient, text, deadline in (call.args for call in send.call_args_list):
                self.assertNotEqual(sender.pk, recipient.pk)
                self.assertEqual(sender.owner_id, recipient.owner_id)
                self.assertIn(text, self.data["messages"])
                self.assertEqual(deadline, job.ends_at)
            warmup.tick()
            self.assertEqual(send.call_count, 2)
        self.assertEqual(sum(p.sent for p in job.participants.all()), 2)
        for p in job.participants.all():
            self.assertGreaterEqual((p.next_message_at - timezone.now()).total_seconds(), 2398)
            self.assertLessEqual((p.next_message_at - timezone.now()).total_seconds(), 4800)

    def test_no_first_message_before_its_interval(self):
        self.start()
        with patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()

    def test_stop_and_end_deadline_prevent_sending(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(f"/api/warmups/{job.pk}/stop/").status_code, 404)
        self.assertEqual(self.client.get("/api/workspace/").json()["warmups"], [])
        self.client.force_login(self.user)
        self.assertEqual(self.client.post(f"/api/warmups/{job.pk}/stop/").status_code, 200)
        with patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()
        self.start()
        current = WarmupJob.objects.get(status="running")
        current.ends_at = timezone.now() - timedelta(seconds=1)
        current.save()
        with patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()
        current.refresh_from_db()
        self.assertEqual(current.status, "completed")

    def test_telegram_failure_continues_to_next_account_without_immediate_retry(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        with patch("accounts.warmup.send_message", side_effect=[telegram.TelegramFailure("Telegram просит подождать 7200 сек.", retry_after=7200), True]) as send:
            warmup.tick()
            warmup.tick()
            self.assertEqual(send.call_count, 2)
        job.refresh_from_db()
        self.assertEqual(job.status, "running")
        participants = list(job.participants.order_by("id"))
        self.assertEqual(participants[0].failures, 1)
        self.assertIn("7200", participants[0].error)
        self.assertGreaterEqual(participants[0].next_message_at, timezone.now() + timedelta(seconds=7198))
        self.assertEqual(participants[1].sent, 1)
        result = warmup.serialize(job)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(result["failures"], 1)
        # The later successful interval clears the last error, retaining history.
        participants[0].next_message_at = timezone.now() - timedelta(seconds=1)
        participants[0].save()
        with patch("accounts.warmup.send_message", return_value=True):
            warmup.tick()
        participants[0].refresh_from_db()
        self.assertEqual(participants[0].error, "")
        self.assertEqual(participants[0].failures, 1)

    def test_deleted_account_and_busy_session(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        with patch("accounts.warmup.send_message", side_effect=ValidationError("Занят")):
            warmup.tick()
        job.refresh_from_db()
        self.assertEqual(job.status, "running")
        self.assertEqual(sum(p.sent for p in job.participants.all()), 0)
        self.accounts[0].delete()
        with patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")

    def test_owner_lock_prevents_a_second_worker_sending(self):
        self.start()
        self.due(WarmupJob.objects.get())
        with session_lock(f"warmup-owner-{self.user.pk}"), patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()

    def test_unreadable_session_skips_account_without_exposing_internal_error(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        with patch("accounts.warmup.send_message", side_effect=[KeyError("private-session"), True]) as send, self.assertLogs("accounts.warmup", level="ERROR"):
            warmup.tick()
            self.assertEqual(send.call_count, 2)
        job.refresh_from_db()
        self.assertEqual(job.status, "running")
        self.assertEqual(sum(p.sent for p in job.participants.all()), 1)
        self.assertNotIn("private-session", json.dumps(warmup.serialize(job)))
        self.assertNotIn("private-session", str(list(Activity.objects.values_list("detail", flat=True))))

    def test_every_failed_sender_is_rescheduled_and_job_keeps_running(self):
        self.start()
        job = WarmupJob.objects.get()
        self.due(job)
        with patch("accounts.warmup.send_message", side_effect=OSError("network")) as send:
            warmup.tick()
            warmup.tick()
            self.assertEqual(send.call_count, 2)
        job.refresh_from_db()
        self.assertEqual(job.status, "running")
        self.assertEqual(sum(p.failures for p in job.participants.all()), 2)

    def test_authenticated_csrf_required(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.post("/api/warmups/", json.dumps(self.data), content_type="application/json").status_code, 403)
        browser.force_login(self.user)
        token = browser.get("/api/status/").json()["csrfToken"]
        self.assertEqual(browser.post("/api/warmups/", json.dumps(self.data), content_type="application/json", HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_transport_resolves_correct_recipient_and_disconnects(self):
        recipient = self.accounts[1]
        fake = MessagingClient(recipient.telegram_id)
        with patch("accounts.telegram.client_for", return_value=fake):
            self.assertTrue(warmup.send_message(self.accounts[0], recipient, "**text**", timezone.now() + timedelta(hours=1)))
        self.assertEqual(fake.sent, [(recipient.telegram_id, "**text**", {"parse_mode": None})])
        self.assertTrue(fake.disconnected)
        fake.disconnected = False
        fake.recipient_id = 999
        with patch("accounts.telegram.client_for", return_value=fake), self.assertRaises(telegram.TelegramFailure):
            warmup.send_message(self.accounts[0], recipient, "text", timezone.now() + timedelta(hours=1))
        self.assertEqual(len(fake.sent), 1)
        self.assertTrue(fake.disconnected)

    def test_transport_deadline_and_floodwait(self):
        recipient = self.accounts[1]
        fake = MessagingClient(recipient.telegram_id)
        fake.flood_wait = True
        with patch("accounts.telegram.client_for", return_value=fake):
            self.assertFalse(warmup.send_message(self.accounts[0], recipient, "text", timezone.now() - timedelta(seconds=1)))
            with self.assertRaisesMessage(telegram.TelegramFailure, "120"):
                warmup.send_message(self.accounts[0], recipient, "text", timezone.now() + timedelta(hours=1))
        self.assertTrue(fake.disconnected)
