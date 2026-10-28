from rest_framework import filters, permissions, viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from datetime import datetime, time, timedelta
from django.db.models import Avg, Exists, F, OuterRef, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied
from .models import Category, Product
from .permissions import IsStoreAdmin
from .serializers import AdminProductSerializer, CategorySerializer, ProductSerializer, PublicCategorySerializer

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    def get_queryset(self):
        from .availability import sale_date_filter
        return super().get_queryset().filter(Exists(Product.objects.filter(category_id=OuterRef("pk"), is_active=True, stock__gt=0).filter(sale_date_filter())))
    queryset = Category.objects.filter(
        is_active=True,
    ).filter(
        Exists(Product.objects.filter(
            category_id=OuterRef("pk"),
            is_active=True,
            stock__gt=0,
        ))
    )
    serializer_class = PublicCategorySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

class ProductPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        response.data["page_size"] = self.get_page_size(self.request)
        response.data["total_pages"] = self.page.paginator.num_pages
        return response


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.filter(
        is_active=True,
        category__is_active=True,
        stock__gt=0,
    ).select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = ProductPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ["name", "description", "category__name"]
    ordering_fields = ["name", "price"]
    ordering = ["-is_featured", "name", "pk"]
    filterset_fields = ["category", "is_featured", "brand", "variant_group"]

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "detail": self.action == "retrieve"}

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["brands"] = list(Product.objects.filter(is_active=True, stock__gt=0, category__is_active=True).exclude(brand="").order_by("brand").values_list("brand", flat=True).distinct()[:100])
        return response


    def get_queryset(self):
        from .availability import sale_date_filter
        queryset = super().get_queryset().filter(sale_date_filter())
        self.ordering = ["-is_featured", "name", "pk"]
        query = self.request.query_params.get("search", "").strip()[:200]
        if query:
            from .search import search_products
            queryset = search_products(queryset, query)
            self.ordering = ["search_rank", "-is_featured", "name", "pk"]
        collection = self.request.query_params.get("collection")
        ids = self.request.query_params.get("ids")
        if ids:
            selected = [int(value) for value in ids.split(",")[:100] if value.isdigit()]
            queryset = queryset.filter(pk__in=selected)
        if collection == "buy-again":
            if not self.request.user.is_authenticated:
                return queryset.none()
            from apps.orders.models import OrderItem
            purchased = OrderItem.objects.filter(order__customer=self.request.user, order__status="delivered").values("product_id").annotate(units=Sum("quantity")).order_by("-units")[:50]
            queryset = queryset.filter(pk__in=[row["product_id"] for row in purchased])
        if collection == "deals":
            queryset = queryset.filter(Q(mrp_is_sample=False, mrp__gt=F("price")) | Q(regular_price__gt=F("price")))
        if self.request.query_params.get("collection") == "fast-moving":
            from apps.orders.models import OrderItem
            from django.db.models import Subquery, IntegerField
            sales = OrderItem.objects.filter(
                product_id=OuterRef("pk"), order__status="delivered",
                order__created_at__gte=timezone.now() - timedelta(days=30),
            ).values("product_id").annotate(units=Sum("quantity")).values("units")
            queryset = queryset.annotate(sold_units=Coalesce(Subquery(sales, output_field=IntegerField()), 0)).filter(sold_units__gt=0)
            self.ordering = ["-sold_units", "name", "pk"]
        if self.request.query_params.get("collection") == "referral":
            from apps.referrals.services import effective_commission_rates
            from apps.referrals.models import ReferralProgram
            rates = effective_commission_rates(ReferralProgram.current())
            queryset = queryset.filter(category_id__in={rate["category_id"] for rate in rates if rate["amount"] > 0})
        return queryset

class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all()
    serializer_class = AdminProductSerializer
    permission_classes = [IsStoreAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "sku"]

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        from apps.customer_services.views import audit_admin_change
        from django.db.models.deletion import ProtectedError
        audit_admin_change(request, product, "remove", {"sku": product.sku})
        from apps.orders.models import OrderItem
        if OrderItem.objects.filter(product=product).exists():
            product.is_active = False
            product.save(update_fields=["is_active"])
            return Response(status=204)
        try:
            product.delete()
        except ProtectedError:
            product.is_active = False
            product.save(update_fields=["is_active"])
        return Response(status=204)

    def perform_create(self, serializer):
        product = serializer.save()
        from apps.customer_services.views import audit_admin_change
        audit_admin_change(self.request, product, "create", {"sku": product.sku})

    def perform_update(self, serializer):
        product = serializer.save()
        from apps.customer_services.views import audit_admin_change
        audit_admin_change(self.request, product, "update", {key: str(value.pk) if hasattr(value, "pk") else str(value) for key, value in serializer.validated_data.items()})

