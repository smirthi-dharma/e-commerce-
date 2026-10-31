"""Customer self-service account deletion.

Orders, invoices, wallet entries and referral records reference the user with
PROTECT, and order/invoice records must be kept for tax and accounting. So the
account is anonymised rather than removed: identifying profile data is erased,
saved personal content is deleted, sign-in is disabled and every session is
revoked.
"""
import secrets

from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.customer_services.models import SecurityEvent
from apps.orders.models import Order

from .models import User

OPEN_ORDER_STATUSES = [
    Order.Status.PENDING,
    Order.Status.CONFIRMED,
    Order.Status.PROCESSING,
    Order.Status.PACKED,
    Order.Status.PICKED_UP,
    Order.Status.OUT_FOR_DELIVERY,
]
DELETED_EMAIL_DOMAIN = "deleted.invalid"


def is_deleted(user):
    return user.email.endswith(f"@{DELETED_EMAIL_DOMAIN}")


def delete_customer_account(user):
    if user.role != User.Role.CUSTOMER or user.is_staff:
        raise ValidationError({"detail": "Staff accounts cannot be deleted here. Contact the store owner."})
    if user.orders.filter(status__in=OPEN_ORDER_STATUSES).exists():
        raise ValidationError({"detail": "You have an order in progress. You can delete your account once it is delivered or cancelled."})

    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        user.saved_addresses.all().delete()
        user.wishlist_items.all().delete()
        user.customer_questions.all().delete()
        user.service_requests.all().delete()
        user.support_tickets.all().delete()
        if hasattr(user, "reseller_profile"):
            user.reseller_profile.application_note = ""
            user.reseller_profile.save(update_fields=["application_note", "updated_at"])
        SecurityEvent.objects.filter(email__iexact=user.email).update(email="")

        user.email = f"deleted-{user.pk}-{secrets.token_hex(4)}@{DELETED_EMAIL_DOMAIN}"
        user.phone = f"deleted-{user.pk}"
        user.first_name = ""
        user.last_name = ""
        user.is_active = False
        user.admin_modules = []
        user.set_unusable_password()
        user.save()

        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
    return user
