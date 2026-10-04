import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors, functions, types
from . import telegram
from .models import Account, Activity, PublicationBatch, PublicationDelivery
from .security import decrypt, encrypt, session_lock


def channel(chat_id=101, *, creator=True, broadcast=False):
    return types.Channel(id=chat_id, title=f"Чат {chat_id}", photo=types.ChatPhotoEmpty(), date=timezone.now(),
        access_hash=chat_id * 10, creator=creator, broadcast=broadcast, megagroup=not broadcast)


class PublicationClient:
    def __init__(self, *, creator=True, broadcast=False):
        self.source = channel(creator=creator, broadcast=broadcast)
        self.group = channel(202, creator=creator)
        self.root_id = 51
        self.sent = []
        self.requests = []
        self.disconnected = False
        self.authorized = True
        self.send_error = None
        self.empty_discussion = False
        self.invite_member = True
        self.dialogs_loaded = False

    async def connect(self): pass
    async def disconnect(self): self.disconnected = True
    async def is_user_authorized(self): return self.authorized
    async def get_dialogs(self): self.dialogs_loaded = True
    async def get_entity(self, value):
        if isinstance(value, types.InputPeerChannel) and value.channel_id == 202:
            return self.group
        return self.source
    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(request, functions.messages.CheckChatInviteRequest):
            return types.ChatInviteAlready(self.source) if self.invite_member else SimpleNamespace()
        if isinstance(request, functions.messages.GetDiscussionMessageRequest):
            messages = [] if self.empty_discussion else [types.Message(id=self.root_id, peer_id=types.PeerChannel(self.group.id), message="Пост")]
            return SimpleNamespace(messages=messages, chats=[self.source, self.group])
        raise AssertionError(type(request).__name__)
    async def send_message(self, destination, text, **kwargs):
        if self.send_error:
            raise self.send_error
        self.sent.append((destination, text, kwargs))
        return SimpleNamespace(id=900 + len(self.sent))


class PublicationTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="publisher")
        self.other = get_user_model().objects.create_user(username="other-publisher")
        self.client.force_login(self.owner)
        creds = {"apiId": 123, "apiHash": "a" * 32}
        self.verifier = Account.objects.create(owner=self.owner, telegram_id=111, first_name="Владелец", phone="+79991111111", session=encrypt({"session": "owner-session", "credentials": creds}))
        self.sender = Account.objects.create(owner=self.owner, telegram_id=222, first_name="Отправитель", phone="+79992222222", session=encrypt({"session": "sender-session", "credentials": creds}))
        self.owner_client = PublicationClient()
        self.sender_client = PublicationClient(creator=False)
        self.data = {"mode": "messages", "text": "Публикация для моего чата", "targets": ["https://t.me/my_chat"], "verifierId": str(self.verifier.pk), "accountIds": [str(self.verifier.pk), str(self.sender.pk)]}

    def factory(self, payload):
        return self.owner_client if payload["session"] == "owner-session" else self.sender_client

    def post(self, url, data):
        return self.client.post(url, json.dumps(data), content_type="application/json")

    def prepare(self, data=None):
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            response = self.post("/api/publications/", data or self.data)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["publication"]

    def send(self, batch, row, data=None):
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            return self.post(f"/api/publications/{batch['id']}/deliveries/{row['id']}/", data if data is not None else {"confirmed": True})

    def test_preview_does_not_send_or_expose_sessions(self):
        batch = self.prepare()
        self.assertEqual(len(batch["deliveries"]), 2)
        self.assertEqual(self.owner_client.sent, [])
        self.assertEqual(self.sender_client.sent, [])
        self.assertTrue(self.owner_client.disconnected)
        raw = PublicationBatch.objects.get(pk=batch["id"]).payload
        self.assertNotIn(self.data["text"], raw)
        self.assertEqual(decrypt(raw)["targets"][0]["sourceId"], -1000000000101)
        serialized = json.dumps(batch)
        for private in ("owner-session", "sender-session", "apiHash", "access_hash"):
            self.assertNotIn(private, serialized)

    def test_every_chosen_account_sends_once_and_uses_own_identity(self):
        batch = self.prepare()
        for row in batch["deliveries"]:
            response = self.send(batch, row)
            self.assertEqual(response.json()["delivery"]["state"], "sent")
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
        self.assertEqual(len(self.owner_client.sent), 1)
        self.assertEqual(len(self.sender_client.sent), 1)
        for client in (self.owner_client, self.sender_client):
            destination, text, options = client.sent[0]
            self.assertEqual(destination.id, 101)
            self.assertEqual(text, self.data["text"])
            self.assertIsNone(options["parse_mode"])
            self.assertIsNone(options["reply_to"])
            self.assertIsInstance(options["send_as"], types.InputPeerSelf)
            self.assertTrue(client.disconnected)
        self.assertEqual(Activity.objects.filter(title="Сообщение отправлено").count(), 2)

    def test_non_owner_chat_and_personal_conversation_are_rejected(self):
        for source in (channel(creator=False), types.User(id=444, first_name="Личный аккаунт")):
            self.owner_client.source = source
            with patch("accounts.telegram.client_for", side_effect=self.factory):
                response = self.post("/api/publications/", self.data)
            self.assertEqual(response.status_code, 403)
        self.assertFalse(PublicationBatch.objects.exists())
        self.assertEqual(self.owner_client.sent, [])

    def test_foreign_accounts_and_duplicate_ids_are_rejected_before_connecting(self):
        stranger = Account.objects.create(owner=self.other, telegram_id=333, first_name="Чужой", phone="+79993333333", session=self.sender.session)
        for change in ({"accountIds": [str(stranger.pk)]}, {"verifierId": str(stranger.pk)}, {"accountIds": [str(self.sender.pk)] * 2}):
            with patch("accounts.telegram.client_for") as factory:
                self.assertEqual(self.post("/api/publications/", {**self.data, **change}).status_code, 400)
                factory.assert_not_called()

    def test_preview_cannot_be_sent_without_explicit_confirmation(self):
        batch = self.prepare()
        for value in (None, False, 1, "true"):
            with patch("accounts.telegram.client_for") as factory:
                response = self.send(batch, batch["deliveries"][0], {"confirmed": value})
                self.assertEqual(response.status_code, 400)
                factory.assert_not_called()
        self.assertEqual(self.owner_client.sent, [])

    def test_comments_reply_in_owners_discussion_group(self):
        self.owner_client.source = channel(broadcast=True)
        self.sender_client.source = channel(creator=False, broadcast=True)
        batch = self.prepare({**self.data, "mode": "comments", "targets": ["https://t.me/my_channel/123"]})
        row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.sender.pk))
        self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
        destination, _, options = self.sender_client.sent[0]
        self.assertEqual(destination.id, 202)
        self.assertEqual(options["reply_to"], 51)
        self.assertIsInstance(self.sender_client.requests[-1], functions.messages.GetDiscussionMessageRequest)
        self.assertEqual(self.sender_client.requests[-1].msg_id, 123)

    def test_foreign_or_missing_discussion_group_is_rejected(self):
        self.owner_client.source = channel(broadcast=True)
        self.owner_client.group = channel(202, creator=False)
        data = {**self.data, "mode": "comments", "targets": ["https://t.me/my_channel/123"]}
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", data).status_code, 403)
            self.owner_client.empty_discussion = True
            self.assertEqual(self.post("/api/publications/", data).status_code, 400)
        self.assertFalse(PublicationBatch.objects.exists())

    def test_owner_or_destination_change_stops_before_send(self):
        for change in ("owner", "target"):
            batch = self.prepare()
            self.owner_client.source = channel(creator=False) if change == "owner" else channel(999)
            response = self.send(batch, batch["deliveries"][0]).json()
            self.assertTrue(response["stop"])
            self.assertEqual(response["delivery"]["state"], "failed")
            self.owner_client.source = channel()
        self.assertEqual(self.owner_client.sent, [])
        self.assertEqual(self.sender_client.sent, [])

    def test_sender_cannot_redirect_to_a_different_chat(self):
        batch = self.prepare()
        self.sender_client.source = channel(999, creator=False)
        row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.sender.pk))
        self.assertTrue(self.send(batch, row).json()["stop"])
        self.assertEqual(self.sender_client.sent, [])

    def test_flood_wait_or_unknown_result_stops_the_queue_without_replay(self):
        for error, state in ((errors.FloodWaitError(None, capture=30), "failed"), (errors.SlowModeWaitError(None, capture=10), "failed"), (TimeoutError(), "unknown")):
            batch = self.prepare()
            self.owner_client.send_error = error
            row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.verifier.pk))
            response = self.send(batch, row).json()
            self.assertEqual(response["delivery"]["state"], state)
            self.assertTrue(response["stop"])
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], state)
            self.assertTrue(PublicationDelivery.objects.filter(batch_id=batch["id"], state="skipped").exists())
            self.owner_client.send_error = None
        self.assertEqual(self.owner_client.sent, [])

    def test_private_invite_checks_membership_without_joining(self):
        batch = self.prepare({**self.data, "targets": ["https://t.me/+ownedInvite"]})
        self.assertTrue(any(isinstance(request, functions.messages.CheckChatInviteRequest) for request in self.owner_client.requests))
        self.assertFalse(any(isinstance(request, functions.messages.ImportChatInviteRequest) for request in self.owner_client.requests))
        self.owner_client.invite_member = False
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", {**self.data, "targets": ["https://t.me/+notJoined"]}).status_code, 400)
        self.assertEqual(batch["targets"][0]["title"], "Чат 101")

    def test_request_timeout_outside_operation_also_stops_the_queue(self):
        batch = self.prepare()
        async def timeout(coroutine, timeout):
            coroutine.close()
            raise TimeoutError()
        with patch("accounts.telegram.asyncio.wait_for", side_effect=timeout):
            response = self.send(batch, batch["deliveries"][0]).json()
        self.assertEqual(response["delivery"]["state"], "unknown")
        self.assertTrue(response["stop"])

    def test_sender_permission_failure_does_not_repeat_or_block_other_senders(self):
        batch = self.prepare()
        sender_row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.sender.pk))
        self.sender_client.send_error = errors.ChatWriteForbiddenError(None)
        response = self.send(batch, sender_row).json()
        self.assertEqual(response["delivery"]["state"], "failed")
        self.assertFalse(response["stop"])
        owner_row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.verifier.pk))
        self.assertEqual(self.send(batch, owner_row).json()["delivery"]["state"], "sent")
        self.assertEqual(self.send(batch, sender_row).json()["delivery"]["state"], "failed")
        self.assertEqual(len(self.owner_client.sent), 1)

    def test_delivery_cannot_replace_verified_target_or_text(self):
        batch = self.prepare()
        response = self.send(batch, batch["deliveries"][0], {"confirmed": True, "target": "@foreign_chat", "text": "Другой текст"})
        self.assertEqual(response.json()["delivery"]["state"], "sent")
        client = self.owner_client if self.owner_client.sent else self.sender_client
        self.assertEqual(client.sent[0][0].id, 101)
        self.assertEqual(client.sent[0][1], self.data["text"])

    def test_cancel_and_expiry_prevent_unsent_deliveries(self):
        batch = self.prepare()
        url = f"/api/publications/{batch['id']}/"
        response = self.client.delete(url)
        self.assertTrue(response.json()["publication"]["cancelled"])
        self.assertEqual(self.send(batch, batch["deliveries"][0]).json()["delivery"]["state"], "skipped")
        batch = self.prepare()
        PublicationBatch.objects.filter(pk=batch["id"]).update(expires=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.send(batch, batch["deliveries"][0]).status_code, 409)
        self.assertEqual(self.owner_client.sent, [])

    def test_crash_marked_delivery_is_not_replayed(self):
        batch = self.prepare()
        row = batch["deliveries"][0]
        PublicationDelivery.objects.filter(pk=row["id"]).update(state="sending")
        response = self.send(batch, row).json()
        self.assertEqual(response["delivery"]["state"], "unknown")
        self.assertTrue(response["stop"])
        self.assertEqual(self.owner_client.sent, [])

    def test_batch_access_csrf_and_session_lock(self):
        batch = self.prepare()
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f"/api/publications/{batch['id']}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/publications/{batch['id']}/").status_code, 404)
        self.assertEqual(self.send(batch, batch["deliveries"][0]).status_code, 404)
        self.client.force_login(self.owner)
        with session_lock(self.verifier.pk):
            self.assertEqual(self.send(batch, batch["deliveries"][0]).status_code, 400)
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.get(f"/api/publications/{batch['id']}/").status_code, 401)
        browser.force_login(self.owner)
        self.assertEqual(browser.post("/api/publications/", json.dumps(self.data), content_type="application/json").status_code, 403)

    def test_input_validation_and_alias_duplicates(self):
        invalid = [
            {"mode": "reports"}, {"text": " "}, {"text": "😀" * 2049}, {"accountIds": []},
            {"targets": ["https://evil.example/chat"]}, {"targets": ["https://t.me/my_chat/123"]},
            {"mode": "comments", "targets": ["@my_chat"]},
            {"mode": "comments", "targets": ["https://t.me/my_chat/123?comment=456"]},
        ]
        with patch("accounts.telegram.client_for") as factory:
            for change in invalid:
                self.assertEqual(self.post("/api/publications/", {**self.data, **change}).status_code, 400)
            factory.assert_not_called()
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", {**self.data, "targets": ["@my_chat", "https://t.me/my_chat"]}).status_code, 400)
        self.assertFalse(PublicationBatch.objects.exists())
