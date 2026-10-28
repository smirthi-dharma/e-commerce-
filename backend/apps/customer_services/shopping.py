from django.db import transaction
from rest_framework import permissions, serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.accounts.models import User
from apps.catalog.models import Product
from apps.catalog.serializers import ProductSerializer
from .models import CustomerCart, ShoppingList


class BasketLine(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=99)


def validate_lines(value):
    if len(value) > 100 or len({item["product_id"] for item in value}) != len(value):
        raise serializers.ValidationError("Use at most 100 distinct products.")
    return value


def current_products(items, request):
    from apps.catalog.availability import sale_date_filter
    products = Product.objects.filter(pk__in=[row["product_id"] for row in items], is_active=True, category__is_active=True, stock__gt=0).filter(sale_date_filter()).select_related("category")
    quantities = {row["product_id"]: row["quantity"] for row in items}
    return [{**ProductSerializer(product, context={"request":request}).data, "quantity": min(quantities[product.pk], product.stock)} for product in products]


class CartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart, _ = CustomerCart.objects.get_or_create(customer=request.user)
        return Response({"revision":cart.revision, "items":current_products(cart.items, request)})

    @transaction.atomic
    def put(self, request):
        class CartInput(serializers.Serializer):
            revision = serializers.IntegerField(min_value=0)
            items = serializers.ListField(child=BasketLine(), max_length=100)
            def validate_items(self, value):
                return validate_lines(value)
        data = CartInput(data=request.data)
        data.is_valid(raise_exception=True)
        User.objects.select_for_update().get(pk=request.user.pk)
        cart, _ = CustomerCart.objects.get_or_create(customer=request.user)
        if cart.revision != data.validated_data["revision"]:
            return Response({"detail":"Your basket changed on another device. Reload the saved basket before editing.", "revision":cart.revision}, status=409)
        products = current_products(data.validated_data["items"], request)
        cart.items = [{"product_id":p["id"], "quantity":p["quantity"]} for p in products]
        cart.revision += 1
        cart.save(update_fields=["items","revision"])
        return Response({"revision":cart.revision, "items":products})


class ShoppingListSerializer(serializers.ModelSerializer):
    items = serializers.ListField(child=BasketLine(), max_length=100)
    products = serializers.SerializerMethodField()
    class Meta:
        model = ShoppingList
        fields = ["id","name","items","products","updated_at"]
        read_only_fields = ["updated_at"]
    def validate_items(self, value):
        return validate_lines(value)
    def get_products(self, obj):
        return current_products(obj.items, self.context["request"])


class ShoppingListViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ShoppingListSerializer
    def get_queryset(self):
        return ShoppingList.objects.filter(customer=self.request.user)
    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)
