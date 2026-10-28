from django.core.validators import MinValueValidator
from django.db import models

class Category(models.Model):
    image_url = models.URLField(blank=True)
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True)
    is_active = models.BooleanField(default=True)
    referral_rewards_enabled = models.BooleanField(null=True, blank=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

class Product(models.Model):
    brand = models.CharField(max_length=100, blank=True)
    variant_group = models.CharField(max_length=100, blank=True, db_index=True)
    search_keywords = models.CharField(max_length=500, blank=True)
    unit_price_label = models.CharField(max_length=100, blank=True)
    ingredients = models.TextField(blank=True)
    nutrition = models.TextField(blank=True)
    storage_instructions = models.TextField(blank=True)
    gallery = models.JSONField(default=list, blank=True)
    best_before = models.DateField(null=True, blank=True)
    category = models.ForeignKey(Category, related_name="products", on_delete=models.PROTECT)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=170, unique=True)
    sku = models.CharField(max_length=40, unique=True)
    barcode = models.CharField(max_length=40, unique=True, null=True, blank=True)
    description = models.TextField(blank=True)
    pack_size = models.CharField(max_length=60, blank=True)
    badge = models.CharField(max_length=20, blank=True, choices=[("featured", "Featured"), ("new_arrival", "New Arrival"), ("special_offer", "Special Offer"), ("popular", "Popular"), ("best_seller", "Best Seller")])
    regular_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    image_data = models.BinaryField(null=True, blank=True, editable=False)
    image_content_type = models.CharField(max_length=30, blank=True)
    image_is_illustration = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    wholesale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    mrp = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    mrp_is_sample = models.BooleanField(default=False)
    stock = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    image_url = models.URLField(blank=True)
    image = models.FileField(upload_to="products/", blank=True)
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["is_active", "category"])]

    def __str__(self):
        return self.name
