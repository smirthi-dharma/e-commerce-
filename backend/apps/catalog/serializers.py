from rest_framework import serializers
from .models import Category, Product

MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024
IMAGE_SIGNATURES = {
    "image/jpeg": lambda content: content.startswith(b"\xff\xd8\xff"),
    "image/png": lambda content: content.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/gif": lambda content: content.startswith((b"GIF87a", b"GIF89a")),
    "image/webp": lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP",
}

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "image_url", "is_active", "referral_rewards_enabled"]


class PublicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "image_url", "is_active"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    in_stock = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    display_badge = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()

    def get_variants(self, obj):
        if not obj.variant_group or not self.context.get("detail"):
            return []
        from .availability import sale_date_filter
        return list(Product.objects.filter(sale_date_filter(), variant_group=obj.variant_group, is_active=True, category__is_active=True, stock__gt=0).order_by("price").values("id", "name", "pack_size", "price"))

    def validate_gallery(self, value):
        if not isinstance(value, list) or len(value) > 8:
            raise serializers.ValidationError("Provide at most eight image URLs.")
        validator = serializers.URLField()
        return [validator.run_validation(url) for url in value]


    class Meta:
        model = Product
        fields = ["id", "name", "slug", "sku", "description", "pack_size", "price", "regular_price", "mrp", "mrp_is_sample", "badge", "display_badge", "image_is_illustration", "stock", "in_stock", "image_url", "is_active", "is_featured", "category", "category_name", "brand", "variant_group", "search_keywords", "unit_price_label", "ingredients", "nutrition", "storage_instructions", "gallery", "variants"]

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        mrp = attrs.get("mrp", getattr(self.instance, "mrp", None))
        if mrp is not None and price is not None and mrp < price:
            raise serializers.ValidationError({"mrp": "MRP must be greater than or equal to the selling price."})
        regular = attrs.get("regular_price", getattr(self.instance, "regular_price", None))
        if regular is not None and price is not None and regular < price:
            raise serializers.ValidationError({"regular_price": "Previous selling price must be at least the current price; clear it when ending an offer."})
        if mrp is not None and regular is not None and regular > mrp:
            raise serializers.ValidationError({"regular_price": "Previous selling price cannot exceed MRP."})
        from .badges import sales_badge_supported
        badge = attrs.get("badge", getattr(self.instance, "badge", ""))
        if "badge" in attrs and not sales_badge_supported(self.instance, badge):
            raise serializers.ValidationError({"badge": "Popular needs 5 delivered units in 30 days. Best Seller needs 10 units and a top-five sales position."})
        sample = attrs.get("mrp_is_sample", getattr(self.instance, "mrp_is_sample", False))
        if badge == "special_offer" and not ((not sample and mrp is not None and mrp > price) or (regular is not None and regular > price)):
            raise serializers.ValidationError({"badge": "Special Offer requires a saving against genuine MRP or a previous selling price."})
        return attrs

    def get_display_badge(self, obj):
        from .badges import sales_badge_supported
        if obj.badge == "special_offer" and not any(value and value > obj.price for value in (None if obj.mrp_is_sample else obj.mrp, obj.regular_price)):
            return ""
        if obj.badge == "new_arrival":
            from django.utils import timezone
            from datetime import timedelta
            if obj.created_at < timezone.now() - timedelta(days=30):
                return ""
        return obj.get_badge_display() if sales_badge_supported(obj, obj.badge) else ""

    def get_in_stock(self, obj) -> bool:
        from django.utils import timezone
        return obj.stock > 0 and obj.is_active and obj.category.is_active and (obj.best_before is None or obj.best_before >= timezone.localdate())

    def get_image_url(self, obj) -> str:
        if obj.image_data:
            from django.urls import reverse
            url = reverse("catalogue-image", args=[obj.pk])
            request = self.context.get("request")
            return request.build_absolute_uri(url) if request else url
        if obj.image:
            url = obj.image.url
            request = self.context.get("request")
            return request.build_absolute_uri(url) if request else url
        return obj.image_url


class AdminProductSerializer(ProductSerializer):
    image = serializers.FileField(required=False, write_only=True, allow_empty_file=False)
    image_url = serializers.URLField(required=False, allow_blank=True)
    remove_image = serializers.BooleanField(required=False, write_only=True)

    class Meta(ProductSerializer.Meta):
        fields = ProductSerializer.Meta.fields + ["barcode", "low_stock_threshold", "image", "remove_image", "wholesale_price", "best_before"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["image_url"] = self.get_image_url(instance)
        return data

    def _image_values(self, values):
        image = values.pop("image", None)
        remove = values.pop("remove_image", False)
        if remove:
            values.update(image_data=None, image_content_type="", image="", image_url="")
        if image:
            values.update(image_data=image.read(), image_content_type=image.content_type, image="", image_url="")
        elif values.get("image_url") and self.instance and values["image_url"] != self.get_image_url(self.instance):
            values.update(image_data=None, image_content_type="", image="")
        elif self.instance and values.get("image_url") == self.get_image_url(self.instance):
            values.pop("image_url", None)
        return values

    def create(self, validated_data):
        return super().create(self._image_values(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._image_values(validated_data))

    def validate_image(self, image):
        if image.size > MAX_PRODUCT_IMAGE_SIZE:
            raise serializers.ValidationError("Image must be 5 MB or smaller.")
        signature_check = IMAGE_SIGNATURES.get(image.content_type)
        if not signature_check:
            raise serializers.ValidationError("Upload a JPEG, PNG, GIF, or WebP image.")
        header = image.read(12)
        image.seek(0)
        if not signature_check(header):
            raise serializers.ValidationError("The uploaded file is not a valid image of the selected type.")
        return image
