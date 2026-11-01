from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.catalog.models import Product
from .models import InventoryMovement, Order, OrderItem, OrderStatusEvent


@transaction.atomic
def place_order(*, customer, payload, quote_only=False):
    import hashlib
    import json
    from apps.accounts.models import User
    from apps.referrals.models import ReferralProgram, WalletLedger
    from apps.referrals.wallet import balance
    from apps.catalog.availability import sale_date_filter

    customer = User.objects.select_for_update().get(pk=customer.pk)
    checkout_key = None if quote_only else payload.get("checkout_key")
    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()
    if checkout_key:
        previous = Order.objects.filter(checkout_key=checkout_key).first()
        if previous:
            if (
                previous.customer_id != customer.pk
                or previous.checkout_fingerprint != fingerprint
            ):
                raise ValidationError(
                    {
                        "checkout_key": "This checkout key has already been used for another order."
                    }
                )
            return previous
    if payload.get("use_wallet") and not checkout_key and not quote_only:
        raise ValidationError(
            {"checkout_key": "A checkout key is required for wallet payments."}
        )
    if payload.get("payment_method", "cod") != "cod":
        raise ValidationError(
            {"payment_method": "Only Cash on Delivery is currently available."}
        )
    lines = payload.get("items", [])
    if not lines:
        raise ValidationError({"items": "Add at least one item to your cart."})
    if len(lines) > 100:
        raise ValidationError(
            {"items": "An order cannot contain more than 100 line items."}
        )
    product_ids = [line.get("product_id") for line in lines]
    if None in product_ids or len(product_ids) != len(set(product_ids)):
        raise ValidationError(
            {"items": "Each product must appear once with a valid product ID."}
        )
    products = {
        product.id: product
        for product in Product.objects.select_for_update()
        .select_related("category")
        .filter(
            id__in=product_ids,
            is_active=True,
            category__is_active=True,
        )
        .order_by("pk")
        .filter(sale_date_filter())
    }
    if len(products) != len(product_ids):
        raise ValidationError({"items": "One or more products are unavailable."})
    order_lines = []
    subtotal = Decimal("0.00")
    for line in lines:
        quantity = line.get("quantity")
        product = products[line["product_id"]]
        if (
            not isinstance(quantity, int)
            or isinstance(quantity, bool)
            or quantity < 1
            or quantity > 99
        ):
            raise ValidationError(
                {"items": f"Quantity for {product.name} must be between 1 and 99."}
            )
        if product.stock < quantity:
            raise ValidationError({"items": f"Not enough stock for {product.name}."})
        amount = product.price * quantity
        subtotal += amount
        order_lines.append((product, quantity, amount))
    from apps.customer_services.models import (
        Coupon,
        CouponRedemption,
        PaymentTransaction,
        SystemSettings,
    )

    settings = SystemSettings.current()
    if not quote_only:
        settings = SystemSettings.objects.select_for_update().get(pk=settings.pk)
    pin_code = payload.get("delivery_pin_code", "").strip()
    if not pin_code:
        raise ValidationError({"delivery_pin_code": "Enter a delivery PIN code."})
    from apps.customer_services.operations import delivery_policy, require_delivery
    policy = delivery_policy(settings, pin_code) if quote_only else require_delivery(settings, pin_code)
    if pin_code not in policy["delivery_pin_codes"]:
        raise ValidationError({"delivery_pin_code": "Delivery is not available for this PIN code."})
    coupon = None
    discount = Decimal("0.00")
    code = payload.get("coupon_code", "").strip().upper()
    if code:
        now = timezone.now()
        coupon = (
            Coupon.objects.select_for_update()
            .filter(
                code__iexact=code,
                is_active=True,
                starts_at__lte=now,
                expires_at__gt=now,
            )
            .first()
        )
        if not coupon:
            raise ValidationError(
                {"coupon_code": "This coupon is not currently available."}
            )
        if subtotal < coupon.minimum_purchase:
            raise ValidationError(
                {
                    "coupon_code": f"This coupon requires a minimum purchase of ₹{coupon.minimum_purchase}."
                }
            )
        if (
            coupon.usage_limit is not None
            and coupon.redemptions.count() >= coupon.usage_limit
        ):
            raise ValidationError(
                {"coupon_code": "This coupon has reached its usage limit."}
            )
        customer_uses = coupon.redemptions.filter(customer=customer).count()
        if customer_uses >= coupon.per_customer_limit:
            raise ValidationError(
                {"coupon_code": "You have reached the usage limit for this coupon."}
            )
        if (
            coupon.new_customer_only
            and Order.objects.filter(customer=customer).exists()
        ):
            raise ValidationError(
                {"coupon_code": "This coupon is available to new customers only."}
            )
        eligible_total = Decimal("0.00")
        product_restrictions = set(coupon.products.values_list("pk", flat=True))
        category_restrictions = set(coupon.categories.values_list("pk", flat=True))
        restrictions = product_restrictions or category_restrictions
        for product, quantity, amount in order_lines:
            if (
                not restrictions
                or product.pk in product_restrictions
                or product.category_id in category_restrictions
            ):
                eligible_total += amount
        if eligible_total <= 0:
            raise ValidationError(
                {"coupon_code": "This coupon does not apply to items in your basket."}
            )
        if coupon.discount_type == Coupon.DiscountType.PERCENT:
            discount = eligible_total * coupon.value / Decimal("100")
        else:
            discount = coupon.value
        if coupon.maximum_discount is not None:
            discount = min(discount, coupon.maximum_discount)
        discount = min(discount.quantize(Decimal("0.01")), eligible_total)
    merchandise_total = max(subtotal - discount, Decimal("0.00"))
    if merchandise_total < settings.minimum_order_value and not quote_only:
        raise ValidationError(
            {
                "items": f"The minimum merchandise order value after discounts is ₹{settings.minimum_order_value}."
            }
        )
    delivery_fee = policy["delivery_fee"]
    if (
        settings.free_delivery_threshold is not None
        and merchandise_total > settings.free_delivery_threshold
    ):
        delivery_fee = Decimal("0.00")
    total = merchandise_total + delivery_fee
    wallet_amount = Decimal("0.00")
    if payload.get("use_wallet"):
        if customer.role != "customer":
            raise ValidationError(
                {
                    "use_wallet": "Referral wallet payments are available to customers only."
                }
            )
        program = ReferralProgram.current()
        if not program.wallet_spending_enabled:
            raise ValidationError(
                {"use_wallet": "Wallet payments are currently disabled."}
            )
        wallet_amount = min(total, max(Decimal("0.00"), balance(customer)))
    if quote_only:
        return {
            "subtotal": subtotal, "discount_amount": discount, "merchandise_total": merchandise_total,
            "delivery_fee": delivery_fee, "total": total, "wallet_amount": wallet_amount,
            "amount_due": total - wallet_amount, "minimum_order_value": settings.minimum_order_value,
            "remaining_for_minimum": max(Decimal("0"), settings.minimum_order_value - merchandise_total),
            "eligible": merchandise_total >= settings.minimum_order_value and policy["accepting_orders"],
            "availability_message": policy["availability_message"],
            "estimated_minutes_min": policy["estimated_minutes_min"], "estimated_minutes_max": policy["estimated_minutes_max"],
        }
    if payload.get("expected_wallet_amount") is not None and payload["expected_wallet_amount"] != wallet_amount:
        raise ValidationError({"expected_wallet_amount": "Wallet balance changed. Refresh your quote before confirming the payment split."})
    if payload.get("expected_total") is not None and payload["expected_total"] != total:
        raise ValidationError({"expected_total": "Prices changed. Refresh your order quote before confirming."})
    order = Order.objects.create(
        estimated_delivery_at=timezone.now() + timedelta(minutes=policy["estimated_minutes_min"]),
        estimated_delivery_latest_at=timezone.now() + timedelta(minutes=policy["estimated_minutes_max"]),
        wallet_amount=wallet_amount,
        checkout_key=checkout_key,
        checkout_fingerprint=fingerprint,
        customer=customer,
        customer_name=payload["customer_name"].strip(),
        phone=payload["phone"].strip(),
        address=payload["address"].strip(),
        instructions=payload.get("instructions", "").strip(),
        subtotal=subtotal,
        coupon=coupon,
        discount_amount=discount,
        delivery_pin_code=pin_code,
        delivery_fee=delivery_fee,
        total=total,
    )
    for product, quantity, amount in order_lines:
        product.stock -= quantity
        product.save(update_fields=["stock"])
        OrderItem.objects.create(
            order=order,
            product=product,
            category_snapshot=product.category,
            product_name=product.name,
            sku=product.sku,
            unit_price=product.price,
            quantity=quantity,
            line_total=amount,
        )
        InventoryMovement.objects.create(
            order=order,
            product=product,
            kind=InventoryMovement.Kind.SALE,
            quantity=quantity,
        )
    if coupon:
        CouponRedemption.objects.create(
            coupon=coupon, customer=customer, order=order, discount_amount=discount
        )
    if wallet_amount:
        WalletLedger.objects.create(
            customer=customer,
            order=order,
            amount=-wallet_amount,
            transaction_type="redemption",
            description=f"Wallet payment for {order.order_number}",
            idempotency_key=f"checkout:{order.pk}",
        )
    if total > wallet_amount:
        PaymentTransaction.objects.create(
            order=order,
            method=PaymentTransaction.Method.COD,
            status=PaymentTransaction.Status.PENDING,
            amount=total - wallet_amount,
        )
    else:
        order.payment_status = Order.PaymentStatus.PAID
        order.save(update_fields=["payment_status"])
    OrderStatusEvent.objects.create(
        order=order, status=order.status, kind="placed", actor=customer
    )
    return order


