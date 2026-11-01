from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.accounts.models import User
from apps.customer_services.models import AdminAuditEntry, PaymentTransaction
from apps.referrals.models import Referral, ReferralProgram, ReferralReward, WalletLedger
from apps.referrals.services import qualifying_self_purchase_total
from .models import Order
from .services import record_in_store_purchase, apply_purchase_rules


class InStorePurchaseTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='admin@test.com', phone='9000000011', is_staff=True, role='order_manager', admin_modules=['orders'])
        self.customer = User.objects.create_user(email='buyer@test.com', phone='9000000012', first_name='Buyer')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.payload = {'customer_id': self.customer.pk, 'bill_number': 'shop-001', 'purchase_date': str(timezone.localdate()), 'amount': '1500.00'}

    def post(self, **changes):
        return self.client.post('/api/v1/admin/orders/in-store/', {**self.payload, **changes}, format='json')

    def test_completed_history_payment_and_audit(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertEqual((order.status, order.payment_status, order.source), ('delivered', 'paid', 'in_store'))
        self.assertEqual(order.total, Decimal('1500.00'))
        self.assertFalse(order.items.exists())
        self.assertFalse(order.inventory_movements.exists())
        self.assertEqual(order.payment_transactions.get().status, 'successful')
        audit = AdminAuditEntry.objects.get(action='in_store_purchase')
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.changes['bill_number'], 'SHOP-001')
        self.assertEqual(qualifying_self_purchase_total(self.customer), Decimal('1500.00'))
        self.client.force_authenticate(self.customer)
        history = self.client.get('/api/v1/orders/').data
        self.assertEqual(history['count'], 1)

    def test_duplicate_bill_rejected_across_customers_and_case(self):
        self.assertEqual(self.post().status_code, 201)
        for changes in ({}, {'bill_number': ' SHOP-001 '}, {'amount': '1600.00'}):
            self.assertEqual(self.post(**changes).status_code, 400)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(PaymentTransaction.objects.count(), 1)
        self.assertEqual(AdminAuditEntry.objects.filter(action='in_store_purchase').count(), 1)

    def test_permissions_and_lookup(self):
        self.assertEqual(self.client.get('/api/v1/admin/orders/in-store-customer/', {'customer_id': self.customer.pk}).status_code, 200)
        for user in [self.customer, User.objects.create_user(email='staff@test.com', phone='9000000013', is_staff=True, role='finance_manager', admin_modules=['reports'])]:
            self.client.force_authenticate(user)
            self.assertEqual(self.post().status_code, 403)
            self.assertEqual(self.client.get('/api/v1/admin/orders/in-store-customer/', {'customer_id': self.customer.pk}).status_code, 403)

    def test_invalid_inputs(self):
        for changes in [{'amount': '0'}, {'amount': '-1'}, {'amount': '1.001'}, {'purchase_date': str(timezone.localdate() + timedelta(days=1))}, {'customer_id': self.admin.pk}, {'bill_number': ''}, {'customer_id': 99999}]:
            self.assertEqual(self.post(**changes).status_code, 400, changes)
        self.assertFalse(Order.objects.exists())

    def test_new_customer_and_atomic_rollback(self):
        payload = {k: v for k, v in self.payload.items() if k != 'customer_id'}
        payload['customer'] = {'full_name': 'New Buyer', 'email': 'new@test.com', 'phone': '9000000099'}
        with patch('apps.orders.services.apply_purchase_rules', side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):
                record_in_store_purchase(actor=self.admin, payload=payload)
        self.assertFalse(User.objects.filter(email='new@test.com').exists())
        self.assertFalse(Order.objects.exists())
        self.assertFalse(AdminAuditEntry.objects.exists())
        response = self.client.post('/api/v1/admin/orders/in-store/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Order.objects.get().customer.email, 'new@test.com')

    def test_referral_wallet_exactly_once_and_first_purchase_rule(self):
        program = ReferralProgram.current()
        program.qualification_threshold = 0
        program.save()
        referrer = User.objects.create_user(email='referrer@test.com', phone='9000000014')
        Referral.objects.create(referrer=referrer, referred=self.customer)
        self.assertEqual(self.post().status_code, 201)
        order = Order.objects.get()
        self.assertEqual(ReferralReward.objects.filter(order=order).count(), 2)
        self.assertEqual(WalletLedger.objects.filter(customer=referrer).get().amount, Decimal('15.00'))
        apply_purchase_rules(order)
        self.assertEqual(self.post().status_code, 400)
        self.assertEqual(WalletLedger.objects.count(), 2)
        self.assertEqual(self.post(bill_number='second').status_code, 201)
        self.assertEqual(WalletLedger.objects.count(), 2)

    def test_old_purchase_uses_bill_date_for_qualification(self):
        program = ReferralProgram.current()
        self.assertEqual(self.post(purchase_date=str(timezone.localdate() - timedelta(days=60))).status_code, 201)
        self.assertEqual(qualifying_self_purchase_total(self.customer, program), 0)

    def test_reseller_commission_once(self):
        from apps.customer_services.models import ResellerProfile, ResellerAttribution, CommissionRule, ResellerCommission
        owner = User.objects.create_user(email='reseller@test.com', phone='9000000015')
        reseller = ResellerProfile.objects.create(customer=owner, status='approved')
        ResellerAttribution.objects.create(customer=self.customer, reseller=reseller)
        CommissionRule.objects.create(pk=1, commission_percent=10, minimum_order_amount=50)
        self.assertEqual(self.post().status_code, 201)
        apply_purchase_rules(Order.objects.get())
        self.assertEqual(ResellerCommission.objects.count(), 1)
        self.assertEqual(ResellerCommission.objects.get().amount, Decimal('150.00'))

    def test_self_purchase_unlocks_pending_commission(self):
        ReferralProgram.current()
        buyer = User.objects.create_user(email='downline@test.com', phone='9000000016')
        Referral.objects.create(referrer=self.customer, referred=buyer)
        self.assertEqual(self.post(customer_id=buyer.pk).status_code, 201)
        reward = ReferralReward.objects.get(recipient=self.customer)
        self.assertEqual(reward.status, 'pending')
        self.assertEqual(self.post(bill_number='self-purchase').status_code, 201)
        reward.refresh_from_db()
        self.assertEqual(reward.status, 'credited')
        self.assertEqual(WalletLedger.objects.filter(customer=self.customer).count(), 1)
