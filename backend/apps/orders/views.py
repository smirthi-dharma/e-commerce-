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
    filterset_fields = ["status", "source"]
    search_fields = ["order_number", "customer__email", "customer_name", "bill_number"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=False, methods=["get"], url_path="in-store-customer")
    def in_store_customer(self, request):
        from apps.accounts.models import User
        from apps.accounts.serializers import UserSerializer
        from rest_framework import serializers
        field = serializers.IntegerField(min_value=1)
        customer_id = field.run_validation(request.query_params.get("customer_id"))
        customer = get_object_or_404(User, pk=customer_id, role="customer", is_active=True)
        return Response(UserSerializer(customer).data)

    @action(detail=False, methods=["post"], url_path="in-store")
    def in_store(self, request):
        from .services import record_in_store_purchase
        order = record_in_store_purchase(actor=request.user, payload=request.data)
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

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
