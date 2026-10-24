import json
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from . import warmup
from .models import Account, Membership, AuthRateLimit, ReportDraft
from .security import encrypt
from .test_publications import PublicationClient


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class MembershipTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="owner", password="Strong-password-294!")
        self.other = User.objects.create_user(username="other")
        self.payload = encrypt({"session": "private", "credentials": {"apiId": 123, "apiHash": "a" * 32}})
        self.own = Account.objects.create(owner=self.owner, telegram_id=111, first_name="Свой", phone="+79991111111", session=self.payload)
        self.shared = Account.objects.create(owner=self.other, telegram_id=222, first_name="Общий", phone="+79992222222", session=self.payload)
        self.client.force_login(self.owner)

    def post(self, path, data):
        return self.client.post(path, json.dumps(data), content_type="application/json")

    def premium(self, delta=timedelta(days=30)):
        Membership.objects.update_or_create(owner=self.owner, defaults={"premium_until": timezone.now() + delta})

    def registration(self, **patches):
        return {"username": "new_user", "email": "NEW@example.com", "password": "Uncommon-password-298!",
                "passwordConfirm": "Uncommon-password-298!", "sharingAccepted": True, **patches}

    def test_registration_creates_hashed_password_free_plan_and_logs_in(self):
        self.client.logout()
        response = self.post("/api/register/", self.registration())
        self.assertEqual(response.status_code, 201)
        user = get_user_model().objects.get(username="new_user")
        self.assertTrue(user.check_password("Uncommon-password-298!"))
        self.assertEqual(user.email, "new@example.com")
        self.assertEqual(response.json()["membership"]["plan"], "Free")
        self.assertEqual(self.client.get("/api/workspace/").json()["accounts"], [])
        self.assertNotIn("password", response.content.decode())

    def test_registration_requires_csrf_and_rotates_token(self):
        browser = Client(enforce_csrf_checks=True)
        token = browser.get("/api/status/").json()["csrfToken"]
        data = json.dumps(self.registration())
        self.assertEqual(browser.post("/api/register/", data, content_type="application/json").status_code, 403)
        response = browser.post("/api/register/", data, content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()["csrfToken"], token)

    def test_registration_rejects_weak_password_mismatch_bad_email_and_missing_consent(self):
        for patch_data in ({"password": "12345678", "passwordConfirm": "12345678"}, {"passwordConfirm": "different"},
                           {"email": "invalid"}, {"sharingAccepted": False}, {"username": "x"}):
            self.assertEqual(self.post("/api/register/", self.registration(**patch_data)).status_code, 400)
        self.assertFalse(get_user_model().objects.filter(username="new_user").exists())

    def test_registration_rejects_duplicate_username_case_and_email(self):
        self.assertEqual(self.post("/api/register/", self.registration()).status_code, 201)
        self.assertEqual(self.post("/api/register/", self.registration(username="NEW_USER", email="another@example.com")).status_code, 409)
        self.assertEqual(self.post("/api/register/", self.registration(username="different")).status_code, 409)

    def test_registration_cannot_grant_itself_premium(self):
        response = self.post("/api/register/", self.registration(plan="Premium", premium_until="2099-01-01"))
        self.assertEqual(response.json()["membership"]["plan"], "Free")

    def test_login_and_registration_are_rate_limited_in_database(self):
        for _ in range(10):
            self.assertEqual(self.post("/api/login/", {"username": "owner", "password": "bad"}).status_code, 401)
        self.assertEqual(self.post("/api/login/", {}).status_code, 429)
        self.assertEqual(AuthRateLimit.objects.count(), 1)
        for _ in range(5):
            self.assertEqual(self.post("/api/register/", {}).status_code, 400)
        self.assertEqual(self.post("/api/register/", {}).status_code, 429)
        AuthRateLimit.objects.update(expires=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("/api/login/", {"username": "owner", "password": "Strong-password-294!"}).status_code, 200)

    def test_free_owns_only_and_premium_sees_entire_pool_without_secrets(self):
        response = self.client.get("/api/workspace/").json()
        self.assertEqual([a["id"] for a in response["accounts"]], [str(self.own.pk)])
        self.premium()
        response = self.client.get("/api/workspace/")
        rows = {a["id"]: a for a in response.json()["accounts"]}
        self.assertEqual(len(rows), 2)
        self.assertTrue(rows[str(self.own.pk)]["owned"])
        self.assertFalse(rows[str(self.shared.pk)]["owned"])
        self.assertNotIn("private", response.content.decode())
        self.assertNotIn("apiHash", response.content.decode())
        self.assertEqual(response.json()["membership"]["plan"], "Premium")

    def test_shared_profile_check_photo_and_delete_permissions(self):
        self.shared.avatar = b"photo"
        self.shared.save()
        for path in ("profile/", "check/"):
            self.assertEqual(self.post(f"/api/accounts/{self.shared.pk}/{path}", {}).status_code, 404)
        self.premium()
        with patch("accounts.telegram.update_account", return_value=[]), patch("accounts.checks.check_account", return_value=[]):
            self.assertEqual(self.post(f"/api/accounts/{self.shared.pk}/profile/", {}).status_code, 200)
            self.assertEqual(self.post(f"/api/accounts/{self.shared.pk}/check/", {}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/accounts/{self.shared.pk}/avatar/").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/accounts/{self.shared.pk}/").status_code, 403)
        self.assertTrue(Account.objects.filter(pk=self.shared.pk).exists())
        self.premium(timedelta(seconds=-1))
        self.assertEqual(self.client.get(f"/api/accounts/{self.shared.pk}/avatar/").status_code, 404)
        self.assertEqual(self.client.get("/api/status/").json()["membership"]["plan"], "Free")

    def test_free_publication_rejected_and_expiry_blocks_existing_premium_queue(self):
        data = {"mode": "messages", "text": "Ответ", "targets": ["@group"], "accountIds": [str(self.shared.pk)]}
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.post("/api/publications/", data).status_code, 400)
            factory.assert_not_called()
        self.premium()
        with patch("accounts.telegram.client_for", return_value=PublicationClient()):
            response = self.post("/api/publications/", data)
        self.assertEqual(response.status_code, 201)
        batch = response.json()["publication"]
        self.premium(timedelta(seconds=-1))
        with patch("accounts.telegram.client_for") as factory:
            result = self.post(f"/api/publications/{batch['id']}/deliveries/{batch['deliveries'][0]['id']}/", {"confirmed": True})
            self.assertEqual(result.status_code, 404)
            factory.assert_not_called()

    def test_premium_warmup_stops_after_expiry(self):
        self.premium()
        job = warmup.start(self.owner, {"accountIds": [str(self.own.pk), str(self.shared.pk)], "messages": ["Привет"]})
        job.participants.update(next_message_at=timezone.now() - timedelta(seconds=1))
        self.premium(timedelta(seconds=-1))
        with patch("accounts.warmup.send_message") as send:
            warmup.tick()
            send.assert_not_called()
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")

    def test_report_drafts_remain_private_between_premium_users(self):
        self.premium()
        response = self.post(f"/api/accounts/{self.shared.pk}/report/", {"kind": "peer", "target": "@bad_actor", "reason": "spam"})
        self.assertEqual(response.status_code, 201)
        draft = ReportDraft.objects.get(pk=response.json()["report"]["id"])
        self.assertEqual(draft.owner_id, self.owner.pk)
        self.client.force_login(self.other)
        with patch("accounts.reports.advance") as advance:
            self.assertEqual(self.post(f"/api/accounts/{self.shared.pk}/report/{draft.pk}/", {"confirmed": True}).status_code, 404)
            advance.assert_not_called()

    def test_premium_activation_extension_revocation(self):
        call_command("set_premium", "owner", days=30, verbosity=0)
        first = Membership.objects.get(owner=self.owner).premium_until
        call_command("set_premium", "owner", days=30, verbosity=0)
        self.assertEqual(Membership.objects.get(owner=self.owner).premium_until, first + timedelta(days=30))
        call_command("set_premium", "owner", revoke=True, verbosity=0)
        self.assertIsNone(Membership.objects.get(owner=self.owner).premium_until)

    def test_cancel_login_attempt_remains_available(self):
        self.assertEqual(self.client.delete(f"/api/telegram/login/{uuid.uuid4()}/").status_code, 200)
