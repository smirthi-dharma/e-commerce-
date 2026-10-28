import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        PROCESSING = "processing", "Processing"
        PACKED = "packed", "Packed"
        PICKED_UP = "picked_up", "Picked up"
        OUT_FOR_DELIVERY = "out_for_delivery", "Out for Delivery"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_number = models.CharField(max_length=24, unique=True, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="orders", on_delete=models.PROTECT)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=20, default="cod")
    payment_status = models.CharField(max_length=12, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)
    coupon = models.ForeignKey("customer_services.Coupon", null=True, blank=True, related_name="orders", on_delete=models.SET_NULL)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_pin_code = models.CharField(max_length=6, blank=True)
    customer_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    instructions = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_fee = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    wallet_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    source = models.CharField(max_length=12, default="app", choices=[("app", "App"), ("in_store", "In-store")])
    bill_number = models.CharField(max_length=80, null=True, blank=True, unique=True)
    purchase_date = models.DateField(null=True, blank=True)
    checkout_key = models.UUIDField(null=True, blank=True, unique=True)
    checkout_fingerprint = models.CharField(max_length=64, blank=True)
    fulfilment_cycle = models.PositiveIntegerField(default=0)
    status_version = models.PositiveIntegerField(default=0)
    private_note = models.TextField(blank=True, max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = f"SM-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

class OrderItem(models.Model):
    category_snapshot = models.ForeignKey("catalog.Category", null=True, blank=True, on_delete=models.PROTECT)
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", null=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=150)
    sku = models.CharField(max_length=40)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    line_total = models.DecimalField(max_digits=10, decimal_places=2)

class InventoryMovement(models.Model):
    class Kind(models.TextChoices):
        SALE = "sale", "Sale"
        RESTOCK = "restock", "Cancellation Restock"

    order = models.ForeignKey(Order, related_name="inventory_movements", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    quantity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    cycle = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["order", "product", "kind", "cycle"], name="unique_order_inventory_cycle")]


class OrderStatusEvent(models.Model):
    order = models.ForeignKey(Order, related_name="status_events", on_delete=models.CASCADE)
    status = models.CharField(max_length=24, choices=Order.Status.choices)
    kind = models.CharField(max_length=24, default="status_change")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]


class OrderInvoice(models.Model):
    order = models.OneToOneField(Order, related_name="invoice", on_delete=models.PROTECT)
    number = models.CharField(max_length=40, unique=True)
    snapshot = models.JSONField()
    pdf = models.BinaryField()
    include_qr = models.BooleanField(default=True)
    issued_at = models.DateTimeField(auto_now_add=True)
