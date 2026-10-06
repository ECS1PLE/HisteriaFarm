import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors, functions, types

from .models import Account, PublicationBatch, PublicationDelivery
from .security import decrypt, encrypt
from .test_publications import PublicationClient, channel


class SubscriptionClient(PublicationClient):
    def __init__(self, sender_id):
        super().__init__(broadcast=True)
        self.me = types.User(id=sender_id)
        self.member = False
        self.invite = None
        self.joined = []
        self.join_error = None
        self.empty_response = False

    async def get_me(self):
        return self.me

    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(request, functions.messages.CheckChatInviteRequest):
            return self.invite or types.ChatInviteAlready(self.source)
        if isinstance(request, functions.channels.GetParticipantRequest):
            if not self.member:
                raise errors.UserNotParticipantError(request)
            return object()
        if isinstance(request, (functions.channels.JoinChannelRequest, functions.messages.ImportChatInviteRequest)):
            self.joined.append(request)
            if self.join_error:
                raise self.join_error
            return None if self.empty_response else types.Updates(updates=[], users=[], chats=[], date=timezone.now(), seq=1)
        raise AssertionError(type(request).__name__)


def private_invite(title="Приватный канал", **kwargs):
    return types.ChatInvite(title=title, photo=types.PhotoEmpty(0), participants_count=10, color=0, channel=True, broadcast=True, **kwargs)


class SubscriptionTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="subscription-owner")
        self.other = get_user_model().objects.create_user(username="subscription-other")
        self.client.force_login(self.owner)
        credentials = {"apiId": 123, "apiHash": "a" * 32}
        self.accounts = [Account.objects.create(owner=self.owner, telegram_id=8100 + i, first_name=f"Аккаунт {i}", phone=f"+7999000010{i}", session=encrypt({"session": f"subscription-{i}", "credentials": credentials})) for i in range(2)]
        self.clients = {f"subscription-{i}": SubscriptionClient(account.telegram_id) for i, account in enumerate(self.accounts)}
        self.data = {"mode": "subscriptions", "targets": ["https://t.me/my_channel"], "accountIds": [str(account.pk) for account in self.accounts]}

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

    def row(self, batch, index, target=0):
        return next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[index].pk) and row["targetIndex"] == target)

    def test_preview_does_not_join_or_expose_credentials(self):
        batch = self.prepare()
        self.assertEqual(batch["mode"], "subscriptions")
        self.assertEqual(batch["text"], "")
        self.assertEqual(len(batch["deliveries"]), 2)
        self.assertTrue(all(not fake.joined and not fake.sent for fake in self.clients.values()))
        self.assertNotIn("subscription-0", json.dumps(batch))
        self.assertNotIn("apiHash", json.dumps(batch))
        self.assertEqual(decrypt(PublicationBatch.objects.get(pk=batch["id"]).payload)["targets"][0]["destinationId"], -1000000000101)

    def test_all_accounts_join_once_and_do_not_send_messages(self):
        batch = self.prepare()
        for row in batch["deliveries"]:
            result = self.send(batch, row).json()
            self.assertEqual(result["delivery"]["state"], "sent")
            self.assertIsNone(result["delivery"]["messageId"])
            self.assertFalse(result["stop"])
            self.send(batch, row)
        for fake in self.clients.values():
            self.assertEqual(len(fake.joined), 1)
            self.assertIsInstance(fake.joined[0], functions.channels.JoinChannelRequest)
            self.assertEqual(fake.joined[0].channel.id, 101)
            self.assertFalse(fake.sent)
            self.assertTrue(fake.disconnected)

    def test_already_subscribed_accounts_are_not_joined_again(self):
        self.clients["subscription-0"].member = True
        batch = self.prepare()
        result = self.send(batch, self.row(batch, 0)).json()["delivery"]
        self.assertEqual(result["state"], "sent")
        self.assertIn("Уже подписан", result["error"])
        self.assertFalse(self.clients["subscription-0"].joined)
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")

    def test_private_invites_and_already_joined_member(self):
        for fake in self.clients.values():
            fake.invite = private_invite()
        batch = self.prepare({**self.data, "targets": ["https://t.me/+Hash_123"]})
        self.clients["subscription-1"].source.title = "Приватный канал"
        self.clients["subscription-1"].invite = types.ChatInviteAlready(self.clients["subscription-1"].source)
        for row in batch["deliveries"]:
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
        self.assertEqual(self.clients["subscription-0"].joined[0].hash, "Hash_123")
        self.assertFalse(self.clients["subscription-1"].joined)

    def test_private_peek_invite_does_not_count_as_membership(self):
        fake = self.clients["subscription-0"]
        fake.invite = types.ChatInvitePeek(chat=fake.source, expires=timezone.now() + timedelta(hours=1))
        batch = self.prepare({**self.data, "targets": ["https://t.me/joinchat/Hash_123"]})
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")
        self.assertEqual(len(fake.joined), 1)
        self.assertIsInstance(fake.joined[0], functions.messages.ImportChatInviteRequest)

    def test_join_request_is_successful_pending_approval_and_never_retried(self):
        for fake in self.clients.values():
            fake.invite = private_invite(request_needed=True)
        batch = self.prepare({**self.data, "targets": ["https://t.me/+First", "https://t.me/+Second"]})
        self.assertTrue(batch["targets"][0]["requestNeeded"])
        self.clients["subscription-0"].join_error = errors.InviteRequestSentError(None)
        first = self.send(batch, self.row(batch, 0)).json()
        self.assertEqual(first["delivery"]["state"], "requested")
        self.assertFalse(first["stop"])
        self.assertIsNone(first["skippedAccountId"])
        self.send(batch, self.row(batch, 0))
        self.assertEqual(len(self.clients["subscription-0"].joined), 1)
        self.assertEqual(self.send(batch, self.row(batch, 0, 1)).json()["delivery"]["state"], "requested")
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")

    def test_public_join_request_and_already_participant_responses(self):
        batch = self.prepare()
        self.clients["subscription-0"].join_error = errors.InviteRequestSentError(None)
        self.clients["subscription-1"].join_error = errors.UserAlreadyParticipantError(None)
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "requested")
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")

    def test_failing_account_is_skipped_without_stopping_the_other(self):
        for failure in [errors.FloodWaitError(None, capture=30), errors.ChannelsTooMuchError(None), errors.InviteHashExpiredError(None), errors.UserBannedInChannelError(None), OSError("secret diagnostic")]:
            with self.subTest(failure=type(failure).__name__):
                for fake in self.clients.values():
                    fake.invite = private_invite()
                batch = self.prepare({**self.data, "targets": ["https://t.me/+First", "https://t.me/+Second"]})
                self.clients["subscription-0"].join_error = failure
                result = self.send(batch, self.row(batch, 0)).json()
                self.assertIn(result["delivery"]["state"], ("failed", "unknown"))
                self.assertFalse(result["stop"])
                self.assertEqual(result["skippedAccountId"], str(self.accounts[0].pk))
                self.assertNotIn("secret diagnostic", json.dumps(result))
                self.assertEqual(PublicationDelivery.objects.get(pk=self.row(batch, 0, 1)["id"]).state, "skipped")
                self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")
                self.clients["subscription-0"].join_error = None

    def test_unknown_acknowledgement_is_never_retried(self):
        batch = self.prepare()
        fake = self.clients["subscription-0"]
        fake.empty_response = True
        row = self.row(batch, 0)
        self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "unknown")
        self.send(batch, row)
        self.assertEqual(len(fake.joined), 1)
        self.assertEqual(self.send(batch, self.row(batch, 1)).json()["delivery"]["state"], "sent")

    def test_changed_public_channel_stops_before_join(self):
        batch = self.prepare()
        self.clients["subscription-0"].source = channel(999, broadcast=True)
        result = self.send(batch, self.row(batch, 0)).json()
        self.assertTrue(result["stop"])
        self.assertFalse(self.clients["subscription-0"].joined)
        self.assertEqual(PublicationDelivery.objects.get(pk=self.row(batch, 1)["id"]).state, "skipped")

    def test_changed_private_preview_stops_before_import(self):
        fake = self.clients["subscription-0"]
        fake.invite = private_invite()
        batch = self.prepare({**self.data, "targets": ["https://t.me/+Invite"]})
        fake.invite = private_invite(title="Другой канал")
        self.assertTrue(self.send(batch, self.row(batch, 0)).json()["stop"])
        self.assertFalse(fake.joined)

    def test_paid_invites_rejected_at_preview_and_rechecked_before_join(self):
        fake = self.clients["subscription-0"]
        fake.invite = private_invite()
        batch = self.prepare({**self.data, "targets": ["https://t.me/+Invite"]})
        fake.invite.subscription_pricing = types.StarsSubscriptionPricing(period=2592000, amount=100)
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "failed")
        self.assertFalse(fake.joined)
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            response = self.post("/api/publications/", {**self.data, "targets": ["https://t.me/+Invite"]})
        self.assertEqual(response.status_code, 400)

    def test_invalid_links_groups_users_duplicate_targets_and_account_selection(self):
        for links in [["https://example.com/channel"], ["https://t.me/my_channel/123"], ["https://t.me/c/123"], ["https://t.me/+Hash?comment=1"], ["@my_channel", "https://t.me/my_channel"]]:
            with self.subTest(links=links), patch("accounts.telegram.client_for", side_effect=self.factory):
                self.assertEqual(self.post("/api/publications/", {**self.data, "targets": links}).status_code, 400)
        for source in [channel(broadcast=False), types.User(id=999), types.ChatInvite(title="Группа", photo=types.PhotoEmpty(0), participants_count=2, color=0)]:
            fake = self.clients["subscription-0"]
            if isinstance(source, types.ChatInvite):
                fake.invite = source
                links = ["https://t.me/+Group"]
            else:
                fake.source = source
                links = ["@my_channel"]
            with self.subTest(source=type(source).__name__), patch("accounts.telegram.client_for", side_effect=self.factory):
                self.assertEqual(self.post("/api/publications/", {**self.data, "targets": links}).status_code, 400)
        foreign = Account.objects.create(owner=self.other, telegram_id=999, session=encrypt({}), first_name="Чужой", phone="+79999999999")
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", {**self.data, "accountIds": [str(foreign.pk)]}).status_code, 400)
            self.assertEqual(self.post("/api/publications/", {**self.data, "accountIds": [str(self.accounts[0].pk)] * 2}).status_code, 400)

    def test_confirmation_and_preview_payload_cannot_be_changed(self):
        batch = self.prepare()
        row = self.row(batch, 0)
        self.assertEqual(self.send(batch, row, {}).status_code, 400)
        result = self.send(batch, row, {"confirmed": True, "targets": ["@other_channel"], "accountIds": [str(self.accounts[1].pk)]})
        self.assertEqual(result.json()["delivery"]["state"], "sent")
        self.assertEqual(self.clients["subscription-0"].joined[0].channel.id, 101)
        self.assertFalse(self.clients["subscription-1"].joined)

    def test_revoked_or_wrong_session_skips_only_one_account(self):
        for invalid in ("revoked", "wrong"):
            batch = self.prepare()
            fake = self.clients["subscription-1"]
            fake.authorized = invalid != "revoked"
            fake.me = types.User(id=999) if invalid == "wrong" else types.User(id=self.accounts[1].telegram_id)
            result = self.send(batch, self.row(batch, 1)).json()
            self.assertEqual(result["delivery"]["state"], "failed")
            self.assertFalse(result["stop"])
            self.assertFalse(fake.joined)
            self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "sent")

    def test_permissions_cancellation_and_expiry_prevent_join(self):
        batch = self.prepare()
        foreign_client = Client()
        foreign_client.force_login(self.other)
        self.assertEqual(foreign_client.get(f"/api/publications/{batch['id']}/").status_code, 404)
        self.assertEqual(foreign_client.post(f"/api/publications/{batch['id']}/deliveries/{self.row(batch, 0)['id']}/", json.dumps({"confirmed": True}), content_type="application/json").status_code, 404)
        self.client.delete(f"/api/publications/{batch['id']}/")
        self.assertEqual(self.send(batch, self.row(batch, 0)).json()["delivery"]["state"], "skipped")
        expired = self.prepare()
        PublicationBatch.objects.filter(pk=expired["id"]).update(expires=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.send(expired, self.row(expired, 0)).status_code, 409)
        self.assertTrue(all(not fake.joined for fake in self.clients.values()))