class AdminCategoryViewSet(viewsets.ModelViewSet):
    pagination_class = None
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStoreAdmin]

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.products.exists():
            return Response({"detail": "Move or remove this category's products first, or deactivate the category."}, status=400)
        from apps.customer_services.views import audit_admin_change
        audit_admin_change(request, category, "remove", {"name": category.name})
        from django.db.models.deletion import ProtectedError
        try:
            category.delete()
        except ProtectedError:
            return Response({"detail": "This category is used in order history. Deactivate it instead."}, status=400)
        return Response(status=204)

    def _validate_referral_eligibility_permission(self, serializer):
        if "referral_rewards_enabled" not in serializer.validated_data:
            return
        user = self.request.user
        if user.role not in {"admin", "super_admin"} and not user.has_perm("referrals.change_referralprogram"):
            raise PermissionDenied("You are not allowed to change category referral eligibility.")

    def perform_create(self, serializer):
        self._validate_referral_eligibility_permission(serializer)
        category = serializer.save()
        from apps.customer_services.views import audit_admin_change
        audit_admin_change(self.request, category, "create", {"name": category.name})

    def perform_update(self, serializer):
        self._validate_referral_eligibility_permission(serializer)
        category = serializer.save()
        from apps.customer_services.views import audit_admin_change
        audit_admin_change(
            self.request,
            category,
            "update",
            {
                key: str(value.pk) if hasattr(value, "pk") else str(value)
                for key, value in serializer.validated_data.items()
            },
        )