ORDER_TRANSITIONS = {
    "pending": ["confirmed", "cancelled"],
    "confirmed": ["processing", "cancelled"],
    "processing": ["packed", "cancelled"],
    "packed": ["picked_up", "cancelled"],
    "picked_up": ["out_for_delivery", "cancelled"],
    "out_for_delivery": ["delivered", "cancelled"],
    "delivered": [],
    "cancelled": [],
}
CUSTOMER_CANCELABLE = {"pending", "confirmed", "processing", "packed", "picked_up"}


def check_version(order, expected_version):
    if expected_version is not None and order.status_version != expected_version:
        raise ValidationError(
            {"status": "This order changed. Refresh it before trying again."}
        )


@transaction.atomic
def change_order_status(*, order, new_status, actor=None, expected_version=None):
    order = Order.objects.select_for_update().get(pk=order.pk)
    check_version(order, expected_version)
    if new_status not in Order.Status.values:
        raise ValidationError({"status": "Unknown order status."})
    if actor and actor.role == "customer":
        if (
            actor.pk != order.customer_id
            or new_status != "cancelled"
            or order.status not in CUSTOMER_CANCELABLE
        ):
            raise ValidationError(
                {"status": "This order can no longer be cancelled by the customer."}
            )
    if new_status not in ORDER_TRANSITIONS[order.status]:
        raise ValidationError(
            {"status": f"Cannot move an order from {order.status} to {new_status}."}
        )
    old_status = order.status
    order.status = new_status
    order.status_version += 1
    order.save(update_fields=["status", "status_version", "updated_at"])
    from apps.customer_services.models import DeliveryAssignment

    if new_status in {
        Order.Status.CONFIRMED,
        Order.Status.PROCESSING,
        Order.Status.PACKED,
        Order.Status.PICKED_UP,
    }:
        DeliveryAssignment.objects.get_or_create(order=order)
    if new_status == Order.Status.OUT_FOR_DELIVERY:
        assignment, _ = DeliveryAssignment.objects.get_or_create(order=order)
        assignment.status = DeliveryAssignment.Status.DISPATCHED
        assignment.dispatched_at = timezone.now()
        assignment.save(update_fields=["status", "dispatched_at", "updated_at"])
    if new_status == Order.Status.DELIVERED:
        DeliveryAssignment.objects.filter(order=order).update(
            status="delivered", delivered_at=timezone.now()
        )
    if new_status == Order.Status.CANCELLED:
        from apps.referrals.wallet import restore_order_wallet

        restore_order_wallet(order, full=True)
        if order.wallet_amount and order.wallet_amount == order.total:
            order.payment_status = Order.PaymentStatus.REFUNDED
            order.save(update_fields=["payment_status"])
        for movement in order.inventory_movements.filter(
            kind="sale", cycle=order.fulfilment_cycle
        ).order_by("product_id"):
            product = Product.objects.select_for_update().get(pk=movement.product_id)
            product.stock += movement.quantity
            product.save(update_fields=["stock"])
            InventoryMovement.objects.create(
                order=order,
                product=product,
                kind="restock",
                quantity=movement.quantity,
                cycle=order.fulfilment_cycle,
            )
    apply_purchase_rules(order)
    event_kind = (
        "customer_cancelled"
        if new_status == Order.Status.CANCELLED and actor and not actor.is_staff
        else "status_change"
    )
    OrderStatusEvent.objects.create(
        order=order, status=new_status, actor=actor, kind=event_kind
    )
    if actor and actor.is_staff:
        from apps.customer_services.models import AdminAuditEntry

        AdminAuditEntry.objects.create(
            actor=actor,
            action="status_change",
            resource="orders.order",
            object_id=str(order.pk),
            changes={"before": old_status, "after": new_status},
        )
    return order


