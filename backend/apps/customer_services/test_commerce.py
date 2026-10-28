import io
import json
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.accounts.models import User
from apps.catalog.models import Category, Product
from apps.orders.models import Order
from apps.orders.services import place_order
from apps.referrals.models import ReferralProgram, WalletLedger
from .models import Coupon, CustomerCart, DeliveryArea, ShoppingList, SupportTicket, SystemSettings


class CommerceFlowTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(email="shopper@example.test", phone="9000000801", password="password")
        self.other = User.objects.create_user(email="other@example.test", phone="9000000802", password="password")
        self.admin = User.objects.create_user(email="staff@example.test", phone="9000000803", password="password", role="admin", is_staff=True)
        self.category = Category.objects.create(name="Rice & grains", slug="rice-grains")
        self.product = Product.objects.create(name="Rice", slug="rice", sku="RICE-1", category=self.category, brand="Local Mill", stock=20, price="350", pack_size="1 kg", variant_group="rice")
        self.client.force_authenticate(self.customer)
        self.payload = {"customer_name":"Shopper", "phone":self.customer.phone, "address":"Test address", "delivery_pin_code":"625531", "items":[{"product_id":self.product.pk,"quantity":1}]}

    def quote(self, **extra):
        return self.client.post('/api/v1/orders/quote/', {**self.payload, **extra}, format='json')

    def test_coupon_quote_matches_submission_without_mutation(self):
        now = timezone.now()
        Coupon.objects.create(code="SAVE40", discount_type="fixed", value=40, starts_at=now-timedelta(days=1), expires_at=now+timedelta(days=1))
        quote = self.quote(coupon_code="SAVE40")
        self.assertEqual(quote.status_code,200)
        self.assertEqual(quote.data['total'],Decimal('340'))
        self.assertTrue(quote.data['eligible'])
        self.assertEqual(Order.objects.count(),0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,20)
        self.assertEqual(Coupon.objects.get().redemptions.count(),0)
        order = self.client.post('/api/v1/orders/', {**self.payload,'coupon_code':'SAVE40','expected_total':str(quote.data['total'])}, format='json')
        self.assertEqual(order.status_code,201)
        self.assertEqual(Decimal(order.data['total']),quote.data['total'])

    def test_discount_below_minimum_returns_ineligible_quote(self):
        self.product.price=320; self.product.save()
        now=timezone.now()
        Coupon.objects.create(code="SAVE40", discount_type="fixed", value=40, starts_at=now-timedelta(days=1), expires_at=now+timedelta(days=1))
        quote=self.quote(coupon_code="SAVE40")
        self.assertEqual(quote.status_code,200)
        self.assertFalse(quote.data['eligible'])
        self.assertEqual(quote.data['remaining_for_minimum'],20)
        self.assertEqual(self.client.post('/api/v1/orders/',{**self.payload,'coupon_code':'SAVE40'},format='json').status_code,400)
        self.assertFalse(Order.objects.exists())

    def test_wallet_quote_does_not_spend_credits(self):
        program=ReferralProgram.current(); program.wallet_spending_enabled=True; program.save()
        WalletLedger.objects.create(customer=self.customer,amount=100,transaction_type='credit')
        quote=self.quote(use_wallet=True)
        self.assertEqual(quote.status_code,200)
        self.assertEqual(quote.data['wallet_amount'],100)
        self.assertEqual(quote.data['amount_due'],280)
        self.assertEqual(WalletLedger.objects.count(),1)

    def test_changed_total_rejected_before_stock_or_order_changes(self):
        response=self.client.post('/api/v1/orders/',{**self.payload,'expected_total':'1.00'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db(); self.assertEqual(self.product.stock,20)

    def test_wallet_split_must_still_match_the_customer_quote(self):
        program=ReferralProgram.current();program.wallet_spending_enabled=True;program.save()
        WalletLedger.objects.create(customer=self.customer,amount=50,transaction_type='credit')
        response=self.client.post('/api/v1/orders/',{**self.payload,'use_wallet':True,'checkout_key':'fdc35558-437e-43d0-9d6d-481d1fa0c444','expected_total':'380','expected_wallet_amount':'100'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(WalletLedger.objects.count(),1)

    def test_retry_recovers_original_order_after_quoted_wallet_was_spent(self):
        program=ReferralProgram.current();program.wallet_spending_enabled=True;program.save()
        WalletLedger.objects.create(customer=self.customer,amount=50,transaction_type='credit')
        payload={**self.payload,'use_wallet':True,'checkout_key':'a4e29042-ef37-45f9-9bb1-01bacf047637','expected_total':'380','expected_wallet_amount':'50'}
        first=self.client.post('/api/v1/orders/',payload,format='json')
        retry=self.client.post('/api/v1/orders/',payload,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(retry.status_code,201)
        self.assertEqual(first.data['id'],retry.data['id'])
        self.assertEqual(Order.objects.count(),1)
        self.assertEqual(WalletLedger.objects.filter(transaction_type='redemption').count(),1)

    def test_sell_by_date_hides_inventory_and_blocks_checkout(self):
        self.product.best_before=timezone.localdate()-timedelta(days=1);self.product.save()
        self.assertEqual(self.client.get('/api/v1/products/').data['count'],0)
        self.assertEqual(self.client.get('/api/v1/categories/').data,[])
        self.assertEqual(self.quote().status_code,400)
        self.assertFalse(Order.objects.exists())

    def test_unranked_sort_parameter_does_not_crash_catalogue(self):
        self.assertEqual(self.client.get('/api/v1/products/?ordering=search_rank').status_code,200)

    def test_managed_delivery_area_fee_and_disabled_area_are_authoritative(self):
        area=DeliveryArea.objects.create(name='New area',pin_code='600001',delivery_fee=15)
        quote=self.quote(delivery_pin_code='600001')
        self.assertEqual(quote.status_code,200)
        self.assertEqual(quote.data['total'],365)
        public=self.client.get('/api/v1/system-settings/public/?pin=600001')
        self.assertEqual(public.data['delivery_pin_codes'],['600001'])
        area.is_active=False; area.save()
        self.assertEqual(self.quote(delivery_pin_code='600001').status_code,400)
        self.assertEqual(self.quote().status_code,400)

    def test_pause_capacity_and_operating_hours(self):
        settings=SystemSettings.current(); settings.orders_paused=True; settings.save()
        self.assertFalse(self.quote().data['eligible'])
        self.assertEqual(self.client.post('/api/v1/orders/',self.payload,format='json').status_code,400)
        settings.orders_paused=False; settings.enforce_opening_hours=True; settings.save()
        with patch('apps.customer_services.operations.timezone.localtime',return_value=datetime(2026,10,28,23,0,tzinfo=dt_timezone.utc)):
            self.assertFalse(self.quote().data['eligible'])
        settings.enforce_opening_hours=False; settings.save()
        order=place_order(customer=self.customer,payload=self.payload)
        self.assertIsNotNone(order.estimated_delivery_latest_at)
        settings.max_active_orders=1; settings.save()
        self.assertFalse(self.quote().data['eligible'])

    def test_configured_pin_expansion_and_invalid_pin_validation(self):
        self.client.force_authenticate(self.admin)
        response=self.client.patch('/api/v1/admin/system-settings/',{'delivery_pin_codes':['600001']},format='json')
        self.assertEqual(response.status_code,200)
        self.assertTrue(DeliveryArea.objects.get(pin_code='600001').is_active)
        self.assertEqual(self.client.patch('/api/v1/admin/system-settings/',{'delivery_pin_codes':['bad']},format='json').status_code,400)

    def test_multilingual_typo_and_brand_search(self):
        for query in ['அரிசி','arisi','ricce','Local Mill']:
            response=self.client.get('/api/v1/products/',{'search':query})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.data['results'][0]['id'],self.product.pk)
        self.assertEqual(self.client.get('/api/v1/products/',{'brand':'Other'}).data['count'],0)

    def test_variant_detail_excludes_inactive_inventory(self):
        other=Product.objects.create(name='Rice 5kg',slug='rice-5',sku='RICE-5',category=self.category,stock=5,price=1500,variant_group='rice')
        response=self.client.get(f'/api/v1/products/{self.product.pk}/')
        self.assertEqual({row['id'] for row in response.data['variants']},{self.product.pk,other.pk})
        other.is_active=False; other.save()
        self.assertEqual(len(self.client.get(f'/api/v1/products/{self.product.pk}/').data['variants']),1)

    def test_cart_revisions_stock_bounds_and_customer_isolation(self):
        response=self.client.put('/api/v1/account/cart/',{'revision':0,'items':[{'product_id':self.product.pk,'quantity':99}]},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['items'][0]['quantity'],20)
        self.assertEqual(self.client.put('/api/v1/account/cart/',{'revision':0,'items':[]},format='json').status_code,409)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/v1/account/cart/').data['items'],[])
        self.assertEqual(CustomerCart.objects.get(customer=self.customer).items[0]['quantity'],20)

    def test_saved_lists_are_private_and_use_current_stock(self):
        response=self.client.post('/api/v1/account/shopping-lists/',{'name':'Weekly','items':[{'product_id':self.product.pk,'quantity':2}]},format='json')
        self.assertEqual(response.status_code,201)
        pk=response.data['id']
        self.product.stock=0; self.product.save()
        self.assertEqual(self.client.get(f'/api/v1/account/shopping-lists/{pk}/').data['products'],[])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/v1/account/shopping-lists/{pk}/').status_code,404)
        self.assertEqual(self.client.delete(f'/api/v1/account/shopping-lists/{pk}/').status_code,404)

    def test_issue_items_and_photos_are_private(self):
        order=place_order(customer=self.customer,payload=self.payload)
        content=io.BytesIO(); Image.new('RGB',(3,3)).save(content,format='PNG')
        response=self.client.post('/api/v1/account/support-tickets/',{'subject':'Item problem','message':'Please help','order':str(order.pk),'issue_type':'quality','affected_items':json.dumps([{'item_id':order.items.get().pk,'quantity':1}]),'photo':SimpleUploadedFile('photo.png',content.getvalue(),content_type='image/png')},format='multipart')
        self.assertEqual(response.status_code,201,response.data)
        photo_url=f"/api/v1/account/support-tickets/{response.data['id']}/photo/"
        response=self.client.get(photo_url)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response['Cache-Control'],'private, no-store')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(photo_url).status_code,404)
        response=self.client.post('/api/v1/account/support-tickets/',{'subject':'Wrong order','message':'bad','order':str(order.pk)},format='json')
        self.assertEqual(response.status_code,400)

    def test_bad_issue_quantities_and_fake_image_rejected(self):
        order=place_order(customer=self.customer,payload=self.payload)
        response=self.client.post('/api/v1/account/support-tickets/',{'subject':'Item','message':'bad','order':str(order.pk),'affected_items':[{'item_id':order.items.get().pk,'quantity':2}]},format='json')
        self.assertEqual(response.status_code,400)
        response=self.client.post('/api/v1/account/support-tickets/',{'subject':'Item','message':'bad','photo':SimpleUploadedFile('bad.png',b'not a photo',content_type='image/png')},format='multipart')
        self.assertEqual(response.status_code,400)

    def test_packing_permissions_quantities_and_stale_version(self):
        order=place_order(customer=self.customer,payload=self.payload)
        url=f'/api/v1/admin/orders/{order.pk}/packing/'
        line={'id':order.items.get().pk,'quantity':1}
        self.assertEqual(self.client.post(url,{'expected_version':0,'items':[line]},format='json').status_code,403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(url,{'expected_version':0,'items':[line]},format='json').status_code,200)
        self.assertEqual(self.client.post(url,{'expected_version':0,'items':[line]},format='json').status_code,400)
        self.assertEqual(order.items.get().picked_quantity,1)

    def test_buy_again_is_customer_scoped_and_revalidates_stock(self):
        order=place_order(customer=self.customer,payload=self.payload)
        order.status='delivered'; order.save()
        self.assertEqual(self.client.get('/api/v1/products/?collection=buy-again').data['count'],1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/v1/products/?collection=buy-again').data['count'],0)

    def test_driver_access_is_limited_to_assigned_deliveries(self):
        from .models import DeliveryPersonnel, DeliveryAssignment
        driver=User.objects.create_user(email='driver@example.test',phone='9000000804',password='password',role='delivery_partner',is_staff=True,admin_modules=['delivery'])
        person=DeliveryPersonnel.objects.create(name='Driver',phone=driver.phone,user=driver)
        order=place_order(customer=self.customer,payload=self.payload)
        assignment=DeliveryAssignment.objects.create(order=order,personnel=person)
        other_order=place_order(customer=self.other,payload=self.payload)
        other_assignment=DeliveryAssignment.objects.create(order=other_order)
        self.client.force_authenticate(driver)
        response=self.client.get('/api/v1/admin/delivery-assignments/')
        self.assertEqual(response.status_code,200)
        self.assertEqual([row['id'] for row in response.data['results']],[assignment.pk])
        self.assertEqual(self.client.patch(f'/api/v1/admin/delivery-assignments/{other_assignment.pk}/',{'delivery_note':'bad'},format='json').status_code,404)
        for endpoint in ['orders','customers','delivery-personnel','delivery-areas','payments']:
            self.assertEqual(self.client.get(f'/api/v1/admin/{endpoint}/').status_code,403)
        response=self.client.patch(f'/api/v1/admin/delivery-assignments/{assignment.pk}/',{'latitude':'10.010000','longitude':'77.470000','personnel':None},format='json')
        self.assertEqual(response.status_code,200,response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.personnel_id,person.pk)
        self.assertIsNotNone(assignment.location_shared_at)
        self.client.force_authenticate(self.customer)
        self.assertIsNotNone(self.client.get(f'/api/v1/orders/{order.pk}/').data['delivery']['shared_location'])
        assignment.location_shared_at=timezone.now()-timedelta(minutes=6);assignment.save()
        self.assertIsNone(self.client.get(f'/api/v1/orders/{order.pk}/').data['delivery']['shared_location'])

    def test_activity_records_only_aggregate_fields(self):
        from .models import ShoppingActivity
        self.client.force_authenticate(None)
        response=self.client.post('/api/v1/shopping-activity/',{'kind':'product_view','product':self.product.pk,'email':'ignored@example.test','query':'private search'},format='json')
        self.assertEqual(response.status_code,204)
        event=ShoppingActivity.objects.get()
        self.assertEqual(event.kind,'product_view')
        self.assertEqual({field.name for field in event._meta.fields},{'id','kind','product','created_at'})
        self.assertEqual(self.client.post('/api/v1/shopping-activity/',{'kind':'unsupported'},format='json').status_code,400)

    def test_invalid_gallery_and_multipart_metadata_validation(self):
        self.client.force_authenticate(self.admin)
        url=f'/api/v1/admin/products/{self.product.pk}/'
        self.assertEqual(self.client.patch(url,{'gallery':['javascript:alert(1)']},format='json').status_code,400)
        response=self.client.patch(url,{'gallery':json.dumps(['https://example.com/photo.png']),'brand':'Updated brand','best_before':''},format='multipart')
        self.assertEqual(response.status_code,200,response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.brand,'Updated brand')
        self.assertEqual(self.product.gallery,['https://example.com/photo.png'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/v1/products/?collection=buy-again').data['count'],0)