@extend_schema(responses={
    "200": {
        "type": "object",
        "properties": {
            "orders": {"type": "integer"},
            "pending_orders": {"type": "integer"},
            "delivered_orders": {"type": "integer"},
            "customers": {"type": "integer"},
            "active_products": {"type": "integer"},
            "low_stock_products": {"type": "integer"},
            "sales_total": {"type": "number"},
            "referrals": {"type": "integer"},
            "rewards_issued": {"type": "integer"},
            "recent_orders": {"type": "array", "items": {"type": "object"}},
        },
    },
})
@api_view(["GET"])
@permission_classes([IsStoreAdmin])
def dashboard(request):
    from apps.orders.models import Order
    from apps.accounts.models import User
    from apps.referrals.models import Referral, ReferralReward
    from apps.customer_services.models import CustomerRequest, ResellerCommission, ResellerPayoutRequest, ReturnRequest, SupportTicket, Refund
    from apps.orders.models import OrderItem

    now = timezone.localtime()
    period = request.query_params.get("period", "last_30_days")
    if period == "all_time":
        start, end = None, None
    elif period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif period == "last_7_days":
        start, end = now - timedelta(days=7), now
    elif period == "this_month":
        start, end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now
    elif period == "custom":
        start_date = parse_date(request.query_params.get("start", ""))
        end_date = parse_date(request.query_params.get("end", ""))
        if not start_date or not end_date or start_date > end_date:
            return Response({"detail": "Custom date range requires valid start and end dates."}, status=400)
        start, end = timezone.make_aware(datetime.combine(start_date, time.min)), timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min))
    else:
        period = "last_30_days"
        start, end = now - timedelta(days=30), now
    period_orders = Order.objects.all() if period == "all_time" else Order.objects.filter(created_at__gte=start, created_at__lt=end)
    active_orders = period_orders.exclude(status=Order.Status.CANCELLED)
    gross_sales = active_orders.aggregate(total=Sum("total"))["total"] or 0
    product_sales = OrderItem.objects.all() if period == "all_time" else OrderItem.objects.filter(
        order__created_at__gte=start, order__created_at__lt=end,
    )
    product_sales = product_sales.filter(order__status=Order.Status.DELIVERED).values("product_name").annotate(
        quantity=Sum("quantity"),
    ).order_by("-quantity")[:5]
    top_products = list(product_sales)
    financial_allowed = request.user.role in {"admin", "super_admin", "finance_manager"}
    response = {
        "period": period,
        "range": {
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
        },
        "orders": period_orders.count(),
        "awaiting_confirmation": period_orders.filter(status=Order.Status.PENDING).count(),
        "confirmed_orders": period_orders.filter(status=Order.Status.CONFIRMED).count(),
        "processing_orders": period_orders.filter(status__in=[Order.Status.PROCESSING, Order.Status.PACKED, Order.Status.PICKED_UP]).count(),
        "out_for_delivery": period_orders.filter(status=Order.Status.OUT_FOR_DELIVERY).count(),
        "delivered_orders": period_orders.filter(status=Order.Status.DELIVERED).count(),
        "cancelled_orders": period_orders.filter(status=Order.Status.CANCELLED).count(),
        "customers": User.objects.filter(role="customer").count(),
        "new_customers": (
            User.objects.filter(role="customer").count()
            if period == "all_time"
            else User.objects.filter(role="customer", date_joined__gte=start, date_joined__lt=end).count()
        ),
        "active_products": Product.objects.filter(is_active=True).count(),
        "low_stock_products": Product.objects.filter(is_active=True, stock__gt=0, stock__lte=F("low_stock_threshold")).count(),
        "out_of_stock_products": Product.objects.filter(is_active=True, stock=0).count(),
        "pending_support_tickets": SupportTicket.objects.filter(status__in=["open", "in_progress"]).count(),
        "pending_requests": CustomerRequest.objects.filter(status__in=["submitted", "in_progress"]).count(),
        "pending_returns": ReturnRequest.objects.filter(status="submitted").count(),
        "referrals": Referral.objects.count(),
        "rewards_issued": ReferralReward.objects.count(),
        "top_products": top_products,
        "recent_orders": list(period_orders.order_by("-created_at").values("id", "order_number", "status", "created_at")[:8]),
        "financials_available": financial_allowed,
    }
    if financial_allowed:
        from apps.referrals.models import WalletLedger
        from apps.customer_services.models import PaymentTransaction
        ledger = WalletLedger.objects.all()
        payments = PaymentTransaction.objects.filter(status="successful")
        if start:
            ledger = ledger.filter(created_at__gte=start, created_at__lt=end)
            payments = payments.filter(updated_at__gte=start, updated_at__lt=end)
        totals = ledger.aggregate(
            referral_credits=Sum("amount", filter=Q(transaction_type="credit")),
            referral_reversals=Sum("amount", filter=Q(transaction_type="reversal")),
            wallet_redeemed=Sum("amount", filter=Q(transaction_type="redemption")),
            wallet_restored=Sum("amount", filter=Q(transaction_type="restore")),
        )
        response["referral_financials"] = {key: abs(value or 0) for key, value in totals.items()}
        balances = WalletLedger.objects.values("customer_id").annotate(balance=Sum("amount"))
        response["wallet_outstanding"] = balances.filter(balance__gt=0).aggregate(total=Sum("balance"))["total"] or 0
        response["purchasing_customers"] = period_orders.filter(status="delivered").values("customer_id").distinct().count()
        response["delivered_sales"] = period_orders.filter(status="delivered").aggregate(total=Sum("total"))["total"] or 0
        response["cash_collected"] = payments.aggregate(total=Sum("amount"))["total"] or 0
        financial_product_sales = OrderItem.objects.all() if period == "all_time" else OrderItem.objects.filter(
            order__created_at__gte=start, order__created_at__lt=end,
        )
        top_products = list(
            financial_product_sales.filter(order__status=Order.Status.DELIVERED)
            .values("product_name").annotate(quantity=Sum("quantity"), revenue=Sum("line_total"))
            .order_by("-quantity")[:5]
        )
        response["top_products"] = top_products
        response.update({
            "gross_sales": gross_sales,
            "refund_total": (
                Refund.objects.filter(status=Refund.Status.RECORDED).aggregate(total=Sum("amount"))["total"] or 0
                if period == "all_time"
                else Refund.objects.filter(created_at__gte=start, created_at__lt=end, status=Refund.Status.RECORDED).aggregate(total=Sum("amount"))["total"] or 0
            ),
            "average_order_value": active_orders.aggregate(value=Avg("total"))["value"] or 0,
            "pending_commissions": ResellerCommission.objects.filter(status="pending").aggregate(total=Sum("amount"))["total"] or 0,
            "approved_commissions": ResellerCommission.objects.filter(status="approved").aggregate(total=Sum("amount"))["total"] or 0,
            "pending_payouts": ResellerPayoutRequest.objects.filter(status="pending").aggregate(total=Sum("amount"))["total"] or 0,
        })
        response["net_sales"] = gross_sales - response["refund_total"]
        response["recent_orders"] = list(period_orders.order_by("-created_at").values("id", "order_number", "status", "total", "created_at")[:8])
    from apps.customer_services.models import ShoppingActivity
    activity = ShoppingActivity.objects.all()
    if start:
        activity = activity.filter(created_at__gte=start, created_at__lt=end)
    from django.db.models import Count
    response["shopping_activity"] = {row["kind"]:row["count"] for row in activity.values("kind").annotate(count=Count("pk"))}
    response["sales_total"] = response.get("gross_sales", 0)
    return Response(response)
