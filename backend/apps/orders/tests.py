from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError
from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIClient
from apps.catalog.models import Category, Product
from apps.referrals.models import Referral, ReferralProgram, ReferralReward, WalletLedger
from apps.referrals.services import award_referral_for_order
from .models import InventoryMovement, Order
from .services import change_order_status, place_order

User = get_user_model()

class StoreWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Test pantry", slug="test-pantry")
        self.product = Product.objects.create(category=self.category, name="Test rice", slug="test-rice", sku="TEST-RICE", price=Decimal("600.00"), stock=5)

    def create_customer(self, email, phone):
        return User.objects.create_user(email=email, password="S0mething-Strong!987", phone=phone, first_name=email.split("@")[0])

    def test_registration_and_duplicate_email(self):
        response = self.client.post("/api/v1/auth/register/", {"full_name": "A Customer", "email": "A@Example.com", "phone": "9876543210", "password": "S0mething-Strong!987", "confirm_password": "S0mething-Strong!987"})
        self.assertEqual(response.status_code, 201)
        customer = User.objects.get(email="a@example.com")
        self.assertTrue(customer.check_password("S0mething-Strong!987"))
        duplicate = self.client.post("/api/v1/auth/register/", {"full_name": "Another", "email": "a@example.com", "phone": "9876543211", "password": "S0mething-Strong!987", "confirm_password": "S0mething-Strong!987"})
        self.assertEqual(duplicate.status_code, 400)

    def test_products_are_listed_and_searchable(self):
        response = self.client.get("/api/v1/products/?search=rice")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["sku"], "TEST-RICE")
        filtered = self.client.get(f"/api/v1/products/?category={self.category.pk}")
        self.assertEqual(filtered.data["count"], 1)

    def test_server_calculates_totals_and_prevents_overselling(self):
        customer = self.create_customer("buyer@example.com", "9876543210")
        self.client.force_authenticate(customer)
        response = self.client.post("/api/v1/orders/", {"customer_name": "Buyer", "phone": customer.phone, "address": "1 Market Road", "delivery_pin_code": "625531", "payment_method": "cod", "items": [{"product_id": self.product.pk, "quantity": 2, "price": "1.00"}]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Decimal(response.data["total"]), Decimal("1200.00"))
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        too_many = self.client.post("/api/v1/orders/", {"customer_name": "Buyer", "phone": customer.phone, "address": "1 Market Road", "delivery_pin_code": "625531", "items": [{"product_id": self.product.pk, "quantity": 4}]}, format="json")
        self.assertEqual(too_many.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)

    def test_wholesale_price_applies_server_side_at_threshold(self):
        self.product.wholesale_price = Decimal("500.00")
        self.product.wholesale_min_quantity = 3
        self.product.stock = 10
        self.product.save()
        customer = self.create_customer("wholesale-buyer@example.com", "9876543299")
        self.client.force_authenticate(customer)
        def order(quantity):
            return self.client.post("/api/v1/orders/", {"customer_name": "Buyer", "phone": customer.phone, "address": "1 Market Road", "delivery_pin_code": "625531", "payment_method": "cod", "items": [{"product_id": self.product.pk, "quantity": quantity, "price": "1.00"}]}, format="json")
        below, at = order(2), order(3)
        self.assertEqual((below.status_code, at.status_code), (201, 201))
        self.assertEqual(Decimal(below.data["subtotal"]), Decimal("1200.00"))
        self.assertEqual(Decimal(at.data["subtotal"]), Decimal("1500.00"))
        self.assertEqual(Order.objects.get(pk=at.data["id"]).items.get().unit_price, Decimal("500.00"))

    def test_checkout_rejects_inactive_products_categories_and_zero_stock(self):
        customer = self.create_customer("visibility-buyer@example.com", "9876543212")
        self.client.force_authenticate(customer)
        payload = {
            "customer_name": "Buyer",
            "phone": customer.phone,
            "address": "1 Market Road",
            "delivery_pin_code": "625531",
            "items": [{"product_id": self.product.pk, "quantity": 1}],
        }

        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        hidden_product = self.client.post("/api/v1/orders/", payload, format="json")
        self.assertEqual(hidden_product.status_code, 400)

        self.product.is_active = True
        self.product.save(update_fields=["is_active"])
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])
        hidden_category = self.client.post("/api/v1/orders/", payload, format="json")
        self.assertEqual(hidden_category.status_code, 400)

        self.category.is_active = True
        self.category.save(update_fields=["is_active"])
        self.product.stock = 0
        self.product.save(update_fields=["stock"])
        no_stock = self.client.post("/api/v1/orders/", payload, format="json")
        self.assertEqual(no_stock.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_orders_are_private_and_unauthenticated_order_api_is_protected(self):
        first = self.create_customer("first@example.com", "9876543210")
        second = self.create_customer("second@example.com", "9876543211")
        order = place_order(customer=first, payload={"customer_name": "First", "phone": first.phone, "address": "Address", "delivery_pin_code": "625531", "items": [{"product_id": self.product.pk, "quantity": 1}]})
        response = self.client.get(f"/api/v1/orders/{order.pk}/")
        self.assertEqual(response.status_code, 401)
        self.client.force_authenticate(second)
        self.assertEqual(self.client.get(f"/api/v1/orders/{order.pk}/").status_code, 404)

    def test_referral_attribution_rewards_only_once_after_qualifying_delivery(self):
        referrer = self.create_customer("referrer@example.com", "9876543210")
        self.client.force_authenticate(None)
        response = self.client.post("/api/v1/auth/register/", {"full_name": "New Customer", "email": "new@example.com", "phone": "9876543211", "password": "S0mething-Strong!987", "confirm_password": "S0mething-Strong!987", "referral_code": referrer.referral_code})
        self.assertEqual(response.status_code, 201)
        referred = User.objects.get(email="new@example.com")
        referral = Referral.objects.get(referred=referred)
        self.assertEqual(referral.referrer, referrer)
        program = ReferralProgram.current()
        program.qualification_threshold = Decimal("0.00")
        program.save()
        order = place_order(customer=referred, payload={"customer_name": "New Customer", "phone": referred.phone, "address": "Address", "delivery_pin_code": "625531", "items": [{"product_id": self.product.pk, "quantity": 1}]})
        self.assertFalse(ReferralReward.objects.filter(referral=referral).exists())
        for status in [Order.Status.CONFIRMED, Order.Status.PROCESSING, Order.Status.PACKED, Order.Status.PICKED_UP, Order.Status.OUT_FOR_DELIVERY, Order.Status.DELIVERED]:
            change_order_status(order=order, new_status=status)
        self.assertEqual(ReferralReward.objects.filter(referral=referral).count(), 2)
        self.assertEqual(WalletLedger.objects.filter(customer=referrer).aggregate(total=Sum("amount"))["total"], Decimal("6.00"))
        self.assertFalse(award_referral_for_order(order))

    def test_order_delivery_status_flow_includes_pickup_before_out_for_delivery(self):
        customer = self.create_customer("delivery-flow@example.com", "9876543213")
        order = place_order(customer=customer, payload={
            "customer_name": "Delivery Customer",
            "phone": customer.phone,
            "address": "1 Market Road",
            "delivery_pin_code": "625531",
            "items": [{"product_id": self.product.pk, "quantity": 1}],
        })
        for status in [Order.Status.CONFIRMED, Order.Status.PROCESSING, Order.Status.PACKED]:
            order = change_order_status(order=order, new_status=status)

        with self.assertRaises(ValidationError):
            change_order_status(order=order, new_status=Order.Status.OUT_FOR_DELIVERY)

        for status in [Order.Status.PICKED_UP, Order.Status.OUT_FOR_DELIVERY, Order.Status.DELIVERED]:
            order = change_order_status(order=order, new_status=status)
        self.assertEqual(order.status, Order.Status.DELIVERED)

    def test_self_referral_validation_and_cancel_restore_stock_once(self):
        customer = self.create_customer("self@example.com", "9876543210")
        response = self.client.post("/api/v1/auth/register/", {"full_name": "Self Referral", "email": "new-self@example.com", "phone": "9876543212", "password": "S0mething-Strong!987", "confirm_password": "S0mething-Strong!987", "referral_code": customer.referral_code})
        self.assertEqual(response.status_code, 201)
        referred = User.objects.get(email="new-self@example.com")
        self.assertEqual(Referral.objects.get(referred=referred).referrer, customer)
        self.client.force_authenticate(referred)
        self_referral = self.client.post("/api/v1/referrals/validate/", {"referral_code": referred.referral_code}, format="json")
        self.assertEqual(self_referral.status_code, 400)
        self.assertIn("You cannot refer yourself.", str(self_referral.data))
        order = place_order(customer=customer, payload={"customer_name": "Self", "phone": customer.phone, "address": "Address", "delivery_pin_code": "625531", "items": [{"product_id": self.product.pk, "quantity": 2}]})
        change_order_status(order=order, new_status=Order.Status.CANCELLED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(InventoryMovement.objects.filter(order=order, kind=InventoryMovement.Kind.RESTOCK).count(), 1)

    def test_admin_endpoints_require_store_admin_and_referral_settings_are_editable(self):
        customer = self.create_customer("customer@example.com", "9876543210")
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get("/api/v1/admin/dashboard/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/admin/products/").status_code, 403)
        admin = User.objects.create_user(email="admin@example.com", password="S0mething-Strong!987", phone="9876543211", first_name="Store", is_staff=True, role=User.Role.ADMIN)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/v1/admin/dashboard/").status_code, 200)
        response = self.client.patch("/api/v1/admin/referral-settings/", {"qualification_threshold": "750.00"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data["qualification_threshold"]), Decimal("750.00"))

    def test_delivery_pin_codes_and_checkout_minimum_are_enforced(self):
        customer = self.create_customer("pin-buyer@example.com", "9876543220")
        self.client.force_authenticate(customer)
        payload = {
            "customer_name": "PIN Buyer",
            "phone": customer.phone,
            "address": "1 Market Road",
            "items": [{"product_id": self.product.pk, "quantity": 1}],
        }
        missing_pin = self.client.post("/api/v1/orders/", payload, format="json")
        self.assertEqual(missing_pin.status_code, 400)
        unsupported = self.client.post("/api/v1/orders/", {**payload, "delivery_pin_code": "625532"}, format="json")
        self.assertEqual(unsupported.status_code, 400)
        accepted = self.client.post("/api/v1/orders/", {**payload, "delivery_pin_code": "625534"}, format="json")
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(accepted.data["delivery_pin_code"], "625534")

    def test_delivery_fee_thresholds_and_minimum_order_boundary(self):
        customer = self.create_customer("fee-buyer@example.com", "9876543221")
        self.client.force_authenticate(customer)
        cases = [
            ("BOUNDARY-300", "300.00", Decimal("30.00")),
            ("BOUNDARY-800", "800.00", Decimal("30.00")),
            ("BOUNDARY-999", "999.00", Decimal("30.00")),
            ("BOUNDARY-1000", "1000.00", Decimal("30.00")),
            ("BOUNDARY-1001", "1001.00", Decimal("0.00")),
        ]
        for index, (sku, price, expected_fee) in enumerate(cases):
            category = Category.objects.create(name=f"Boundary {index}", slug=f"boundary-{index}")
            product = Product.objects.create(category=category, name=f"Boundary {index}", slug=f"boundary-{index}", sku=sku, price=Decimal(price), stock=2)
            response = self.client.post("/api/v1/orders/", {
                "customer_name": "Fee Buyer",
                "phone": customer.phone,
                "address": "1 Market Road",
                "delivery_pin_code": "625531",
                "delivery_fee": "0.00",
                "items": [{"product_id": product.pk, "quantity": 1}],
            }, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(Decimal(response.data["delivery_fee"]), expected_fee)
            self.assertEqual(Decimal(response.data["total"]), Decimal(price) + expected_fee)

        category = Category.objects.create(name="Below minimum", slug="below-minimum")
        product = Product.objects.create(category=category, name="Below minimum", slug="below-minimum", sku="BELOW-300", price=Decimal("299.00"), stock=2)
        rejected = self.client.post("/api/v1/orders/", {
            "customer_name": "Fee Buyer",
            "phone": customer.phone,
            "address": "1 Market Road",
            "delivery_pin_code": "625531",
            "items": [{"product_id": product.pk, "quantity": 1}],
        }, format="json")
        self.assertEqual(rejected.status_code, 400)

    def test_coupon_discount_is_included_before_delivery_threshold_calculation(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.customer_services.models import Coupon, SystemSettings

        customer = self.create_customer("discounted-delivery@example.com", "9876543222")
        coupon = Coupon.objects.create(
            code="DELIVERY20",
            discount_type=Coupon.DiscountType.PERCENT,
            value=Decimal("20.00"),
            starts_at=timezone.now() - timedelta(days=1),
            expires_at=timezone.now() + timedelta(days=1),
            minimum_purchase=Decimal("300.00"),
        )
        product = Product.objects.create(
            category=self.category,
            name="Discounted delivery item",
            slug="discounted-delivery-item",
            sku="DISCOUNTED-DELIVERY",
            price=Decimal("1200.00"),
            stock=2,
        )
        self.client.force_authenticate(customer)
        response = self.client.post("/api/v1/orders/", {
            "customer_name": "Discount Buyer",
            "phone": customer.phone,
            "address": "1 Market Road",
            "delivery_pin_code": "625531",
            "coupon_code": coupon.code,
            "delivery_fee": "0.00",
            "items": [{"product_id": product.pk, "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("1200.00"))
        self.assertEqual(Decimal(response.data["discount_amount"]), Decimal("240.00"))
        self.assertEqual(Decimal(response.data["delivery_fee"]), Decimal("30.00"))
        self.assertEqual(Decimal(response.data["total"]), Decimal("990.00"))

        settings = SystemSettings.current()
        settings.delivery_fee = Decimal("75.00")
        settings.save(update_fields=["delivery_fee"])
        historical = self.client.get(f"/api/v1/orders/{response.data['id']}/")
        self.assertEqual(historical.status_code, 200)
        self.assertEqual(Decimal(historical.data["delivery_fee"]), Decimal("30.00"))
        self.assertEqual(Decimal(historical.data["total"]), Decimal("990.00"))
