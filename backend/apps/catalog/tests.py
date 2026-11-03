from decimal import Decimal
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Category, Product

User = get_user_model()


class CatalogVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Fresh goods", slug="fresh-goods")
        self.product = Product.objects.create(
            category=self.category,
            name="Available tomato",
            slug="available-tomato",
            sku="TOMATO-AVAILABLE",
            price=Decimal("350.00"),
            stock=4,
        )

    def create_admin(self):
        return User.objects.create_user(
            email="catalog-admin@example.test",
            password="Test-password-123!",
            phone="9876500001",
            role=User.Role.ADMIN,
            is_staff=True,
        )

    def test_active_in_stock_products_and_nonempty_categories_are_public(self):
        products = self.client.get("/api/v1/products/")
        categories = self.client.get("/api/v1/categories/")
        self.assertEqual(products.status_code, 200)
        self.assertEqual([item["id"] for item in products.data["results"]], [self.product.pk])
        self.assertEqual([item["id"] for item in categories.data], [self.category.pk])

    def test_hidden_inactive_category_and_zero_stock_products_are_not_public(self):
        hidden_product = Product.objects.create(
            category=self.category,
            name="Hidden bean",
            slug="hidden-bean",
            sku="BEAN-HIDDEN",
            price=Decimal("350.00"),
            stock=5,
            is_active=False,
        )
        zero_stock = Product.objects.create(
            category=self.category,
            name="Sold out pea",
            slug="sold-out-pea",
            sku="PEA-SOLD-OUT",
            price=Decimal("350.00"),
            stock=0,
        )
        inactive_category = Category.objects.create(
            name="Seasonal goods",
            slug="seasonal-goods",
            is_active=False,
        )
        inactive_category_product = Product.objects.create(
            category=inactive_category,
            name="Seasonal mango",
            slug="seasonal-mango",
            sku="MANGO-SEASONAL",
            price=Decimal("350.00"),
            stock=4,
        )

        products = self.client.get("/api/v1/products/")
        categories = self.client.get("/api/v1/categories/")
        self.assertEqual([item["id"] for item in products.data["results"]], [self.product.pk])
        self.assertEqual([item["id"] for item in categories.data], [self.category.pk])
        for product in (hidden_product, zero_stock, inactive_category_product):
            self.assertEqual(self.client.get(f"/api/v1/products/{product.pk}/").status_code, 404)

    def test_restocking_makes_active_product_and_category_public_again(self):
        self.product.stock = 0
        self.product.save(update_fields=["stock"])
        self.assertEqual(self.client.get("/api/v1/products/").data["count"], 0)
        self.assertEqual(self.client.get("/api/v1/categories/").data, [])

        self.product.stock = 2
        self.product.save(update_fields=["stock"])
        self.assertEqual(self.client.get("/api/v1/products/").data["count"], 1)
        self.assertEqual(len(self.client.get("/api/v1/categories/").data), 1)

    def test_admin_can_manage_inactive_and_out_of_stock_records(self):
        self.product.stock = 0
        self.product.is_active = False
        self.product.save(update_fields=["stock", "is_active"])
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])
        self.client.force_authenticate(self.create_admin())

        products = self.client.get("/api/v1/admin/products/")
        categories = self.client.get("/api/v1/admin/categories/")
        self.assertEqual(products.status_code, 200)
        self.assertEqual(categories.status_code, 200)
        product_results = products.data["results"] if isinstance(products.data, dict) else products.data
        category_results = categories.data["results"] if isinstance(categories.data, dict) else categories.data
        self.assertEqual(product_results[0]["stock"], 0)
        self.assertFalse(product_results[0]["is_active"])
        self.assertFalse(category_results[0]["is_active"])

    def test_only_authorized_admin_can_change_visibility(self):
        customer = User.objects.create_user(
            email="catalog-customer@example.test",
            password="Test-password-123!",
            phone="9876500002",
        )
        self.client.force_authenticate(customer)
        product_change = self.client.patch(
            f"/api/v1/admin/products/{self.product.pk}/",
            {"is_active": False},
            format="json",
        )
        category_change = self.client.patch(
            f"/api/v1/admin/categories/{self.category.pk}/",
            {"is_active": False, "referral_rewards_enabled": False},
            format="json",
        )
        self.assertEqual(product_change.status_code, 403)
        self.assertEqual(category_change.status_code, 403)
        self.product.refresh_from_db()
        self.category.refresh_from_db()
        self.assertTrue(self.product.is_active)
        self.assertTrue(self.category.is_active)
        self.assertIsNone(self.category.referral_rewards_enabled)

    def test_admin_can_override_category_referral_eligibility(self):
        self.client.force_authenticate(self.create_admin())
        response = self.client.patch(
            f"/api/v1/admin/categories/{self.category.pk}/",
            {"referral_rewards_enabled": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.category.refresh_from_db()
        self.assertFalse(self.category.referral_rewards_enabled)

    def test_admin_can_upload_product_image_and_public_api_returns_its_url(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self.client.force_authenticate(self.create_admin())
            image = SimpleUploadedFile(
                "tomato.png",
                b"\x89PNG\r\n\x1a\n" + b"\x00" * 16,
                content_type="image/png",
            )
            response = self.client.patch(
                f"/api/v1/admin/products/{self.product.pk}/",
                {"image": image},
                format="multipart",
            )
            self.assertEqual(response.status_code, 200)
            self.assertIn(f"/products/{self.product.pk}/image/", response.data["image_url"])
            self.product.refresh_from_db()
            self.assertTrue(self.product.image_data)
            self.assertFalse(self.product.image)
            public_image_url = self.client.get(f"/api/v1/products/{self.product.pk}/").data["image_url"]
            self.assertEqual(public_image_url, response.data["image_url"])
            served = self.client.get(f"/api/v1/products/{self.product.pk}/image/")
            self.assertEqual(served.content, bytes(self.product.image_data))
            self.assertEqual(served["Content-Type"], "image/png")
            self.assertEqual(self.client.get(f"/api/v1/products/{self.product.pk}/image/", HTTP_IF_NONE_MATCH=served["ETag"]).status_code, 304)
            self.client.patch(f"/api/v1/admin/products/{self.product.pk}/", {"remove_image": True}, format="json")
            self.assertEqual(self.client.get(f"/api/v1/products/{self.product.pk}/image/").status_code, 404)

    def test_offers_and_sales_badges_are_validated(self):
        self.client.force_authenticate(self.create_admin())
        url = f"/api/v1/admin/products/{self.product.pk}/"
        for badge in ("popular", "best_seller", "special_offer"):
            self.assertEqual(self.client.patch(url, {"badge": badge}, format="json").status_code, 400)
        response = self.client.patch(url, {"regular_price": "350.00", "price": "332.50", "badge": "special_offer", "pack_size": "1 kg"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_badge"], "Special Offer")
        self.assertIsNone(response.data["mrp"])
        self.assertEqual(self.client.patch(url, {"price": "400"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"price": "400", "regular_price": None, "badge": ""}, format="json").status_code, 200)

    def test_populated_category_cannot_be_removed(self):
        self.client.force_authenticate(self.create_admin())
        self.assertEqual(self.client.delete(f"/api/v1/admin/categories/{self.category.pk}/").status_code, 400)

    def test_sales_badges_expire_when_delivered_sales_age_out(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.orders.models import Order, OrderItem
        from .badges import sales_badge_supported
        user = self.create_admin()
        order = Order.objects.create(customer=user, status="pending", customer_name="Test", phone="1234567890", address="Test", subtotal=3500, total=3500)
        OrderItem.objects.create(order=order, product=self.product, product_name=self.product.name, sku=self.product.sku, unit_price=350, quantity=10, line_total=3500)
        self.assertFalse(sales_badge_supported(self.product, "popular"))
        order.status="delivered"
        order.save()
        self.assertTrue(sales_badge_supported(self.product, "popular"))
        self.assertTrue(sales_badge_supported(self.product, "best_seller"))
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now()-timedelta(days=31))
        self.assertFalse(sales_badge_supported(self.product, "best_seller"))
        self.client.force_authenticate(user)
        self.client.delete(f"/api/v1/admin/products/{self.product.pk}/")
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)

    def test_product_image_upload_rejects_invalid_type_and_oversized_files(self):
        self.client.force_authenticate(self.create_admin())
        invalid = SimpleUploadedFile("not-image.png", b"not an image", content_type="image/png")
        response = self.client.patch(
            f"/api/v1/admin/products/{self.product.pk}/",
            {"image": invalid},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

        oversized = SimpleUploadedFile(
            "large.png",
            b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024),
            content_type="image/png",
        )
        response = self.client.patch(
            f"/api/v1/admin/products/{self.product.pk}/",
            {"image": oversized},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

    def test_product_manager_cannot_change_category_referral_eligibility_without_grant(self):
        manager = User.objects.create_user(
            email="catalog-manager@example.test",
            password="Validation-Only-Strong-Password-987!",
            phone="9876500003",
            role="product_manager",
            is_staff=True,
            admin_modules=["products"],
        )
        self.client.force_authenticate(manager)
        response = self.client.patch(
            f"/api/v1/admin/categories/{self.category.pk}/",
            {"referral_rewards_enabled": False},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.category.refresh_from_db()
        self.assertIsNone(self.category.referral_rewards_enabled)


class WholesalePriceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="wholesale-admin@example.test", password="Test-password-123!",
            phone="9876500091", role=User.Role.ADMIN, is_staff=True,
        )
        self.client.force_authenticate(self.admin)
        self.category = Category.objects.create(name="Wholesale goods", slug="wholesale-goods")

    def test_create_update_reload_and_clear_wholesale_price(self):
        response = self.client.post("/api/v1/admin/products/", {
            "name": "Rice", "slug": "rice", "sku": "RICE-WHOLESALE",
            "category": self.category.pk, "price": "100.00",
            "wholesale_price": "80.25", "stock": 10,
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data["id"])
        self.assertEqual(product.wholesale_price, Decimal("80.25"))
        url = f"/api/v1/admin/products/{product.pk}/"
        self.assertEqual(self.client.get(url).data["wholesale_price"], "80.25")
        for value, expected in [("75.50", Decimal("75.50")), ("0", Decimal("0")), ("", None)]:
            response = self.client.patch(url, {"wholesale_price": value}, format="multipart")
            self.assertEqual(response.status_code, 200, response.data)
            product.refresh_from_db()
            self.assertEqual(product.wholesale_price, expected)
            self.assertEqual(product.price, Decimal("100.00"))

    def test_optional_price_and_invalid_values(self):
        product = Product.objects.create(category=self.category, name="Rice", slug="rice", sku="RICE", price="100.00", stock=10)
        self.assertIsNone(product.wholesale_price)
        url = f"/api/v1/admin/products/{product.pk}/"
        for value in ["-1.00", "1.234", "invalid"]:
            response = self.client.patch(url, {"wholesale_price": value}, format="multipart")
            self.assertEqual(response.status_code, 400)
            self.assertIn("wholesale_price", response.data)
        self.client.force_authenticate(user=None)
        self.assertIsNone(self.client.get(f"/api/v1/products/{product.pk}/").data["wholesale_price"])
        self.assertIn(self.client.patch(url, {"wholesale_price": "1.00"}, format="json").status_code, [401, 403])

    def test_wholesale_tier_rules_and_public_exposure(self):
        product = Product.objects.create(category=self.category, name="Rice", slug="rice", sku="RICE", price="100.00", stock=50)
        url = f"/api/v1/admin/products/{product.pk}/"
        self.assertEqual(self.client.patch(url, {"wholesale_price": "100.00"}, format="multipart").status_code, 400)
        self.assertEqual(self.client.patch(url, {"wholesale_min_quantity": "1"}, format="multipart").status_code, 400)
        response = self.client.patch(url, {"wholesale_price": "80.00", "wholesale_min_quantity": "10"}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(user=None)
        public = self.client.get(f"/api/v1/products/{product.pk}/").data
        self.assertEqual((public["wholesale_price"], public["wholesale_min_quantity"]), ("80.00", 10))
        product.refresh_from_db()
        self.assertEqual(product.unit_price_for(9), Decimal("100.00"))
        self.assertEqual(product.unit_price_for(10), Decimal("80.00"))
        product.wholesale_min_quantity = None
        self.assertEqual(product.unit_price_for(99), Decimal("100.00"))


class DashboardCustomRangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        admin = User.objects.create_user(email="range-admin@example.test", password="test", phone="9876500080", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(admin)

    def test_custom_range_includes_both_dates(self):
        from datetime import datetime
        from django.utils import timezone
        for index, timestamp in enumerate([(2026, 10, 1, 0, 0), (2026, 10, 2, 23, 59), (2026, 10, 3, 0, 0)]):
            customer = User.objects.create_user(email=f"range-{index}@example.test", phone=f"987650008{index + 1}", password="test")
            User.objects.filter(pk=customer.pk).update(date_joined=timezone.make_aware(datetime(*timestamp)))
        response = self.client.get("/api/v1/admin/dashboard/", {"period": "custom", "start": "2026-10-01", "end": "2026-10-02"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["new_customers"], 2)
        response = self.client.get("/api/v1/admin/dashboard/", {"period": "custom", "start": "2026-10-02", "end": "2026-10-02"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["new_customers"], 1)

    def test_missing_and_reversed_dates_are_rejected(self):
        for dates in [{}, {"start": "2026-10-01"}, {"start": "2026-10-03", "end": "2026-10-01"}]:
            response = self.client.get("/api/v1/admin/dashboard/", {"period": "custom", **dates})
            self.assertEqual(response.status_code, 400)

class SamplePriceTests(TestCase):
    def test_sample_mrp_is_editable_but_does_not_support_an_offer(self):
        from .serializers import AdminProductSerializer, ProductSerializer
        category = Category.objects.create(name='Sample', slug='sample')
        product = Product.objects.create(name='Sample item', sku='SAMPLE', slug='sample-item', category=category, price=65, mrp=80, mrp_is_sample=True, badge='special_offer')
        self.assertEqual(ProductSerializer(product).data['display_badge'], '')
        serializer = AdminProductSerializer(product, data={'badge':'special_offer'}, partial=True)
        self.assertFalse(serializer.is_valid())
        serializer = AdminProductSerializer(product, data={'mrp_is_sample':False}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.assertEqual(ProductSerializer(product).data['display_badge'], 'Special Offer')

    def test_pagination_exposes_actual_page_count(self):
        from rest_framework.test import APIClient
        category = Category.objects.create(name='Pages', slug='pages')
        for i in range(13):
            Product.objects.create(name=f'Item {i}', sku=f'P{i}', slug=f'p{i}', category=category, price=10, stock=1)
        data = APIClient().get('/api/v1/products/?page_size=5&page=3').data
        self.assertEqual(data['total_pages'], 3)
        self.assertEqual(data['page_size'], 5)
        self.assertEqual(len(data['results']), 3)
