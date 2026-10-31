from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customer_services.models import Address, SecurityEvent, SupportTicket
from apps.orders.models import Order

from .deletion import is_deleted
from .models import User


class AccountDeletionTests(TestCase):
    url = "/api/v1/auth/delete-account/"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="delete-me@example.com", password="Secret-pass-1", phone="9000000099", first_name="Asha", last_name="K")
        self.client = APIClient()
        login = self.client.post("/api/v1/auth/login/", {"email": self.user.email, "password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(login.status_code, 200)
        self.refresh = login.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def order(self, status):
        return Order.objects.create(customer=self.user, status=status, customer_name="Asha K", phone="9000000099", address="12 Main Road, Theni", subtotal=500, total=530)

    def test_requires_authentication(self):
        response = APIClient().post(self.url, {"password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(response.status_code, 401)

    def test_wrong_password_keeps_account(self):
        response = self.client.post(self.url, {"password": "wrong"}, format="json", secure=True)
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertFalse(is_deleted(self.user))

    def test_open_order_blocks_deletion(self):
        self.order(Order.Status.OUT_FOR_DELIVERY)
        response = self.client.post(self.url, {"password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn("in progress", str(response.data))
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_staff_cannot_self_delete(self):
        self.user.role = User.Role.ADMIN
        self.user.is_staff = True
        self.user.save()
        response = self.client.post(self.url, {"password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(response.status_code, 400)

    def test_deletion_erases_profile_and_personal_content_and_revokes_sessions(self):
        delivered = self.order(Order.Status.DELIVERED)
        Address.objects.create(customer=self.user, recipient_name="Asha", mobile_number="9000000099", address_line1="12 Main Road", locality="Town", city="Theni", state="Tamil Nadu", pin_code="625531")
        SupportTicket.objects.create(customer=self.user, subject="Help", message="Where is my order?")
        SecurityEvent.objects.create(event_type="failed_login", email="Delete-Me@example.com", ip_address="10.0.0.1")

        response = self.client.post(self.url, {"password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(response.status_code, 204)

        self.user.refresh_from_db()
        self.assertTrue(is_deleted(self.user))
        self.assertFalse(self.user.is_active)
        self.assertFalse(self.user.has_usable_password())
        self.assertEqual((self.user.first_name, self.user.last_name), ("", ""))
        self.assertNotIn("9000000099", self.user.phone)
        self.assertFalse(Address.objects.filter(customer=self.user).exists())
        self.assertFalse(SupportTicket.objects.filter(customer=self.user).exists())
        self.assertFalse(SecurityEvent.objects.filter(email__iexact="delete-me@example.com").exists())
        # Order and invoice records are kept for tax and accounting.
        self.assertTrue(Order.objects.filter(pk=delivered.pk).exists())

        refresh = APIClient().post("/api/v1/auth/refresh/", {"refresh": self.refresh}, format="json", secure=True)
        self.assertEqual(refresh.status_code, 401)
        login = APIClient().post("/api/v1/auth/login/", {"email": "delete-me@example.com", "password": "Secret-pass-1"}, format="json", secure=True)
        self.assertEqual(login.status_code, 400)
        me = self.client.get("/api/v1/auth/me/", secure=True)
        self.assertEqual(me.status_code, 401)

    def test_email_can_register_again_after_deletion(self):
        self.client.post(self.url, {"password": "Secret-pass-1"}, format="json", secure=True)
        self.assertFalse(User.objects.filter(email__iexact="delete-me@example.com").exists())
