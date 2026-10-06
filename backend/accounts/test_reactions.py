import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors, functions, types

from .models import Account, Activity, PublicationBatch, PublicationDelivery
from .security import decrypt, encrypt, session_lock
from .test_publications import PublicationClient, channel


class ReactionClient(PublicationClient):
    def __init__(self, sender_id):
        super().__init__(broadcast=True)
        self.me = types.User(id=sender_id, first_name="Участник")
        self.available = types.ChatReactionsAll()
        self.default_send_as = None
        self.reacted = []
        self.reaction_error = None
        self.missing = False
        self.empty_response = False
        self.catalog = [SimpleNamespace(reaction=emoji, inactive=False) for emoji in ("👍", "👎", "❤", "🔥", "👏", "🎉", "🤩", "😁", "🤔", "😢", "😱", "💯")]

    async def get_me(self):
        return self.me

    async def get_messages(self, entity, *, ids):
        if self.missing:
            return None
        peer = types.PeerChannel(entity.id) if isinstance(entity, types.Channel) else types.PeerChat(entity.id)
        return types.Message(id=ids, peer_id=peer, message=f"Сообщение {ids} для реакции")

    async def get_input_entity(self, peer):
        return types.InputPeerChannel(peer.channel_id, peer.channel_id * 10)

    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(request, functions.messages.GetAvailableReactionsRequest):
            return SimpleNamespace(reactions=self.catalog)
        if isinstance(request, (functions.channels.GetFullChannelRequest, functions.messages.GetFullChatRequest)):
            return SimpleNamespace(full_chat=SimpleNamespace(available_reactions=self.available, default_send_as=self.default_send_as))
        if isinstance(request, functions.messages.SaveDefaultSendAsRequest):
            self.default_send_as = types.PeerUser(self.me.id) if isinstance(request.send_as, types.InputPeerSelf) else types.PeerChannel(request.send_as.channel_id)
            return True
        if isinstance(request, functions.messages.SendReactionRequest):
            if self.reaction_error:
                raise self.reaction_error
            self.reacted.append(request)
            return None if self.empty_response else types.Updates(updates=[], users=[], chats=[], date=timezone.now(), seq=1)
        raise AssertionError(type(request).__name__)


class ReactionTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="reaction-owner")
        self.other = get_user_model().objects.create_user(username="reaction-other")
        self.client.force_login(self.owner)
        credentials = {"apiId": 123, "apiHash": "a" * 32}
        self.accounts = [Account.objects.create(owner=self.owner, telegram_id=8000 + i, first_name=f"Участник {i}", phone=f"+7999000000{i}", session=encrypt({"session": f"reaction-session-{i}", "credentials": credentials})) for i in range(2)]
        self.clients = {f"reaction-session-{i}": ReactionClient(account.telegram_id) for i, account in enumerate(self.accounts)}
        self.data = {"mode": "reactions", "reaction": "👍", "targets": ["https://t.me/my_channel/123"], "accountIds": [str(account.pk) for account in self.accounts]}

    def factory(self, payload):
        return self.clients[payload["session"]]

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

    def row(self, batch, index):
        return next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[index].pk))

    def test_preview_resolves_message_without_reacting_or_exposing_sessions(self):
        batch = self.prepare()
        self.assertEqual(batch["mode"], "reactions")
        self.assertEqual(batch["reaction"], "👍")
        self.assertEqual(batch["text"], "")
        self.assertEqual(batch["targets"][0]["messagePreview"], "Сообщение 123 для реакции")
        self.assertEqual(len(batch["deliveries"]), 2)
        self.assertTrue(all(not fake.reacted and not fake.sent for fake in self.clients.values()))
        self.assertEqual(decrypt(PublicationBatch.objects.get(pk=batch["id"]).payload)["targets"][0]["replyId"], 123)
        self.assertNotIn("reaction-session", json.dumps(batch))
        self.assertNotIn("apiHash", json.dumps(batch))

    def test_every_account_reacts_once_on_original_post_not_discussion(self):
        batch = self.prepare()
        for row in batch["deliveries"]:
            result = self.send(batch, row).json()
            self.assertEqual(result["delivery"]["state"], "sent")
            self.assertEqual(result["delivery"]["messageId"], 123)
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
        for fake in self.clients.values():
            self.assertEqual(len(fake.reacted), 1)
            request = fake.reacted[0]
            self.assertEqual(request.peer.id, 101)
            self.assertEqual(request.msg_id, 123)
            self.assertEqual(request.reaction[0].emoticon, "👍")
            self.assertFalse(request.big)
            self.assertFalse(request.add_to_recent)
            self.assertTrue(fake.disconnected)
            self.assertFalse(fake.sent)
            self.assertFalse(any(isinstance(request, functions.messages.GetDiscussionMessageRequest) for request in fake.requests))
        self.assertEqual(Activity.objects.filter(title="Реакция поставлена").count(), 2)

    def test_public_private_and_forum_links_use_final_message_id(self):
        for link, message_id in [
            ("https://t.me/s/my_channel/123", 123),
            ("https://t.me/c/101/124", 124),
            ("https://t.me/my_channel/42/125", 125),
            ("https://t.me/c/101/42/126", 126),
        ]:
            with self.subTest(link=link):
                batch = self.prepare({**self.data, "targets": [link]})
                self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")
                self.assertEqual(self.clients["reaction-session-0"].reacted[-1].msg_id, message_id)

    def test_basic_group_messages_are_supported(self):
        group = types.Chat(id=321, title="Группа", photo=types.ChatPhotoEmpty(), participants_count=3, date=timezone.now(), version=1)
        for fake in self.clients.values():
            fake.source = group
        batch = self.prepare({**self.data, "targets": ["https://t.me/my_group/12"]})
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")
        self.assertEqual(self.clients["reaction-session-1"].reacted[0].peer.id, 321)

    def test_invalid_links_and_reaction_are_rejected_before_connection(self):
        invalid = [
            {"reaction": ""}, {"reaction": None}, {"reaction": "⭐"}, {"reaction": {"documentId": 123}},
            {"targets": ["@my_channel"]}, {"targets": ["https://t.me/my_channel"]},
            {"targets": ["https://t.me/my_channel/2147483648"]},
            {"targets": ["https://t.me/my_channel/123?comment=124"]},
            {"targets": ["https://evil.example/post/123"]}, {"targets": ["https://t.me/+invite"]},
        ]
        with patch("accounts.telegram.client_for") as factory:
            for change in invalid:
                self.assertEqual(self.post("/api/publications/", {**self.data, **change}).status_code, 400)
            factory.assert_not_called()

    def test_missing_message_disabled_or_disallowed_reaction_prevents_preview(self):
        fake = self.clients["reaction-session-0"]
        for available, missing in [(types.ChatReactionsAll(), True), (types.ChatReactionsNone(), False), (types.ChatReactionsSome(reactions=[types.ReactionEmoji("❤️")]), False)]:
            fake.available, fake.missing = available, missing
            with patch("accounts.telegram.client_for", side_effect=self.factory):
                self.assertEqual(self.post("/api/publications/", self.data).status_code, 400)
        self.assertFalse(PublicationBatch.objects.exists())
        self.assertFalse(fake.reacted)

    def test_floodwait_timeout_and_permission_error_skip_sender_and_continue(self):
        for error, state in [(errors.FloodWaitError(None, capture=60), "failed"), (errors.ReactionInvalidError(None), "failed"), (TimeoutError(), "unknown")]:
            batch = self.prepare()
            self.clients["reaction-session-0"].reaction_error = error
            result = self.send(batch, self.row(batch, 0)).json()
            self.assertEqual(result["delivery"]["state"], state)
            self.assertFalse(result["stop"])
            self.assertEqual(result["skippedAccountId"], str(self.accounts[0].pk))
            self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")
            self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], state)
            self.clients["reaction-session-0"].reaction_error = None

    def test_access_or_reaction_policy_changes_skip_only_account(self):
        for missing in (True, False):
            batch = self.prepare()
            fake = self.clients["reaction-session-1"]
            fake.missing = missing
            fake.available = types.ChatReactionsNone() if not missing else types.ChatReactionsAll()
            result = self.send(batch, self.row(batch, 1)).json()
            self.assertEqual(result["delivery"]["state"], "failed")
            self.assertFalse(result["stop"])
            self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")
            fake.missing, fake.available = False, types.ChatReactionsAll()

    def test_changed_channel_cannot_redirect_reaction(self):
        batch = self.prepare()
        fake = self.clients["reaction-session-1"]
        fake.source = channel(999)
        result = self.send(batch, self.row(batch, 1)).json()
        self.assertTrue(result["stop"])
        self.assertEqual(result["delivery"]["state"], "failed")
        self.assertFalse(fake.reacted)

    def test_unconfirmed_request_cannot_set_reaction_or_replace_verified_emoji(self):
        batch = self.prepare()
        row = self.row(batch, 0)
        for confirmed in (False, None, 1, "true"):
            self.assertEqual(self.send(batch, row, {"confirmed": confirmed}).status_code, 400)
        self.assertFalse(self.clients["reaction-session-0"].reacted)
        self.assertEqual(self.send(batch, row, {"confirmed": True, "reaction": "❤️", "target": "https://t.me/elsewhere/99"}).json()["delivery"]["state"], "sent")
        self.assertEqual(self.clients["reaction-session-0"].reacted[0].reaction[0].emoticon, "👍")

    def test_existing_reaction_is_success_and_unconfirmed_result_is_not_replayed(self):
        batch = self.prepare()
        fake = self.clients["reaction-session-0"]
        fake.reaction_error = errors.MessageNotModifiedError(None)
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")
        fake.reaction_error = None
        batch = self.prepare()
        fake.empty_response = True
        row = self.row(batch, 0)
        result = self.send(batch, row).json()
        self.assertEqual(result["delivery"]["state"], "unknown")
        self.assertFalse(result["stop"])
        self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "unknown")
        self.assertEqual(len(fake.reacted), 1)

    def test_reacts_as_account_and_restores_previous_channel_identity_even_on_error(self):
        for error in (None, errors.FloodWaitError(None, capture=30)):
            batch = self.prepare()
            fake = self.clients["reaction-session-1"]
            fake.default_send_as = types.PeerChannel(777)
            fake.reaction_error = error
            fake.requests.clear()
            result = self.send(batch, self.row(batch, 1)).json()
            self.assertEqual(result["delivery"]["state"], "failed" if error else "sent")
            switches = [request for request in fake.requests if isinstance(request, functions.messages.SaveDefaultSendAsRequest)]
            self.assertEqual(len(switches), 2)
            self.assertIsInstance(switches[0].send_as, types.InputPeerSelf)
            self.assertEqual(switches[1].send_as.channel_id, 777)
            self.assertEqual(fake.default_send_as.channel_id, 777)
            fake.default_send_as, fake.reaction_error = None, None

    def test_access_csrf_session_lock_and_account_ownership(self):
        batch = self.prepare()
        self.client.force_login(self.other)
        self.assertEqual(self.send(batch, self.row(batch, 0)).status_code, 404)
        self.client.force_login(self.owner)
        with session_lock(self.accounts[0].pk):
            result = self.send(batch, self.row(batch, 0)).json()
        self.assertFalse(result["stop"])
        self.assertEqual(result["delivery"]["state"], "failed")
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")
        foreign = Account.objects.create(owner=self.other, telegram_id=99999, first_name="Чужой", phone="+79990009999", session="unused")
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.post("/api/publications/", {**self.data, "accountIds": [str(foreign.pk)]}).status_code, 400)
            factory.assert_not_called()
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(browser.post("/api/publications/", json.dumps(self.data), content_type="application/json").status_code, 403)

    def test_heart_uses_telegram_canonical_emoji_and_inactive_reaction_is_rejected(self):
        self.clients["reaction-session-0"].available = types.ChatReactionsSome(reactions=[types.ReactionEmoji("❤️")])
        batch = self.prepare({**self.data, "reaction": "❤️"})
        self.assertEqual(batch["reaction"], "❤")
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")
        self.assertEqual(self.clients["reaction-session-0"].reacted[0].reaction[0].emoticon, "❤")
        fake = self.clients["reaction-session-0"]
        fake.available = types.ChatReactionsAll()
        fake.catalog = [SimpleNamespace(reaction="👍", inactive=True)]
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", self.data).status_code, 400)

    def test_cancel_expiry_and_unknown_attempt_never_repeat(self):
        batch = self.prepare()
        self.client.delete(f"/api/publications/{batch['id']}/")
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "skipped")
        batch = self.prepare()
        PublicationBatch.objects.filter(pk=batch["id"]).update(expires=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.send(batch, self.row(batch, 0)).status_code, 409)
        batch = self.prepare()
        row = self.row(batch, 0)
        PublicationDelivery.objects.filter(pk=row["id"]).update(state="sending")
        result = self.send(batch, row).json()
        self.assertEqual(result["delivery"]["state"], "unknown")
        self.assertFalse(result["stop"])
        self.assertTrue(all(not fake.reacted for fake in self.clients.values()))
