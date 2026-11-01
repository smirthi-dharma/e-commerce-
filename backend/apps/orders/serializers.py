from decimal import Decimal
from rest_framework import serializers
from django.utils import timezone
from .models import Order, OrderItem, OrderStatusEvent
from .services import ORDER_TRANSITIONS


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusEvent
        fields = ["id", "status", "kind", "created_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    barcode = serializers.CharField(source="product.barcode", read_only=True, default="")
    image_url = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        from apps.catalog.serializers import ProductSerializer

        return (
            ProductSerializer(context=self.context).get_image_url(obj.product)
            if obj.product
            else ""
        )

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "picked_quantity",
            "barcode",
            "product_id",
            "product_name",
            "sku",
            "unit_price",
            "quantity",
            "line_total",
            "image_url",
        ]


class OrderSerializer(serializers.ModelSerializer):
    amount_due = serializers.SerializerMethodField()
    status_events = OrderEventSerializer(many=True, read_only=True)
    next_statuses = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()
    invoice_info = serializers.SerializerMethodField()

    def get_next_statuses(self, obj):
        return ORDER_TRANSITIONS[obj.status]

    def get_delivery(self, obj):
        assignment = getattr(obj, "delivery_assignment", None)
        if not assignment or obj.status == "cancelled":
            return None
        return {
            "id": assignment.pk,
            "status": assignment.status,
            "scheduled_at": assignment.scheduled_at,
            "dispatched_at": assignment.dispatched_at,
            "delivered_at": assignment.delivered_at,
            "shared_location": ({"latitude": assignment.latitude, "longitude": assignment.longitude, "shared_at": assignment.location_shared_at} if obj.status not in {"delivered", "cancelled"} and assignment.latitude is not None and assignment.longitude is not None and assignment.location_shared_at and (timezone.now() - assignment.location_shared_at).total_seconds() <= 300 else None),
            "personnel_phone": assignment.personnel.phone if assignment.personnel else "",
            "personnel_name": assignment.personnel.name
            if assignment.personnel
            else None,
        }

    def get_invoice_info(self, obj):
        invoice = getattr(obj, "invoice", None)
        return (
            {
                "number": invoice.number,
                "issued_at": invoice.issued_at,
                "include_qr": invoice.include_qr,
            }
            if invoice
            else None
        )

    def get_amount_due(self, obj):
        if obj.source == "in_store":
            return "0.00"
        return str(obj.total - obj.wallet_amount)

    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "source",
            "bill_number",
            "purchase_date",
            "status",
            "status_version",
            "estimated_delivery_at",
            "estimated_delivery_latest_at",
            "payment_method",
            "payment_status",
            "customer_name",
            "phone",
            "address",
            "instructions",
            "subtotal",
            "discount_amount",
            "delivery_fee",
            "total",
            "wallet_amount",
            "amount_due",
            "delivery_pin_code",
            "items",
            "created_at",
            "updated_at",
            "status_events",
            "next_statuses",
            "delivery",
            "invoice_info",
        ]


class AdminOrderSerializer(OrderSerializer):
    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ["private_note", "customer_id"]


class OrderChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices, required=False)
    private_note = serializers.CharField(
        max_length=4000, allow_blank=True, required=False
    )
    expected_version = serializers.IntegerField(min_value=0, required=False)

    def validate(self, attrs):
        if not any(key in attrs for key in ("status", "private_note")):
            raise serializers.ValidationError("Choose a status or save a note.")
        return attrs


class RestoreOrderSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=0)


class InvoiceOptionsSerializer(serializers.Serializer):
    include_qr = serializers.BooleanField(default=True)


class CheckoutLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=99)


class CreateOrderSerializer(serializers.Serializer):
    expected_wallet_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)
    expected_total = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)
    use_wallet = serializers.BooleanField(default=False)
    checkout_key = serializers.UUIDField(required=False)
    items = CheckoutLineSerializer(many=True, allow_empty=False)
    customer_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)
    address = serializers.CharField()
    instructions = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=["cod"], default="cod")
    coupon_code = serializers.CharField(required=False, allow_blank=True, max_length=40)
    delivery_pin_code = serializers.RegexField(r"^[1-9][0-9]{5}$")

    def validate(self, attrs):
        for field in ["customer_name", "phone", "address"]:
            if not attrs[field].strip():
                raise serializers.ValidationError(
                    {field: "This field cannot be blank."}
                )
        return attrs

class InStoreCustomerSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)

    def validate_email(self, value):
        from apps.accounts.serializers import RegistrationSerializer
        return RegistrationSerializer().validate_email(value)

    def validate_phone(self, value):
        from apps.accounts.serializers import RegistrationSerializer
        return RegistrationSerializer().validate_phone(value)


class InStorePurchaseSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(min_value=1, required=False)
    customer = InStoreCustomerSerializer(required=False)
    bill_number = serializers.RegexField(r"^[A-Za-z0-9][A-Za-z0-9/_.-]*$", max_length=80)
    purchase_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))

    def validate_bill_number(self, value):
        return value.upper()

    def validate_purchase_date(self, value):
        from django.utils import timezone
        if value > timezone.localdate():
            raise serializers.ValidationError("Purchase date cannot be in the future.")
        return value

    def validate(self, attrs):
        if ('customer_id' in attrs) == ('customer' in attrs):
            raise serializers.ValidationError("Select a customer ID or create a customer.")
        return attrs
