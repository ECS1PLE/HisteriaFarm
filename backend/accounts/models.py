import uuid
from django.conf import settings
from django.db import models
class TelegramSettings(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    credentials = models.TextField()

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
    payload = models.TextField()
    state = models.CharField(max_length=16, default="confirm")
    expires = models.DateTimeField()

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

    class Meta:
        constraints = [models.UniqueConstraint(fields=["job", "account"], name="unique_warmup_participant")]
