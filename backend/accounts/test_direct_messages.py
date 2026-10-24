import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from telethon import errors, functions, types

from .models import Account, Activity, PublicationBatch, PublicationDelivery
from .security import decrypt, encrypt, session_lock
from .test_publications import PublicationClient, channel


class DirectClient(PublicationClient):
    def __init__(self, sender_id):
        super().__init__()
        self.me = types.User(id=sender_id, first_name="Отправитель")
        self.recipients = {
            "@recipient_one": types.User(id=444, access_hash=sender_id * 10 + 444, first_name="Иван", last_name="Иванов", username="recipient_one"),
            "@recipient_two": types.User(id=555, access_hash=sender_id * 10 + 555, first_name="Мария", username="recipient_two"),
        }

    async def get_me(self):
        return self.me

    async def get_entity(self, value):
        return self.recipients[value]

    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(request, functions.contacts.ResolvePhoneRequest):
            recipient = self.recipients["@recipient_one"]
            return types.contacts.ResolvedPeer(peer=types.PeerUser(recipient.id), chats=[], users=[recipient])
        raise AssertionError(type(request).__name__)


class DirectMessageTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="direct-owner")
        self.other = get_user_model().objects.create_user(username="direct-other")
        self.client.force_login(self.owner)
        credentials = {"apiId": 123, "apiHash": "a" * 32}
        self.accounts = [Account.objects.create(owner=self.owner, telegram_id=1000 + i, first_name=f"Аккаунт {i}", phone=f"+7999000000{i}", session=encrypt({"session": f"private-session-{i}", "credentials": credentials})) for i in range(2)]
        self.clients = {f"private-session-{i}": DirectClient(account.telegram_id) for i, account in enumerate(self.accounts)}
        self.data = {"mode": "direct", "text": "Личное сообщение **без разметки**", "targets": ["@recipient_one", "https://t.me/recipient_two"], "accountIds": [str(account.pk) for account in self.accounts]}

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

    def test_preview_is_encrypted_and_does_not_send(self):
        batch = self.prepare()
        self.assertEqual(batch["mode"], "direct")
        self.assertEqual(len(batch["deliveries"]), 4)
        self.assertEqual([target["title"] for target in batch["targets"]], ["Иван Иванов", "Мария"])
        self.assertEqual(self.clients["private-session-0"].sent, [])
        stored = PublicationBatch.objects.get(pk=batch["id"]).payload
        self.assertNotIn(self.data["text"], stored)
        self.assertEqual(decrypt(stored)["targets"][0]["destinationId"], 444)
        for secret in ("private-session", "apiHash", "access_hash"):
            self.assertNotIn(secret, json.dumps(batch))

    def test_every_sender_sends_once_to_every_recipient_using_own_access_hash(self):
        batch = self.prepare()
        for row in batch["deliveries"]:
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], "sent")
        for fake in self.clients.values():
            self.assertEqual(len(fake.sent), 2)
            self.assertTrue(fake.disconnected)
            for destination, text, options in fake.sent:
                self.assertIsInstance(destination, types.User)
                self.assertEqual(destination.access_hash, fake.me.id * 10 + destination.id)
                self.assertEqual(text, self.data["text"])
                self.assertEqual(options, {"parse_mode": None, "link_preview": False})
        self.assertEqual(Activity.objects.filter(title="Личное сообщение отправлено").count(), 4)

    def test_phone_is_resolved_without_importing_contact(self):
        batch = self.prepare({**self.data, "targets": ["+7 (999) 123-45-67"]})
        self.assertEqual(self.send(batch, batch["deliveries"][0]).json()["delivery"]["state"], "sent")
        requests = [request for fake in self.clients.values() for request in fake.requests]
        self.assertTrue(all(isinstance(request, functions.contacts.ResolvePhoneRequest) for request in requests))
        self.assertTrue(all(request.phone == "79991234567" for request in requests))

    def test_alias_and_phone_duplicates_are_rejected(self):
        for targets in [["@recipient_one", "https://t.me/recipient_one"], ["@recipient_one", "+79991234567"]]:
            with patch("accounts.telegram.client_for", side_effect=self.factory):
                response = self.post("/api/publications/", {**self.data, "targets": targets})
            self.assertEqual(response.status_code, 400)
        self.assertFalse(PublicationBatch.objects.exists())

    def test_invalid_personal_links_are_rejected_before_connecting(self):
        targets = ["https://t.me/recipient_one/123", "https://t.me/c/123", "https://t.me/s/recipient_one", "https://t.me/+invite", "https://t.me/recipient_one?start=abc", "https://evil.example/person", "+123"]
        with patch("accounts.telegram.client_for") as factory:
            for target in targets:
                self.assertEqual(self.post("/api/publications/", {**self.data, "targets": [target]}).status_code, 400)
            factory.assert_not_called()

    def test_chats_bots_and_deleted_users_are_rejected(self):
        for recipient in [channel(), types.User(id=444, first_name="Бот", bot=True), types.User(id=444, deleted=True)]:
            self.clients["private-session-0"].recipients["@recipient_one"] = recipient
            with patch("accounts.telegram.client_for", side_effect=self.factory):
                response = self.post("/api/publications/", self.data)
            self.assertEqual(response.status_code, 400)
        self.assertFalse(PublicationBatch.objects.exists())

    def test_recipient_identity_change_stops_before_send(self):
        batch = self.prepare()
        for fake in self.clients.values():
            fake.recipients["@recipient_one"] = types.User(id=999, access_hash=999, first_name="Другой")
        row = next(row for row in batch["deliveries"] if row["targetIndex"] == 0)
        response = self.send(batch, row).json()
        self.assertEqual(response["delivery"]["state"], "failed")
        self.assertTrue(response["stop"])
        self.assertTrue(all(not fake.sent for fake in self.clients.values()))

    def test_one_sender_privacy_error_does_not_block_others(self):
        batch = self.prepare()
        first = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[0].pk))
        self.clients["private-session-0"].send_error = errors.UserPrivacyRestrictedError(None)
        response = self.send(batch, first).json()
        self.assertEqual(response["delivery"]["state"], "failed")
        self.assertFalse(response["stop"])
        second = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[1].pk))
        self.assertEqual(self.send(batch, second).json()["delivery"]["state"], "sent")

    def test_wrong_sender_session_cannot_send(self):
        batch = self.prepare()
        self.clients["private-session-1"].me.id = 999
        row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[1].pk))
        response = self.send(batch, row).json()
        self.assertEqual(response["delivery"]["state"], "failed")
        self.assertFalse(self.clients["private-session-1"].sent)

    def test_wrong_preview_session_is_rejected(self):
        self.clients["private-session-0"].me.id = 999
        with patch("accounts.telegram.client_for", side_effect=self.factory):
            self.assertEqual(self.post("/api/publications/", self.data).status_code, 409)
        self.assertFalse(PublicationBatch.objects.exists())

    def test_floodwait_peerflood_and_timeout_skip_sender_and_continue_without_replay(self):
        for error, state in [(errors.FloodWaitError(None, capture=120), "failed"), (errors.PeerFloodError(None), "failed"), (TimeoutError(), "unknown")]:
            batch = self.prepare()
            self.clients["private-session-0"].send_error = error
            row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[0].pk))
            response = self.send(batch, row).json()
            self.assertEqual(response["delivery"]["state"], state)
            self.assertFalse(response["stop"])
            self.assertEqual(response["skippedAccountId"], str(self.accounts[0].pk))
            self.assertTrue(PublicationDelivery.objects.filter(batch_id=batch["id"], account=self.accounts[0], state="skipped").exists())
            self.assertTrue(PublicationDelivery.objects.filter(batch_id=batch["id"], account=self.accounts[1], state="pending").exists())
            self.assertEqual(self.send(batch, row).json()["delivery"]["state"], state)
            for next_row in batch["deliveries"]:
                if next_row["accountId"] == str(self.accounts[1].pk):
                    self.assertEqual(self.send(batch, next_row).json()["delivery"]["state"], "sent")
            self.clients["private-session-0"].send_error = None

    def test_confirmation_is_required_and_request_cannot_replace_text_or_target(self):
        batch = self.prepare()
        row = batch["deliveries"][0]
        for confirmed in (False, None, 1, "true"):
            self.assertEqual(self.send(batch, row, {"confirmed": confirmed}).status_code, 400)
        response = self.send(batch, row, {"confirmed": True, "text": "Другой текст", "target": "@elsewhere"})
        self.assertEqual(response.json()["delivery"]["state"], "sent")
        fake = next(fake for fake in self.clients.values() if fake.sent)
        self.assertEqual(fake.sent[0][1], self.data["text"])
        self.assertIn(fake.sent[0][0].id, [444, 555])

    def test_access_csrf_account_validation_and_lock(self):
        batch = self.prepare()
        self.client.force_login(self.other)
        self.assertEqual(self.send(batch, batch["deliveries"][0]).status_code, 404)
        self.assertEqual(self.client.get(f"/api/publications/{batch['id']}/").status_code, 404)
        self.client.force_login(self.owner)
        row = batch["deliveries"][0]
        with session_lock(row["accountId"]):
            response = self.send(batch, row)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["delivery"]["state"], "failed")
            self.assertFalse(response.json()["stop"])
        foreign = Account.objects.create(owner=self.other, telegram_id=9999, first_name="Чужой", phone="+79990009999", session="unused")
        with patch("accounts.telegram.client_for") as factory:
            for ids in [[str(foreign.pk)], [str(self.accounts[0].pk)] * 2, []]:
                self.assertEqual(self.post("/api/publications/", {**self.data, "accountIds": ids}).status_code, 400)
            factory.assert_not_called()
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(browser.post("/api/publications/", json.dumps(self.data), content_type="application/json").status_code, 403)

    def test_cancel_expiry_and_crashed_delivery_do_not_send(self):
        batch = self.prepare()
        self.client.delete(f"/api/publications/{batch['id']}/")
        self.assertEqual(self.send(batch, batch["deliveries"][0]).json()["delivery"]["state"], "skipped")
        batch = self.prepare()
        PublicationBatch.objects.filter(pk=batch["id"]).update(expires=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.send(batch, batch["deliveries"][0]).status_code, 409)
        batch = self.prepare()
        row = batch["deliveries"][0]
        PublicationDelivery.objects.filter(pk=row["id"]).update(state="sending")
        result = self.send(batch, row).json()
        self.assertFalse(result["stop"])
        self.assertEqual(result["delivery"]["state"], "unknown")
        self.assertTrue(all(not fake.sent for fake in self.clients.values()))

    def test_not_ready_or_revoked_sender_is_skipped_and_next_sender_sends(self):
        for cause in ("status", "session"):
            with self.subTest(cause=cause):
                batch = self.prepare()
                if cause == "status":
                    self.accounts[0].status = "error"
                    self.accounts[0].save(update_fields=["status"])
                else:
                    self.clients["private-session-0"].authorized = False
                row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[0].pk))
                result = self.send(batch, row).json()
                self.assertEqual(result["delivery"]["state"], "failed")
                self.assertFalse(result["stop"])
                self.assertEqual(result["skippedAccountId"], str(self.accounts[0].pk))
                for other in batch["deliveries"]:
                    if other["accountId"] == str(self.accounts[1].pk):
                        self.assertEqual(self.send(batch, other).json()["delivery"]["state"], "sent")
                self.accounts[0].status = "ready"
                self.accounts[0].save(update_fields=["status"])
                self.clients["private-session-0"].authorized = True

    def test_lost_http_response_skips_only_sender_and_preserves_confirmed_result(self):
        for state in ("pending", "sending", "sent"):
            with self.subTest(state=state):
                batch = self.prepare()
                row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[0].pk))
                PublicationDelivery.objects.filter(pk=row["id"]).update(state=state, message_id=901 if state == "sent" else None)
                with patch("accounts.telegram.client_for") as factory:
                    response = self.post(f"/api/publications/{batch['id']}/deliveries/{row['id']}/skip-account/", {"confirmed": True})
                    factory.assert_not_called()
                result = response.json()
                self.assertEqual(result["delivery"]["state"], {"pending": "skipped", "sending": "unknown", "sent": "sent"}[state])
                if state == "sent":
                    self.assertEqual(result["delivery"]["messageId"], 901)
                self.assertFalse(result["stop"])
                self.assertEqual(result["skippedAccountId"], str(self.accounts[0].pk))
                self.assertEqual(PublicationDelivery.objects.filter(batch_id=batch["id"], account=self.accounts[0], state="pending").count(), 0)
                self.assertEqual(self.send(batch, row).json()["delivery"]["state"], result["delivery"]["state"])
                for other in batch["deliveries"]:
                    if other["accountId"] == str(self.accounts[1].pk):
                        self.assertEqual(self.send(batch, other).json()["delivery"]["state"], "sent")

    def test_unreadable_sender_session_skips_account_without_exposing_private_data(self):
        batch = self.prepare()
        self.accounts[0].session = "private-corrupted-session"
        self.accounts[0].save(update_fields=["session"])
        row = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[0].pk))
        response = self.send(batch, row)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["delivery"]["state"], "unknown")
        self.assertFalse(response.json()["stop"])
        self.assertNotIn("private-corrupted-session", response.content.decode())
        other = next(row for row in batch["deliveries"] if row["accountId"] == str(self.accounts[1].pk))
        self.assertEqual(self.send(batch, other).json()["delivery"]["state"], "sent")

    def test_skip_sender_endpoint_requires_ownership_confirmation_and_csrf(self):
        batch = self.prepare()
        row = batch["deliveries"][0]
        url = f"/api/publications/{batch['id']}/deliveries/{row['id']}/skip-account/"
        self.assertEqual(self.post(url, {"confirmed": False}).status_code, 400)
        self.client.force_login(self.other)
        self.assertEqual(self.post(url, {"confirmed": True}).status_code, 404)
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(browser.post(url, json.dumps({"confirmed": True}), content_type="application/json").status_code, 403)
        self.assertTrue(PublicationDelivery.objects.filter(pk=row["id"], state="pending").exists())
