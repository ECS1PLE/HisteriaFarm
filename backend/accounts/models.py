import uuid
from django.conf import settings
from django.db import models
class TelegramSettings(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    credentials = models.TextField()

class Membership(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    premium_until = models.DateTimeField(null=True, blank=True)
    email = models.EmailField(unique=True, null=True, blank=True)

class AuthRateLimit(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    attempts = models.PositiveIntegerField(default=0)
    expires = models.DateTimeField()

class Account(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    telegram_id = models.BigIntegerField(unique=True)
    session = models.TextField()
    first_name = models.CharField(max_length=64)
    last_name = models.CharField(max_length=64, blank=True)
    username = models.CharField(max_length=32, blank=True)
    bio = models.TextField(blank=True)
    phone = models.CharField(max_length=20)
    group = models.CharField(max_length=64, default="Основная")
    status = models.CharField(max_length=16, default="ready")
    premium = models.BooleanField(default=False)
    avatar = models.BinaryField(null=True)
    last_active = models.DateTimeField(auto_now=True)
    error = models.CharField(max_length=255, blank=True)

    session_status = models.CharField(max_length=16, default="unchecked")
    session_checked_at = models.DateTimeField(null=True, blank=True)
    session_error = models.CharField(max_length=255, blank=True)
    spam_status = models.CharField(max_length=16, default="unchecked")
    spam_checked_at = models.DateTimeField(null=True, blank=True)
    spam_detail = models.TextField(blank=True)
    check_retry_at = models.DateTimeField(null=True, blank=True)

class LoginAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    payload = models.TextField()
    expires = models.DateTimeField()
    
class Activity(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=128)
    detail = models.CharField(max_length=255)
    type = models.CharField(max_length=16, default="info")
    created_at = models.DateTimeField(auto_now_add=True)

class ReportDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True)
    payload = models.TextField()
    state = models.CharField(max_length=16, default="confirm")
    expires = models.DateTimeField()

class PublicationBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    payload = models.TextField()
    expires = models.DateTimeField()
    cancelled = models.BooleanField(default=False)
    error = models.CharField(max_length=255, blank=True)

class PublicationDelivery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(PublicationBatch, on_delete=models.CASCADE, related_name="deliveries")
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    target_index = models.PositiveIntegerField()
    state = models.CharField(max_length=16, default="pending")
    message_id = models.PositiveIntegerField(null=True)
    error = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["batch", "account", "target_index"], name="one_publication_per_account_target")]

class WarmupJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    status = models.CharField(max_length=16, default="running")
    messages = models.JSONField()
    started_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    error = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner"], condition=models.Q(status="running"), name="one_running_warmup_per_owner")]

class WarmupParticipant(models.Model):
    job = models.ForeignKey(WarmupJob, on_delete=models.CASCADE, related_name="participants")
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    next_message_at = models.DateTimeField()
    sent = models.PositiveIntegerField(default=0)
    failures = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["job", "account"], name="unique_warmup_participant")]

class MonitorRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    mode = models.CharField(max_length=16, choices=[("channel", "Канал"), ("chat", "Чат")])
    target = models.CharField(max_length=255)
    target_id = models.BigIntegerField()
    title = models.CharField(max_length=255)
    keyword = models.CharField(max_length=200, blank=True)
    text = models.TextField()
    status = models.CharField(max_length=16, default="running", db_index=True)
    cursor = models.BigIntegerField(default=0)
    sent = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=255, blank=True)
    next_poll_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

class MonitorDelivery(models.Model):
    rule = models.ForeignKey(MonitorRule, on_delete=models.CASCADE, related_name="deliveries")
    message_id = models.BigIntegerField()
    state = models.CharField(max_length=16, default="attempted")
    error = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["rule", "message_id"], name="one_monitor_reply_per_message")]

class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=32, unique=True)
    password = models.CharField(max_length=128)
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
