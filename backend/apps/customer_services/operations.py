"""One delivery policy shared by the storefront, quotes and order placement."""
import re
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import DeliveryArea, SystemSettings


def delivery_policy(settings=None, pin=None):
    from apps.orders.models import Order
    settings = settings or SystemSettings.current()
    areas = list(DeliveryArea.objects.all())
    pins = [area.pin_code for area in areas if area.is_active] if areas else settings.delivery_pin_codes
    area = next((area for area in areas if area.is_active and area.pin_code == pin), None)
    fee = area.delivery_fee if area and area.delivery_fee is not None else settings.delivery_fee
    active = Order.objects.exclude(status__in=["delivered", "cancelled"]).count()
    now = timezone.localtime().time()
    opening, closing = settings.opens_at, settings.closes_at
    within_hours = opening <= now < closing if opening < closing else now >= opening or now < closing
    reason = ""
    if settings.orders_paused:
        reason = settings.pause_message or "The store has temporarily paused new orders."
    elif settings.enforce_opening_hours and not within_hours:
        reason = f"The store is closed. Ordering resumes at {opening.strftime('%H:%M')}."
    elif settings.max_active_orders and active >= settings.max_active_orders:
        reason = "We are preparing existing orders. Please check back shortly."
    match = re.fullmatch(r"(\d+)(?:[–-](\d+))?\s+(minutes|hours)", settings.delivery_timeline.strip())
    base = int(match.group(1)) * (60 if match.group(3) == "hours" else 1) if match else 30
    upper = int(match.group(2) or match.group(1)) * (60 if match.group(3) == "hours" else 1) if match else 30
    delay = min(active * settings.packing_minutes_per_order, 120)
    return {
        "delivery_pin_codes": pins,
        "delivery_fee": fee,
        "accepting_orders": not reason,
        "availability_message": reason,
        "estimated_minutes_min": base + delay,
        "estimated_minutes_max": max(base + delay + 10, upper + delay),
        "estimate_basis": "Configured delivery window plus current store preparation queue",
    }


def require_delivery(settings, pin):
    policy = delivery_policy(settings, pin)
    if pin not in policy["delivery_pin_codes"]:
        raise ValidationError({"delivery_pin_code": "Delivery is not available for this PIN code."})
    if not policy["accepting_orders"]:
        raise ValidationError({"detail": policy["availability_message"]})
    return policy
