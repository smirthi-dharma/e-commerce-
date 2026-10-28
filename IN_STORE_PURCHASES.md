# In-store Purchase Entry

Open **Admin → Orders → In-store Purchase Entry**. Select an active customer by numeric ID (the form shows their identity before saving), or create a customer using name, unique email and phone. New records have no password sign-in enabled. Enter the shop bill number, purchase date and final paid amount.

Only active staff with the orders module (including senior admins) can use the lookup and entry endpoints. Bill numbers are trimmed, uppercased, and globally unique for this shop; use a year/series prefix if the billing system recycles numbers. Duplicate submissions return a validation error and never create another purchase. A database unique constraint protects concurrent submissions, including submissions for different customers.

`POST /api/v1/admin/orders/in-store/` accepts `customer_id` OR `customer: {full_name, email, phone}`, plus `bill_number`, `purchase_date` (YYYY-MM-DD), and `amount` (positive, at most two decimal places). No products, delivery charges, coupons, stock movements or wallet debits are added. The full amount is treated as the purchase subtotal and total.

Entries are delivered/paid orders using the same completion-rule function as app orders. Referral qualification, first-purchase checks, pending commission settlement, reseller commission and wallet credits retain their existing rules and idempotency keys. Without product categories, the existing uncategorized referral behavior applies: global rates apply where enabled; category-specific rules cannot be inferred from a bill total. Existing customer referral/reseller attribution is preserved.

The bill date is stored explicitly and sets the order purchase timestamp (local midnight), so existing purchase history, sales reports and self-purchase qualification windows use that date. Audit entries, status events, payment records and reward records retain their actual recording times. Reward rules are evaluated at entry time, as in the existing completion flow; historical configurations are not reconstructed. Product-sales reports contain no invented product rows.

The atomic transaction includes customer creation, purchase, successful external payment, payment event, admin audit and purchase rewards. An error rolls back all of them. The audit records the actor, recording timestamp, customer ID, bill number, purchase date, amount and source. Completed order amounts and bill identifiers cannot be edited through the order API.

Apply database migrations before running the updated application:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate
```

Validation: `manage.py test apps.orders apps.referrals apps.customer_services --settings=config.test_settings --noinput`.
