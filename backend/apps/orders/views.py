from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from django.db import transaction
from django.shortcuts import get_object_or_404
from apps.catalog.permissions import IsStoreAdmin
from apps.customer_services.models import AdminAuditEntry
from .models import Order
from .serializers import (
    CreateOrderSerializer,
    OrderSerializer,
    AdminOrderSerializer,
    OrderChangeSerializer,
    RestoreOrderSerializer,
    InvoiceOptionsSerializer,
)
from .services import change_order_status, place_order, reopen_order, check_version
from .invoices import get_invoice, invoice_response


def order_queryset():
    return (
        Order.objects.select_related(
            "customer", "delivery_assignment__personnel", "invoice"
        )
        .defer("invoice__pdf", "invoice__snapshot")
        .prefetch_related("items__product", "status_events")
    )


class OrderListCreateView(generics.ListAPIView):
    queryset = Order.objects.none()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return order_queryset().filter(customer=self.request.user)

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = place_order(customer=request.user, payload=serializer.validated_data)
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderQuoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from rest_framework import serializers
        from .serializers import CheckoutLineSerializer
        class QuoteSerializer(serializers.Serializer):
            items = CheckoutLineSerializer(many=True, allow_empty=False)
            delivery_pin_code = serializers.RegexField(r"^[1-9][0-9]{5}$")
            coupon_code = serializers.CharField(required=False, allow_blank=True, max_length=40)
            use_wallet = serializers.BooleanField(default=False)
        data = QuoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(place_order(customer=request.user, payload=data.validated_data, quote_only=True))


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return order_queryset().filter(customer=self.request.user)


class CustomerInvoiceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        order = get_object_or_404(Order, pk=pk, customer=request.user)
        return invoice_response(get_invoice(order))


class CustomerCancelOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        order = Order.objects.filter(customer=request.user).filter(pk=pk).first()
        if not order:
            return Response(
                {"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND
            )
        # Existing clients may omit the version; new controls always send it.
        expected_version = None
        if request.data:
            version = RestoreOrderSerializer(data=request.data)
            version.is_valid(raise_exception=True)
            expected_version = version.validated_data["expected_version"]
        order = change_order_status(
            order=order,
            new_status=Order.Status.CANCELLED,
            actor=request.user,
            expected_version=expected_version,
        )
        return Response(OrderSerializer(order).data)


class AdminOrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = order_queryset()
    serializer_class = AdminOrderSerializer
    permission_classes = [IsStoreAdmin]
    filterset_fields = ["status"]
    search_fields = ["order_number", "customer__email", "customer_name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        order = Order.objects.select_for_update().get(pk=self.get_object().pk)
        change = OrderChangeSerializer(data=request.data)
        change.is_valid(raise_exception=True)
        data = change.validated_data
        check_version(order, data.get("expected_version"))
        if "status" in data:
            order = change_order_status(
                order=order,
                new_status=data["status"],
                actor=request.user,
                expected_version=data.get("expected_version"),
            )
        if "private_note" in data:
            order.private_note = data["private_note"]
            order.status_version += 1
            order.save(update_fields=["private_note", "status_version", "updated_at"])
            AdminAuditEntry.objects.create(
                actor=request.user,
                action="save_note",
                resource="orders.order",
                object_id=str(order.pk),
                changes={"private_note_updated": True},
            )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def packing(self, request, pk=None):
        from rest_framework.exceptions import ValidationError
        order = Order.objects.select_for_update().get(pk=self.get_object().pk)
        version = RestoreOrderSerializer(data=request.data)
        version.is_valid(raise_exception=True)
        check_version(order, version.validated_data["expected_version"])
        if order.status not in {"pending", "confirmed", "processing"}:
            raise ValidationError({"detail": "Picking can be updated before the order is packed."})
        quantities = request.data.get("items")
        if not isinstance(quantities, list) or len(quantities) > 100:
            raise ValidationError({"items": "Provide order item quantities."})
        items = {item.pk:item for item in order.items.all()}
        seen = set()
        for row in quantities:
            if not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] not in items or row["id"] in seen or type(row.get("quantity")) is not int or not 0 <= row["quantity"] <= items[row["id"]].quantity:
                raise ValidationError({"items": "Invalid order item or quantity."})
            seen.add(row["id"])
            item = items[row["id"]]
            item.picked_quantity = row["quantity"]
            item.save(update_fields=["picked_quantity"])
        order.status_version += 1
        order.save(update_fields=["status_version", "updated_at"])
        AdminAuditEntry.objects.create(actor=request.user, action="pick_items", resource="orders.order", object_id=str(order.pk), changes={"items": quantities})
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        data = RestoreOrderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = reopen_order(
            order=self.get_object(), actor=request.user, **data.validated_data
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["get", "post"])
    def invoice(self, request, pk=None):
        options = InvoiceOptionsSerializer(
            data=request.data if request.method == "POST" else {}
        )
        options.is_valid(raise_exception=True)
        return invoice_response(
            get_invoice(self.get_object(), **options.validated_data)
        )
