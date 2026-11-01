# SUPER MARKET

A mobile-first React/Vite storefront with a Django REST API for an Indian supermarket. It includes product browsing, customer JWT authentication, a local cart, COD checkout, order history, a role-protected administration workspace, and a referral wallet-credit workflow.

## Storefront design direction

The Pandiyan Stores storefront uses a Blinkit-inspired shopping layout with original store branding: a sticky delivery/search header, visual categories, a category rail, compact product cards, and a cart drawer. Home, categories, catalogue, search and the mobile cart all use the live API and the same persistent basket. The drawer refreshes stock and prices and checks the configured minimum order before checkout. Guests return to their intended page after signing in or registering. Existing legacy demo components remain isolated from the primary shopping flow. See [DESIGN.md](DESIGN.md) for the reference and adaptation choices.

The supplied Blinkit app recording and these sources inform general e-commerce usability; the implementation uses original components, copy, and styling:

- [Shopify store examples](https://www.shopify.com/in/examples)
- [Simicart grocery app design](https://simicart.com/templates/grocery-app-design/)
- [Baymard online grocery UX guidance](https://baymard.com/audits/online-grocery)

## Requirements

- Node.js 20+ and npm
- Python 3.12+ (Python 3.14 was available during implementation)
- MySQL 8+ for a shared/production-like database (SQLite is the development default)

## Run locally on Windows

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-lock.txt
Copy-Item .env.example .env
py manage.py migrate
py manage.py createsuperuser
py manage.py runserver
```

For MySQL, create a database and user, then set `DB_ENGINE=mysql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` in `backend/.env`. Install the MySQL development client required by `mysqlclient` on Windows before installing requirements. Leave `DB_ENGINE=sqlite` for a zero-setup development database.

### Frontend

```powershell
cd frontend
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
corepack pnpm dev
```

Open the Vite URL (normally http://localhost:5173). The API defaults to http://localhost:8000/api/v1.

## Useful commands

- `py manage.py test --settings=config.test_settings` — backend tests
- `corepack pnpm build` — production frontend build
- `py manage.py createsuperuser` — create the first administrator securely; no administrator credentials are seeded

OpenAPI documentation is available at `/api/schema/swagger-ui/` after starting Django.

## Deploy on Vercel

The repository root `vercel.json` configures a `frontend` Vite service and a
`backend` Django service. The backend receives public `/api/*` requests; all
other paths route to the frontend, which serves the React application and its
client-side routes. The frontend uses same-origin `/api/v1` requests in
production, so no build-time backend URL or service binding is needed.

Before deploying, configure these environment variables in the Vercel project:

- `DJANGO_SECRET_KEY`: a unique, strong production secret.
- `DJANGO_DEBUG=False`.
- `DJANGO_ALLOWED_HOSTS`: comma-separated custom domains, if any. Vercel's
  `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` hosts are included
  automatically.
- `DB_ENGINE=mysql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and
  `DB_PORT`: credentials for a persistent MySQL service reachable from Vercel
  Functions.

Do not use the default SQLite database for deployed data: Vercel function
storage is not persistent. Run database migrations against the configured
deployment database as a separate deployment operation; they are not run
automatically during builds. With Vercel CLI 50.38.0 or newer, `vercel dev`
runs both services locally.

## Implemented API

- `POST /api/v1/auth/register/`, `/auth/login/`, `/auth/refresh/`, `/auth/logout/`, `/auth/me/`
- `GET /api/v1/categories/`, `/products/`, `/products/{id}/`
- `POST /api/v1/orders/`, `GET /api/v1/orders/`, `/orders/{id}/`
- `GET /api/v1/referrals/me/`, `/referrals/me/rewards/`, `/referrals/me/wallet/`; `POST /api/v1/referrals/validate/`
- `GET /api/v1/system-settings/public/` for Pandiyan Stores contact and delivery details
- `/api/v1/admin/dashboard/`, `/admin/products/`, `/admin/categories/`, `/admin/orders/`
- Referral administration under `/api/v1/admin/`: `/referrals/`, `/referrals/stats/`, `/referrals/network/`, `/referrals/network/{customer_id}/`, `/referrals/wallet-adjustments/`, `/rewards/`, and `/referral-settings/`
- Authenticated customer services under `/api/v1/account/`: addresses, wishlist, questions, requests, support tickets, returns, rewards, reseller applications and payouts
- Public published content at `/api/v1/blogs/`, `/api/v1/blog-categories/`, and `/api/v1/store-information/`
- Administrator services under `/api/v1/admin/`: customer questions/requests, support tickets, returns, blog posts/categories, reseller applications/commissions/payouts, commission rules, store information and referral reward overview

The Account page links to orders, referral rewards, questions, saved addresses, customer requests, published blogs, wishlist, support, the reseller programme, and configured store information. Authorized staff also receive an Admin dashboard link. The administration workspace is separate from the storefront and presents tools according to staff role. Customer endpoints scope records to the authenticated user; administrative APIs require an active staff account and enforce role/module permissions.

## Store policy pages

The storefront provides `/terms-and-conditions`, `/privacy-policy`, `/delivery-policy`, `/return-refund-policy`, and `/ugc-policy`. Policy links open a compact, scrollable dialog with a close button; the routes remain directly accessible and refreshable. Policy prose is managed in the existing admin store-information JSON (`terms`, `privacy_policy`, `return_policy`, and `ugc_policy`); authorized Senior Admins and managers explicitly granted the `blogs` module can edit it. Saving publishes immediately. The existing store-information model has no policy-specific approval status or revision history. Delivery charges, PIN codes, minimum order, operating hours, and estimated delivery timeline are read from authorized system settings; the default 30-minute estimate is subject to actual operations.

The policy pages are marked as drafts until owner/legal review. The owner-supplied Terms, Privacy and Refund text is included in the page drafts, with implementation-dependent privacy and payment statements qualified to match the current site. The proposed broad UGC licence is displayed as inactive pending approval. Before considering the text final, the owner must resolve the 14-day versus 30-day general return period, the start of the 24-hour perishable and 48-hour damaged-item periods, UGC licence scope/duration, dispute jurisdiction and liability wording, privacy/deletion/tracking claims, and COD refund method/timing. No legal approval or compliance claim is implied.

## Current limits

SQLite is the default for local convenience; MySQL is configured as an option and should be used for deployment. Orders are COD only. Checkout requires a supported PIN and ₹300 merchandise subtotal; it charges ₹30 through a ₹1,000 subtotal inclusive and is free only above ₹1,000. Prices, discounts, delivery availability and stock are recalculated by the server. Referral qualification is cumulative net spending from a user's own delivered orders; referral purchases do not count toward that user's threshold. Referral rewards use immutable wallet ledger entries, idempotent credits, and configurable percentage rules capped at five levels. Commissions are awarded only after delivery and reversed for cancellations, completed returns and full refunds. Managers receive only Senior Admin-assigned API module grants; referral settings and wallet adjustments remain Senior Admin-only. Wallet checkout is available when enabled by an administrator. Expiry is not implemented; credits do not expire. Ineligible reward attempts are not retained as durable records. Saved addresses, customer questions/requests/support, wishlist, returns, blogs, store information, coupons and reseller applications/commission/payout records are implemented. Payouts are review-and-record only; there is no payment transfer integration. Returns are requested for delivered orders and require administrator handling; customer refund transfers are not integrated. Blog content is stored and rendered as plain text; rich-text HTML is intentionally not rendered. Demo products, stock and featured/bestseller labels are sample data, not real business metrics.

## Catalogue visibility and referral commission basis

Customer catalogue APIs expose only active products with positive stock in active categories; checkout rechecks those flags and locks product rows while validating and decrementing stock. Administrators can still manage inactive and out-of-stock inventory. Product cards, details, cart, and checkout show the selling price and, when available, the MRP and savings; cart and checkout refresh product status and prices before proceeding. Referral rates can apply across all categories or only to selected categories, with a configurable maximum depth of one to five levels. Category reward eligibility can be explicitly enabled or disabled, or inherited from the global referral setting; category-specific rates override global rates only when the explicit override option is enabled. Commissions remain percentages of net merchandise value (subtotal less order discount). When category rates differ, the order-level discount is allocated proportionally to item line totals in cents, with rounding remainder assigned deterministically to the final line item. Confirm this proportional discount allocation as the business policy before relying on category-specific commissions for accounting.

This foundation has not undergone a dedicated security review and should not be described as production-secure without one.


## Catalogue, wallet and reporting update

The catalogue supports category filters, bounded pagination, referral-eligible collections and fast movers (delivered units in the last 30 days). Categories without available inventory remain hidden. Header links use actual categories. Search requests are debounced and obsolete requests cancelled. Admin routes load in separate chunks; expired access tokens refresh through one shared request.

Wallet payment is opt-in at checkout and must be enabled in Admin → Referrals. It is a payment, not a merchandise discount: minimum order, delivery and commission bases remain unchanged. The server applies up to the available balance after coupon/delivery calculation. The order stores `total`, `wallet_amount` and the remaining `amount_due`; only the remainder enters COD payment records. Fully wallet-funded orders are paid. A client-generated checkout UUID makes retries idempotent and rejects reuse with changed contents. The user row is locked while spending/adjusting balances. SQLite is suitable for local development; concurrent production spending requires MySQL row locking.

Cancellation and completed returns restore the wallet-funded amount once. Recorded partial refunds restore the wallet-funded proportion cumulatively, rounded to cents. A completed return plus a later refund never restores more than the original wallet debit. Cash refunds remain manual and must exclude the wallet share. Refund records become immutable once recorded. Reversing an earned reward after it was spent can create a negative ledger balance; no further redemption is allowed until credits cover that balance.

Category rates remain individually configurable, with a bulk action to copy the global level percentages to selected categories. This is a one-time copy, not a persistent named plan. Category overrides and enabled levels determine the rates displayed to customers. Order items retain their category at checkout; rates and eligibility are evaluated at delivery, and credited rewards keep their audit snapshot. The migration backfills existing items with their currently known category; historic category changes cannot be reconstructed. The customer network is limited to the signed-in customer's downline and configured depth, with paginated names, levels and earned commissions, without exposing phone numbers or emails.

The dashboard separates new registrations, delivered-order customers, delivered sales, collected payments, referral credits/reversals, wallet spending/restoration and current outstanding wallet balances. Registration counts are not anonymous website visitors. Wallet CSV exports follow financial-report permissions and date filters. Delivered-sales/customer metrics are grouped by order creation date; collected cash uses the payment update date; wallet flows use ledger timestamps. Outstanding wallet balance is all-time.

### Local commands after installation

Run backend commands from `backend`:

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py test --settings=config.test_settings
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Run frontend commands from `frontend`:

```powershell
node node_modules/vite/bin/vite.js
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
```

Python 3.13 was used with `requirements-lock.txt`; frontend dependencies are pinned by `pnpm-lock.yaml` (pnpm 11.25.0). The local `.env`, SQLite database, preview fixtures and virtual environment are ignored by Git. No production records are seeded.

### Deployment

Install the pinned dependencies, back up the production database and apply Django migrations before routing traffic to the new code. In Vercel, use the frontend pnpm lockfile and enable the Corepack package-manager version setting if required by the build environment. Confirm the persistent MySQL connection, product/category activation and positive stock. Enable wallet spending in referral settings when ready. Test a small authorised order, cancellation and refund against the deployment. No automatic database migrations or cash transfers are performed by this patch. Existing policy drafts and contact inconsistencies still require the owner's approved wording.


## Quick commerce storefront verification

Validated locally on 25 October 2026 with Node 24 and Python 3.14:

- Production frontend build and all 32 frontend tests pass, including an API HTML-response regression test.
- All 89 Django tests pass using isolated SQLite test settings.
- Browser checks cover live category filtering, ascending price sorting, empty search results, delivery PIN selection, add-to-cart, stock-limited quantity changes, minimum order blocking, fee calculation, cart-to-sign-in-to-checkout navigation, and a 390px mobile layout.
- Browser preview uses disposable local sample inventory. No production data was seeded or ordered.

The supplied production URL currently returns the frontend HTML for `/api/v1/categories/` instead of JSON. The client now displays a recoverable availability error in this situation. The root Vercel configuration now explicitly builds both services and routes API and Django static/admin requests to the backend. The frontend-only deployment configuration has been removed. See [DEPLOYMENT.md](DEPLOYMENT.md) for repository-root project settings, environment requirements, and the read-only deployment smoke check. Live deployment verification requires access to the Vercel account owning the existing URL.


## Typography and photography update

The customer storefront uses locally hosted Lato with the included Open Font License, a larger text scale estimated from the supplied Blinkit screenshot, and original photorealistic hero/department artwork. Desktop sizes are 44px hero heading, 26–28px hero copy, 28px promotion headings and 14px category captions. Product labels and mobile text remain readable at narrower widths. The reference site's reported Okra family is not bundled; this is a close available font substitute rather than an exact font match. See DESIGN.md for capture evidence and sizing notes, and frontend/public/images/storefront/provenance.json for generation briefs. Inventory product photographs are unchanged.


## Shopping and fulfilment update

See [QUICK_COMMERCE.md](QUICK_COMMERCE.md) for the new mobile shopping, catalogue, delivery rules, checkout quotes, saved baskets/lists, support, picking, delivery-partner workspace, app installation and aggregate activity reporting. Apply migrations before serving the updated code. UPI/card integration and phone OTP remain deferred.
