# Pandiyan Stores release notes

## Storefront update — 25 October 2026

These changes are already on `main` through commit `09bdabd`. This release-notes PR records the completed implementation; it does not reapply application changes or confirm a production deployment.

### Shopping and visual design

- Replaced the large introductory hero with product-led browsing, offer filters, and a Diwali home theme in burgundy, cream, green, and gold.
- Added compact department icons, a photo category directory, sticky mobile search, bottom navigation, and a floating basket shortcut.
- Added category-specific colours, headings, images, and product selections for clothing, toiletries, perfumes, vegetables, dairy, rice and grains, and pantry essentials, plus a Diwali collection.
- Kept category photos as permanent storefront assets, independent of the illustrative product catalogue. Preview product photography comes from the attributed DummyJSON catalogue.
- Added restrained light, banner, wallet-entry, and product-list animations with reduced-motion support. The supplied Blinkit recording informed the layout and behaviour; the implementation does not claim identical proprietary assets or exact animation timing.
- Connected homepage search to the demo catalogue, including suggestions, category aliases, result counts, and empty states. Added illustrative pack quantities and clothing size selectors.

### Branding, account, and wallet

- Standardized **Pandiyan Stores** across the header, footer, browser title, profile, wallet, authentication, policy defaults, referral copy, and administration screens. Retained the bag-and-hills logo and Theni, Tamil Nadu identity.
- Simplified the profile into quick actions and grouped service links. Guests can view the profile shell; protected customer services still require sign-in.
- Added a wallet shortcut beside the profile and a dedicated page connected to the existing referral-wallet API. It displays the customer's balance, spending availability, and transaction history, with loading, retry, and empty states. Top-ups and gift-card redemption are not implemented.
- Changed the configured default delivery estimate to **30 minutes**, subject to actual delivery operations and configured settings.

### Demo basket

- Added **ADD** and **+/−** controls to homepage, category, and search-result demo cards. Decreasing to zero removes the selected item; clothing sizes are separate basket lines.
- Added `/demo-basket` with quantities, pack sizes, clothing sizes, line totals, subtotal, individual removal, clear-all, and an empty state.
- Kept demo selections separate from the real cart and order flow. Validated selections persist in session storage across refreshes; prices come from the demo catalogue. Quantities are capped at 99 per variant.
- Labelled the basket and illustrative offers as demo content. Checkout is disabled, and demo controls do not create orders or payments. Existing catalogue and real-cart routes retain their separate behaviour.

### Verification completed during implementation

- All 31 frontend tests passed, covering demo search, theme routing, basket variants, totals, quantity limits, storage validation, and route separation among the existing checks.
- The production Vite build passed.
- Targeted backend tests passed for customer-scoped wallet access and the corrected public store-name default.
- Browser checks covered phone widths down to 320px and desktop layouts, category navigation, search, size selection, add/increment/decrement, removal, empty state, refresh persistence, separate real-cart contents, and disabled demo checkout.

### Deployment and remaining work

Apply backend migrations using `python manage.py migrate` against the intended deployment database. Migration `0008_thirty_minute_delivery` updates recognized legacy delivery estimates; `0009_pandiyan_stores_brand` corrects recognized legacy store names and the default. Other custom settings are preserved.

The implementation is pushed to Git, but the live Vercel deployment has not been verified. Homepage product details, prices, and discounts are illustrative and need real store data before becoming purchasable. Play Store packaging and publication remain deferred.

### Included commits

| Commit | Change |
| --- | --- |
| `815c266` | Product-first homepage, category shortcuts, and offer filters |
| `d37edac` | Labelled multi-department visual catalogue preview |
| `5a80bce` | Diwali styling, permanent category imagery, and delivery estimate |
| `8c973d2` | Compact mobile layout, demo search, and product sizes |
| `8629cf3` | Video-informed category themes, profile, and wallet UI |
| `a4a51f6` | Pandiyan Stores branding and settings migration |
| `09bdabd` | Isolated demo basket with quantity and size controls |
