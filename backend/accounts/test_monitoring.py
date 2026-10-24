import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from telethon import types, utils, errors
from . import monitoring, telegram
from .models import Account, Membership, MonitorRule, MonitorDelivery
from .security import encrypt, session_lock
from .test_publications import channel


class MonitorClient:
    def __init__(self, mode="channel"):
        self.entity = channel(broadcast=mode == "channel")
        self.messages = []
        self.sent = []
        self.failure = None
        self.me_id = 123
        self.has_discussion = True
        self.disconnected = False

    async def connect(self): pass
    async def disconnect(self): self.disconnected = True
    async def get_me(self): return SimpleNamespace(id=self.me_id, deleted=False)
    async def get_entity(self, target): return self.entity
    async def get_dialogs(self): return []
    async def __call__(self, request):
        return SimpleNamespace(full_chat=SimpleNamespace(linked_chat_id=202 if self.has_discussion else None))
    async def get_messages(self, entity, limit): return self.messages[-limit:][::-1]
    async def iter_messages(self, entity, min_id, reverse, limit):
        assert reverse is True
        for message in sorted(self.messages, key=lambda m: m.id):
            if message.id > min_id:
                yield message
    async def send_message(self, peer, text, **options):
        self.sent.append((peer, text, options))
        if self.failure:
            raise self.failure
        return SimpleNamespace(id=999)


def message(mid, text="Пост", sender_id=456, out=False, bot=False, action=None):
    async def get_sender(): return SimpleNamespace(bot=bot)
    return SimpleNamespace(id=mid, message=text, sender_id=sender_id, out=out, action=action, via_bot_id=None, get_sender=get_sender)


class MonitoringTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="monitor-owner")
        self.other = get_user_model().objects.create_user(username="another-owner")
        self.account = Account.objects.create(owner=self.owner, telegram_id=123, first_name="Отправитель", phone="+79991234567",
            session=encrypt({"session": "private-session", "credentials": {"apiId": 123, "apiHash": "a" * 32}}))
        self.client.force_login(self.owner)
        self.fake = MonitorClient()
        self.fake.messages = [message(10)]
        self.factory = patch("accounts.telegram.client_for", return_value=self.fake)
        self.factory.start()
        self.addCleanup(self.factory.stop)

    def create(self, mode="channel", **patches):
        if mode == "chat": self.fake.entity = channel()
        return monitoring.create(self.owner, {"accountId": str(self.account.pk), "mode": mode,
            "target": "@example_channel", "text": "Автоответ", "keyword": "ЦЕНА", **patches})

    def due(self, rule):
        MonitorRule.objects.filter(pk=rule.pk).update(next_poll_at=timezone.now() - timedelta(seconds=1))
        monitoring.tick()
        rule.refresh_from_db()

    def test_channel_ignores_old_posts_and_comments_once_on_each_new_post(self):
        rule = self.create()
        self.assertEqual(rule.cursor, 10)
        self.due(rule)
        self.assertEqual(self.fake.sent, [])
        self.fake.messages += [message(11), message(12, out=True)]
        self.due(rule); self.due(rule); self.due(rule)
        self.assertEqual([row[2]["comment_to"] for row in self.fake.sent], [11, 12])
        self.assertEqual(rule.sent, 2)
        self.assertEqual(rule.cursor, 12)
        self.assertTrue(self.fake.disconnected)

    def test_keyword_casefold_ignores_outgoing_bots_services_and_panel_accounts(self):
        rule = self.create("chat")
        self.fake.messages += [message(11, "нет совпадения"), message(12, "цена", out=True),
            message(13, "цена", sender_id=123), message(14, "цена", bot=True), message(15, "цена", action=object()),
            message(16, "Какая ЦеНа?"), message(17, "цена")]
        self.due(rule); self.due(rule); self.due(rule)
        self.assertEqual([row[2]["reply_to"] for row in self.fake.sent], [16, 17])
        self.assertEqual(rule.sent, 2)

    def test_unknown_network_result_is_not_retried_after_restart(self):
        rule = self.create()
        self.fake.messages.append(message(11))
        self.fake.failure = OSError("lost response")
        self.due(rule)
        self.assertEqual(rule.cursor, 11)
        self.assertEqual(MonitorDelivery.objects.get(rule=rule).state, "attempted")
        self.fake.failure = None
        self.due(MonitorRule.objects.get(pk=rule.pk))
        self.assertEqual(len(self.fake.sent), 1)

    def test_flood_wait_sets_retry_deadline_and_never_repeats_message(self):
        rule = self.create()
        self.fake.messages.append(message(11))
        self.fake.failure = errors.FloodWaitError(request=None, capture=300)
        self.due(rule)
        self.assertGreater(rule.next_poll_at, timezone.now() + timedelta(seconds=290))
        self.assertEqual(MonitorDelivery.objects.get(rule=rule).state, "failed")
        self.fake.failure = None
        self.due(rule)
        self.assertEqual(len(self.fake.sent), 1)

    def test_busy_session_is_deferred_without_losing_cursor(self):
        rule = self.create()
        self.fake.messages.append(message(11))
        with session_lock(self.account.pk): self.due(rule)
        self.assertEqual(rule.cursor, 10)
        self.assertEqual(rule.status, "running")
        self.due(rule)
        self.assertEqual(rule.sent, 1)

    def test_pause_resume_and_owner_isolation(self):
        rule = self.create()
        monitoring.change(self.owner, rule.pk, "pause")
        self.fake.messages.append(message(11))
        self.due(rule)
        self.assertEqual(self.fake.sent, [])
        self.client.force_login(self.other)
        self.assertEqual(self.client.delete(f"/api/monitors/{rule.pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/workspace/").json()["monitors"], [])
        monitoring.change(self.owner, rule.pk, "resume")
        self.due(rule)
        self.assertEqual(rule.sent, 1)

    def test_expired_premium_pauses_shared_rule_without_connecting(self):
        self.account.owner = self.other; self.account.save()
        membership = Membership.objects.create(owner=self.owner, premium_until=timezone.now() + timedelta(days=1))
        rule = self.create()
        membership.premium_until = timezone.now() - timedelta(seconds=1); membership.save()
        with patch("accounts.telegram.client_for") as factory:
            self.due(rule)
            factory.assert_not_called()
        self.assertEqual(rule.status, "paused")

    def test_target_reassignment_pauses_without_sending(self):
        rule = self.create()
        self.fake.entity = channel(999, broadcast=True)
        self.fake.messages.append(message(11))
        self.due(rule)
        self.assertEqual(rule.status, "paused")
        self.assertEqual(self.fake.sent, [])

    def test_creation_rejects_invalid_target_no_discussion_and_inaccessible_account(self):
        data = {"accountId": str(self.account.pk), "mode": "channel", "target": "@example_channel", "text": "Ответ"}
        for patch_data in ({"target": "https://evil.example/path"}, {"mode": "chat", "keyword": ""}):
            response = self.client.post("/api/monitors/", json.dumps({**data, **patch_data}), content_type="application/json")
            self.assertEqual(response.status_code, 400)
        self.fake.has_discussion = False
        self.assertEqual(self.client.post("/api/monitors/", json.dumps(data), content_type="application/json").status_code, 400)
        self.account.owner = self.other; self.account.save()
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.client.post("/api/monitors/", json.dumps(data), content_type="application/json").status_code, 400)
            factory.assert_not_called()

    def test_same_rule_cannot_be_created_twice(self):
        self.create()
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError): self.create()
