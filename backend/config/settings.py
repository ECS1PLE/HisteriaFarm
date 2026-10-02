import os
from pathlib import Path
from dotenv import load_dotenv
from cryptography.fernet import Fernet
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
VAR_DIR = BASE_DIR / "var"
VAR_DIR.mkdir(mode=0o700, exist_ok=True)
def persistent_secret(name, factory):
    value = os.environ.get(name)
    if value:
        return value
    path = VAR_DIR / name.lower()
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return path.read_text().strip()
    with os.fdopen(fd, "w") as f:
        value = factory()
        f.write(value)
    return value
SECRET_KEY = persistent_secret("DJANGO_SECRET_KEY", lambda: __import__("secrets").token_urlsafe(64))
SESSION_ENCRYPTION_KEY = persistent_secret("SESSION_ENCRYPTION_KEY", lambda: Fernet.generate_key().decode())
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "accounts"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware"]
ROOT_URLCONF = "config.urls"
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": VAR_DIR / "db.sqlite3", "OPTIONS": {"timeout": 30}}}
AUTH_PASSWORD_VALIDATORS = [
 {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
 {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
 {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
 {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Moscow"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
CSRF_TRUSTED_ORIGINS = os.getenv("CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174").split(",")
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SESSION_COOKIE_AGE = 86400
DATA_UPLOAD_MAX_MEMORY_SIZE = 7 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID", "")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")

CSRF_FAILURE_VIEW = "accounts.views.csrf_failure"
