import io
import json
import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.utils import timezone
from PIL import Image
from telethon import functions, errors
from .models import Account, LoginAttempt, TelegramSettings
from .security import encrypt, decrypt, session_lock
from . import telegram

class FakeClient:
    def __init__(self, two_factor=False, reject_username=False):
        self.two_factor = two_factor
        self.reject_username = reject_username
        self.me = SimpleNamespace(id=12345, first_name="Анна", last_name="", username="anna_test", phone="79991234567", premium=False)
        self.bio = "Описание"
        self.session = SimpleNamespace(save=lambda: "private-session")
        self.disconnected = False
        self.requests = []
        self.uploaded = None
    async def connect(self): pass
    async def disconnect(self): self.disconnected = True
    async def is_user_authorized(self): return True
    async def send_code_request(self, phone):
        return SimpleNamespace(phone_code_hash="private-hash", type=SimpleNamespace())
    async def sign_in(self, **kwargs):
        if self.two_factor and not kwargs.get("password"):
            raise errors.SessionPasswordNeededError(None)
        if kwargs.get("code") == "00000":
            raise errors.PhoneCodeInvalidError(None)
        return self.me
    async def get_me(self): return self.me
    async def download_profile_photo(self, *args, **kwargs): return None
    async def upload_file(self, file):
        self.uploaded = file.getvalue()
        return file
    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(request, functions.account.UpdateProfileRequest):
            self.me.first_name = request.first_name
            self.me.last_name = request.last_name
            self.bio = request.about
        elif isinstance(request, functions.account.UpdateUsernameRequest):
            if self.reject_username: raise errors.UsernameOccupiedError(None)
            self.me.username = request.username
        return SimpleNamespace(full_user=SimpleNamespace(about=self.bio))

class ApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(username="owner", password="password-test-123")
        self.other = get_user_model().objects.create_user(username="other", password="password-test-123")
        self.client.force_login(self.user)
        self.creds = {"apiId": 123, "apiHash": "a" * 32}
        TelegramSettings.objects.create(owner=self.user, credentials=encrypt(self.creds))
        self.account = Account.objects.create(owner=self.user, telegram_id=12345, first_name="Анна", username="anna_test", phone="+79991234567", session=encrypt({"session": "private-session", "credentials": self.creds}))
    def post(self, url, body):
        return self.client.post(url, json.dumps(body), content_type="application/json")
    def test_authentication_and_csrf(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.get("/api/workspace/").status_code, 401)
        token = browser.get("/api/status/").json()["csrfToken"]
        self.assertEqual(browser.post("/api/login/", json.dumps({"username": "owner", "password": "password-test-123"}), content_type="application/json").status_code, 403)
        response = browser.post("/api/login/", json.dumps({"username": "owner", "password": "password-test-123"}), content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()["csrfToken"], token)
        self.assertEqual(browser.get("/api/workspace/").status_code, 200)
    def test_session_is_encrypted_and_not_exposed(self):
        self.assertNotIn("private-session", self.account.session)
        self.assertEqual(decrypt(self.account.session)["session"], "private-session")
        response = self.client.get("/api/workspace/")
        text = response.content.decode()
        self.assertNotIn("private-session", text)
        self.assertNotIn("apiHash", text)
        self.assertNotIn("credentials", text)
        self.assertEqual(len(response.json()["accounts"]), 1)
    def test_ownership_is_enforced(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get("/api/workspace/").json()["accounts"], [])
        self.assertEqual(self.post(f"/api/accounts/{self.account.id}/profile/", {}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/accounts/{self.account.id}/").status_code, 404)
    def test_credentials_are_encrypted(self):
        response = self.post("/api/telegram/settings/", {"apiId": 777, "apiHash": "b" * 32})
        self.assertEqual(response.status_code, 200)
        raw = TelegramSettings.objects.get(owner=self.user).credentials
        self.assertNotIn("b" * 32, raw)
        self.assertEqual(decrypt(raw)["apiId"], 777)
    def test_phone_validation(self):
        self.assertEqual(self.post("/api/telegram/login/", {"phone": "bad"}).status_code, 400)
    def test_login_code_and_two_factor(self):
        self.account.delete()
        fake = FakeClient(two_factor=True)
        with patch("accounts.telegram.client_for", return_value=fake):
            response = self.post("/api/telegram/login/", {"phone": "+79991234567", "group": "Резерв"})
            self.assertEqual(response.status_code, 200)
            attempt_id = response.json()["attemptId"]
            attempt = LoginAttempt.objects.get(pk=attempt_id)
            self.assertNotIn("private-hash", attempt.payload)
            response = self.post(f"/api/telegram/login/{attempt_id}/", {"code": "12345"})
            self.assertEqual(response.json()["step"], "password")
            response = self.post(f"/api/telegram/login/{attempt_id}/", {"password": "not-persisted-password"})
            self.assertEqual(response.json()["step"], "done")
        account = Account.objects.get()
        self.assertEqual(account.group, "Резерв")
        self.assertNotIn("not-persisted-password", json.dumps(decrypt(account.session)))
        self.assertFalse(LoginAttempt.objects.exists())
        self.assertTrue(fake.disconnected)
    def test_invalid_code_and_expired_attempt(self):
        row = LoginAttempt.objects.create(owner=self.user, expires=timezone.now()+timedelta(minutes=5), payload=encrypt({"credentials": self.creds, "session": "", "phone": "+70000000000", "hash": "hash"}))
        with patch("accounts.telegram.client_for", return_value=FakeClient()):
            response = self.post(f"/api/telegram/login/{row.id}/", {"code": "00000"})
            self.assertEqual(response.status_code, 400)
            self.assertIn("Неверный код", response.json()["error"])
        row.expires = timezone.now()-timedelta(seconds=1)
        row.save()
        self.assertEqual(self.post(f"/api/telegram/login/{row.id}/", {"code": "12345"}).status_code, 410)
    def test_profile_update_and_partial_username_error(self):
        fake = FakeClient(reject_username=True)
        with patch("accounts.telegram.client_for", return_value=fake):
            response = self.post(f"/api/accounts/{self.account.id}/profile/", {"firstName": "Мария", "lastName": "Л", "username": "taken_name", "bio": "Новое описание"})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["account"]["firstName"], "Мария")
        self.assertEqual(result["account"]["username"], "anna_test")
        self.assertIn("уже занят", result["errors"][0])
        self.account.refresh_from_db()
        self.assertEqual(self.account.bio, "Новое описание")
        self.assertTrue(fake.disconnected)
    def test_empty_username_removes_tag(self):
        with patch("accounts.telegram.client_for", return_value=FakeClient()):
            response = self.post(f"/api/accounts/{self.account.id}/profile/", {"username": ""})
        self.assertEqual(response.json()["account"]["username"], "")
    def test_profile_validation_prevents_remote_call(self):
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.post(f"/api/accounts/{self.account.id}/profile/", {"username": "no.dot"}).status_code, 400)
            self.assertEqual(self.post(f"/api/accounts/{self.account.id}/profile/", {"bio": "a"*71}).status_code, 400)
            factory.assert_not_called()
    def test_account_check_reports_real_failure(self):
        with patch("accounts.telegram.client_for") as factory:
            factory.return_value = FakeClient()
            factory.return_value.connect = failing_connection
            response = self.post(f"/api/accounts/{self.account.id}/", {})
        self.assertEqual(response.status_code, 400)
        self.account.refresh_from_db()
        self.assertEqual(self.account.status, "error")
    def test_parallel_operations_are_rejected(self):
        with session_lock(self.account.id):
            response = self.client.patch(f"/api/accounts/{self.account.id}/", json.dumps({"group": "Резерв"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.account.refresh_from_db()
        self.assertEqual(self.account.group, "Основная")
    def test_avatar_normalization(self):
        source = io.BytesIO()
        Image.new("RGB", (800, 400), "red").save(source, "PNG")
        result = telegram.normalize_avatar(SimpleUploadedFile("test.png", source.getvalue(), content_type="image/png"))
        with Image.open(io.BytesIO(result)) as img:
            self.assertEqual(img.size, (640, 640))
            self.assertEqual(img.format, "JPEG")
        with self.assertRaises(ValidationError):
            telegram.normalize_avatar(SimpleUploadedFile("bad.png", b"not an image"))
    def test_avatar_endpoint_requires_owner(self):
        self.account.avatar = b"photo"
        self.account.save()
        response = self.client.get(f"/api/accounts/{self.account.id}/avatar/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f"/api/accounts/{self.account.id}/avatar/").status_code, 404)
    def test_multipart_avatar_is_uploaded_to_telegram(self):
        source = io.BytesIO()
        Image.new("RGB", (100, 100), "blue").save(source, "PNG")
        fake = FakeClient()
        with patch("accounts.telegram.client_for", return_value=fake):
            response = self.client.post(f"/api/accounts/{self.account.id}/profile/", {
                "profile": json.dumps({"firstName": "Анна", "bio": "Описание"}),
                "avatar": SimpleUploadedFile("avatar.png", source.getvalue(), content_type="image/png"),
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["errors"], [])
        self.assertTrue(any(isinstance(r, functions.photos.UploadProfilePhotoRequest) for r in fake.requests))
        with Image.open(io.BytesIO(fake.uploaded)) as img:
            self.assertEqual(img.size, (640, 640))
    def test_malformed_json_object_is_rejected(self):
        self.assertEqual(self.post("/api/telegram/settings/", []).status_code, 400)
        self.assertEqual(self.post(f"/api/accounts/{self.account.id}/profile/", []).status_code, 400)
    def test_reauthorize_account_with_revoked_session(self):
        self.account.status = "error"
        self.account.save()
        with patch("accounts.telegram.client_for", return_value=FakeClient()):
            response = self.post("/api/telegram/login/", {"phone": self.account.phone})
            self.assertEqual(response.status_code, 200)
            response = self.post(f"/api/telegram/login/{response.json()['attemptId']}/", {"code": "12345"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["account"]["id"], str(self.account.id))
        self.assertEqual(Account.objects.count(), 1)
        self.account.refresh_from_db()
        self.assertEqual(self.account.status, "ready")
    def test_delete_does_not_logout_telegram(self):
        with patch("accounts.telegram.client_for") as factory:
            self.assertEqual(self.client.delete(f"/api/accounts/{self.account.id}/").status_code, 200)
            factory.assert_not_called()
        self.assertFalse(Account.objects.exists())

async def failing_connection():
    raise OSError("network unavailable")
