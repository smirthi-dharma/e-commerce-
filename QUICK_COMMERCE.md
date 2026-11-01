# Shopping and fulfilment improvements

This update extends the existing React/Vite storefront and Django REST API. Existing URL paths, email/password authentication, COD checkout, referral ledger, invoice, cancellation and refund workflows remain available. Database changes add fields and tables; they do not replace existing inventory or orders.

## Customer experience

- Compact mobile header, hero and category grid put purchasable products earlier on the homepage. The referral banner stacks correctly on narrow screens. The catalogue uses a horizontal mobile category rail and two product columns.
- Homepage shelves query the whole available catalogue independently for recommended products, genuine offers, previous delivered purchases and recently viewed products. Staff-scheduled banners feed the hero and promotions.
- Search supports brand, pack size and maintained Tamil/English aliases, with bounded typo matching. Staff can add aliases, brands, pack variant groups, unit-price labels, ingredients, nutrition, storage details and up to eight photo URLs. Linked pack sizes appear on product details. Category artwork can be managed in Products & categories.
- Sample MRP values never create savings labels. A genuine previous selling price may still establish a saving. Actual business catalogue content and photographs must be supplied by the owner; no production sample inventory is inserted.
- Guest baskets persist locally. Signed-in baskets synchronize with the account and refresh on window focus. Revision checks reject conflicting writes from another device. A conflict keeps the current local basket and offers an explicit reload of the saved version.
- Customers can save named shopping lists and reorder available products at their current prices and stock limits. Unavailable basket items can show available alternatives from their category.
- Saved addresses support labels, landmarks and optional device coordinates. Customers can search and select saved addresses in the delivery picker. Device location does not replace entering a complete street address; serviceability remains based on configured PIN areas, not geofencing or reverse geocoding.
- Checkout obtains an authenticated server quote using the same calculation path as order creation. It includes coupon discounts, minimum-order eligibility, area delivery fee, wallet split and payable COD. New clients submit the quoted total and wallet contribution; either changing requires a fresh confirmation. Older clients may omit those optional fields.
- Successful checkout opens the order details directly. Arrival windows are recorded at placement. Visible tracking refreshes every 10 seconds. Optional device alerts work while the order page is open; they are not background Web Push, SMS or email delivery.
- Order-linked support accepts issue type, affected line quantities and an optional verified JPEG/PNG/WebP photo up to 2 MB. Photo downloads require the customer or authorized support staff. This does not automatically approve a return or transfer a refund. Existing authorized partial refund recording remains the financial workflow.
- The production build has an install manifest and service worker. Only public shell/assets are cached; API responses, authentication data, private photos and payment/order mutations are not cached. Offline browsing cannot place an order.

## Store operations

Delivery areas are authoritative once at least one area exists. Active areas determine serviceable PINs and optional fee overrides; disabling all configured areas disables delivery. Until areas are configured, legacy system-setting PINs provide compatibility. Saving the PIN list in Store settings updates the active area set. This list accepts valid Indian PINs rather than restricting expansion to two values.

Store settings include a pause switch and customer message, opening and closing times, an opt-in opening-hours gate, an optional maximum open-order capacity (zero means unlimited), and additional preparation minutes per open order. The hours gate defaults off to preserve existing ordering behaviour; the owner must enable it after checking the configured schedule. The estimate is the configured delivery window plus preparation queue allowance, capped at an additional 120 minutes. It is not a traffic prediction or guaranteed arrival time.

Staff order details include a persistent picking checklist and barcode/SKU check. Checklist updates require a current status version and are recorded in the admin audit log. Existing status transitions remain compatible with existing integrations; the checklist is advisory and does not impose a new packing gate on old API clients.

Senior staff can create a `delivery_partner` staff account with only the `delivery` module, then select that account on a delivery-person record. That account sees only its own active assignments in the delivery workspace and cannot read customer administration, inventory, payments or delivery-area settings. It can start an eligible delivery, record completion/failure, write a note/confirmation reference and explicitly share its device location while the page is open. Coordinate updates are bounded, paired and stamped by the server. Customers see a link to a recently shared location; points older than five minutes or belonging to completed/cancelled orders are hidden. This is a current-location link, not a full routing or dispatch optimization service.

The optional product sell-by date stops public listing, basket recovery, pack-variant display and checkout after that date. It describes a single product-level sale cutoff. Multi-lot procurement, FEFO batch allocation and supplier replenishment automation require a separate inventory workflow; this update does not fabricate batch balances.

The dashboard now includes aggregate product-view, add-to-cart, search, empty-search and checkout counts. Event records contain only kind, optional product and timestamp. They do not store search text, customer IDs, session IDs or addresses; counts are not unique visitors or conversion rates. Browser failures to record an event do not block shopping. The event endpoint is rate limited. Operators should define a retention policy for this table before production traffic; no unattended deletion is introduced.

## Deployment

1. Back up the persistent database and apply the new migrations before serving updated application code:

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe manage.py migrate --noinput
   .\.venv\Scripts\python.exe manage.py check
   ```

2. Build the frontend with the established pnpm lockfile. Use the existing same-origin production API configuration; local QA URLs and fixture databases must not be deployed.
3. Confirm real inventory, product imagery, area fees, operating hours, capacity and delivery estimates. Verify linked driver accounts and the support-photo workflow using authorized test orders.
4. Keep the existing persistent PostgreSQL/MySQL configuration for deployed orders and row locking. SQLite remains suitable for local development. This PR does not provision a paid database, image host, messaging provider or monitoring account.

UPI/card gateway integration and phone OTP were explicitly deferred. The existing COD, wallet and email/password flows remain active. Account recovery email, external messaging retries, full geocoding/routing and background push need separately configured provider services; none are represented as operational in this update.

## Validation

Run `python manage.py test --settings=config.test_settings --noinput` from `backend`, and `pnpm test` / `pnpm build` from `frontend`. Also run `python manage.py makemigrations --check --dry-run` before release.

Browser verification uses an isolated SQLite QA database and test-only catalogue, customer and staff accounts. It covers a guest basket through login, account basket synchronization, a saved list, coupon minimum blocking, exact coupon/wallet/COD split, order placement, item support, barcode picking, staff status transitions, customer tracking refresh, delivered-purchase recommendations and reorder. Layout checks cover 360, 390, 768 and 1440 pixels. Service-worker checks confirm API responses are absent from the asset cache. No production orders, messages, payments or inventory are created by these checks.
