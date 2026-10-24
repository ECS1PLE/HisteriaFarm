import hashlib
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from .models import AuthRateLimit
from .security import session_lock


def allow_attempt(request, kind, limit):
    # Persist across WSGI workers and restarts. Trust only REMOTE_ADDR, not client headers.
    address = request.META.get("REMOTE_ADDR", "")
    if settings.TRUST_PROXY_CLIENT_IP and address in ("127.0.0.1", "::1"):
        address = request.META.get("HTTP_X_REAL_IP", address)
    key = hashlib.sha256(f"{kind}:{address}".encode()).hexdigest()
    with session_lock(f"rate-{key}", blocking=True):
        now = timezone.now()
        row, _ = AuthRateLimit.objects.get_or_create(key=key, defaults={"expires": now + timedelta(minutes=5)})
        if row.expires <= now:
            row.attempts, row.expires = 0, now + timedelta(minutes=5)
        if row.attempts >= limit:
            return False
        row.attempts += 1
        row.save()
        AuthRateLimit.objects.filter(expires__lt=now).exclude(pk=key).delete()
        return True
