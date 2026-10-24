from datetime import timedelta
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from accounts.models import Membership
from accounts.telegram import record


class Command(BaseCommand):
    help = "Activate Premium after verified payment, or revoke with --revoke."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--days", type=int, default=30)
        parser.add_argument("--revoke", action="store_true")

    def handle(self, username, days, revoke, **options):
        if not 1 <= days <= 3650:
            raise CommandError("--days должен быть от 1 до 3650.")
        user = get_user_model().objects.filter(username=username, is_active=True).first()
        if not user:
            raise CommandError("Активный пользователь не найден.")
        from accounts.security import session_lock
        with session_lock(f"membership-{user.pk}", blocking=True):
            row, _ = Membership.objects.get_or_create(owner=user)
            row.premium_until = None if revoke else max(timezone.now(), row.premium_until or timezone.now()) + timedelta(days=days)
            row.save(update_fields=["premium_until"])
            record(user, "Тариф изменён", "Free" if revoke else f"Premium до {row.premium_until.isoformat()}")
        self.stdout.write(self.style.SUCCESS("Free" if revoke else f"Premium до {row.premium_until.isoformat()}"))
