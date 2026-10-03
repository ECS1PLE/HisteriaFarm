import json
from contextlib import contextmanager
import fcntl
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ValidationError

def encrypt(value):
    return Fernet(settings.SESSION_ENCRYPTION_KEY).encrypt(json.dumps(value).encode()).decode()

def decrypt(value):
    return json.loads(Fernet(settings.SESSION_ENCRYPTION_KEY).decrypt(value.encode()))

@contextmanager
def session_lock(key, blocking=False):
    path = settings.VAR_DIR / f"lock-{key}"
    with path.open("a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError:
            raise ValidationError("Этот аккаунт уже выполняет операцию. Повтори позже.")
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