@transaction.atomic
def reopen_order(*, order, actor, expected_version=None):
    from apps.catalog.permissions import allowed_admin_module
    from apps.accounts.models import User
    from apps.referrals.models import WalletLedger
    from apps.referrals.wallet import balance
    from apps.customer_services.models import AdminAuditEntry, DeliveryAssignment
    from django.db.models import Q, Sum
    from rest_framework.exceptions import PermissionDenied

    if not (
        actor.is_active and actor.is_staff and allowed_admin_module(actor, "orders")
    ):
        raise PermissionDenied(
            "Only authorized order administrators can restore cancellations."
        )
    order = Order.objects.select_for_update().get(pk=order.pk)
    check_version(order, expected_version)
    if order.status != "cancelled":
        raise ValidationError({"status": "Only cancelled orders can be restored."})
    if (
        order.refunds.exclude(status="rejected").exists()
        or order.return_requests.exclude(status="rejected").exists()
    ):
        raise ValidationError(
            {
                "status": "Resolve the return or refund first. This order cannot be restored automatically."
            }
        )
    customer = User.objects.select_for_update().get(pk=order.customer_id)
    lines = list(order.items.all())
    products = {
        p.pk: p
        for p in Product.objects.select_for_update()
        .select_related("category")
        .filter(pk__in=[line.product_id for line in lines])
        .order_by("pk")
    }
    if not lines:
        raise ValidationError({"status": "This order has no items to restore."})
    quantities = {}
    for line in lines:
        product = products.get(line.product_id)
        quantities[line.product_id] = quantities.get(line.product_id, 0) + line.quantity
        if (
            not product
            or not product.is_active
            or not product.category.is_active
            or (product.best_before is not None and product.best_before < timezone.localdate())
            or product.stock < quantities[line.product_id]
        ):
            raise ValidationError(
                {
                    "status": f"Cannot restore: {line.product_name} is unavailable or has insufficient stock."
                }
            )
    restored = WalletLedger.objects.filter(order=order).filter(
        Q(transaction_type="restore")
        | Q(transaction_type="redemption", idempotency_key__startswith="reopen:")
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    if restored < 0 or restored > order.wallet_amount:
        raise ValidationError(
            {"status": "Wallet history needs review before this order can be restored."}
        )
    if restored and balance(customer) < restored:
        raise ValidationError(
            {
                "status": "The returned wallet credit has been spent. Restore the customer's wallet balance before reopening this order."
            }
        )
    order.fulfilment_cycle += 1
    for product_id, quantity in quantities.items():
        product = products[product_id]
        product.stock -= quantity
        product.save(update_fields=["stock"])
        InventoryMovement.objects.create(
            order=order,
            product=product,
            kind="sale",
            quantity=quantity,
            cycle=order.fulfilment_cycle,
        )
    if restored:
        WalletLedger.objects.create(
            customer=customer,
            order=order,
            amount=-restored,
            transaction_type="redemption",
            description=f"Wallet re-reserved for {order.order_number}",
            idempotency_key=f"reopen:{order.pk}:{order.fulfilment_cycle}",
        )
    order.status = Order.Status.PENDING
    order.status_version += 1
    if order.wallet_amount == order.total:
        order.payment_status = Order.PaymentStatus.PAID
    order.save(
        update_fields=[
            "status",
            "status_version",
            "fulfilment_cycle",
            "payment_status",
            "updated_at",
        ]
    )
    DeliveryAssignment.objects.filter(order=order).update(
        status="assigned",
        personnel=None,
        scheduled_at=None,
        dispatched_at=None,
        delivered_at=None,
        failed_at=None,
        delivery_note="",
        proof_reference="",
    )
    OrderStatusEvent.objects.create(
        order=order, status=order.status, kind="reopened", actor=actor
    )
    AdminAuditEntry.objects.create(
        actor=actor,
        action="restore_cancelled",
        resource="orders.order",
        object_id=str(order.pk),
        changes={
            "before": "cancelled",
            "after": "pending",
            "cycle": order.fulfilment_cycle,
        },
    )
    return order


def apply_purchase_rules(order):
    from apps.referrals.models import ReferralProgram

    referral_program = ReferralProgram.objects.filter(pk=1).first()
    if referral_program and order.status in referral_program.qualifying_order_statuses:
        from apps.referrals.services import award_referral_for_order

        award_referral_for_order(order)
    if referral_program and order.status == Order.Status.CANCELLED:
        from apps.referrals.services import reverse_referral_rewards_for_order

        reverse_referral_rewards_for_order(order, reason="qualifying order cancelled")
    if order.status == Order.Status.DELIVERED:
        from apps.customer_services.services import issue_reseller_commission

        issue_reseller_commission(order)

@transaction.atomic
def record_in_store_purchase(*, actor, payload):
    from datetime import datetime, time
    from django.db import IntegrityError
    from rest_framework.exceptions import PermissionDenied
    from apps.accounts.models import User
    from apps.catalog.permissions import allowed_admin_module
    from apps.customer_services.models import AdminAuditEntry, PaymentTransaction, PaymentEvent
    from .serializers import InStorePurchaseSerializer

    if not (actor.is_active and actor.is_staff and allowed_admin_module(actor, "orders")):
        raise PermissionDenied("Order administrator access is required.")
    serializer = InStorePurchaseSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    bill = data['bill_number']
    if Order.objects.filter(bill_number=bill).exists():
        raise ValidationError({'bill_number': 'This bill has already been recorded.'})
    try:
        with transaction.atomic():
            if 'customer_id' in data:
                customer = User.objects.select_for_update().filter(pk=data['customer_id'], role='customer', is_active=True).first()
                if not customer:
                    raise ValidationError({'customer_id': 'Active customer not found.'})
            else:
                details = data['customer']
                names = details['full_name'].split(maxsplit=1)
                customer = User.objects.create_user(email=details['email'], phone=details['phone'], first_name=names[0], last_name=names[1] if len(names) > 1 else '')
                AdminAuditEntry.objects.create(actor=actor, action='create', resource='accounts.user', object_id=str(customer.pk), changes={'source': 'in_store'})
            order = Order.objects.create(customer=customer, customer_name=customer.get_full_name(), phone=customer.phone, address='', subtotal=data['amount'], total=data['amount'], source='in_store', bill_number=bill, purchase_date=data['purchase_date'], payment_method='in_store', payment_status='paid', status='delivered')
            # Existing history, qualification and sales reports use created_at as the purchase timestamp.
            purchased_at = timezone.make_aware(datetime.combine(data['purchase_date'], time.min))
            Order.objects.filter(pk=order.pk).update(created_at=purchased_at)
            order.created_at = purchased_at
            payment = PaymentTransaction.objects.create(order=order, method='in_store', status='successful', amount=order.total, transaction_reference=f'in-store:{bill}')
            PaymentEvent.objects.create(transaction=payment, event_type='in_store_recorded', reference=bill, details={'actor_id': actor.pk})
            OrderStatusEvent.objects.create(order=order, status='delivered', kind='in_store_recorded', actor=actor)
            AdminAuditEntry.objects.create(actor=actor, action='in_store_purchase', resource='orders.order', object_id=str(order.pk), changes={'customer_id': customer.pk, 'bill_number': bill, 'purchase_date': str(order.purchase_date), 'amount': str(order.total), 'source': 'in_store'})
            apply_purchase_rules(order)
            return order
    except IntegrityError:
        raise ValidationError({'detail': 'Bill number, customer email or phone already exists. Refresh and select the existing record.'})
