"""One policy for HTTP endpoints, publication queues and background workers."""
from django.utils import timezone
from .models import Account, Membership


def membership(owner):
    row = Membership.objects.filter(owner=owner).first()
    until = row.premium_until if row else None
    premium = bool(owner.is_active and until and until > timezone.now())
    return {"plan": "Premium" if premium else "Free", "priceRub": 100,
            "premiumUntil": until.isoformat() if until else None}


def available_accounts(owner):
    if not owner.is_active:
        return Account.objects.none()
    if membership(owner)["plan"] == "Premium":
        return Account.objects.filter(owner__is_active=True)
    return Account.objects.filter(owner=owner)


def can_use(owner, account):
    return available_accounts(owner).filter(pk=account.pk).exists()
