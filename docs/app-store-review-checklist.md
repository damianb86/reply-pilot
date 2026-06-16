# App Store review checklist

Local pre-review updated May 8, 2026 against Shopify's App Store AI self-review requirements.

## Automated checks completed

- [x] `shopify app config validate --json` returns `valid: true`.
- [x] Admin GraphQL product reads and one-time billing purchase operations validate against Shopify's Admin GraphQL schema.
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npm run test` passes.
- [x] `npm run build` passes.
- [x] `shopify app build` passes.
- [x] Production app URL responds over HTTPS: `https://app-reply-pulse.zuam.dev`.

## Code review status

- [x] Embedded app uses Shopify OAuth/session storage and loads App Bridge from `https://cdn.shopify.com/shopifycloud/app-bridge.js`.
- [x] App scopes are minimal for current functionality: `read_products`.
- [x] Shopify Admin API usage is GraphQL-only for Shopify data and billing.
- [x] Credit purchases use Shopify Billing API one-time purchases.
- [x] No checkout, payment gateway, POS, theme app extension, sales channel, post-purchase, subscription, donation, or mobile app builder extension is present.
- [x] Judge.me setup no longer asks merchants to manually type their Shopify shop domain; it uses the authenticated Shopify session.
- [x] Help/support copy is scoped to ReplyPulse AI: Review Replies setup and does not market external agency/freelancer services.

## Manual checks before submission

- [ ] Install on a clean development or review store from a Shopify-owned surface.
- [ ] Uninstall and reinstall, then confirm OAuth, sessions, onboarding, and connected provider records behave correctly.
- [ ] Confirm embedded navigation works inside Shopify Admin in a fresh Chrome incognito session.
- [ ] Confirm Partner Dashboard app URLs, redirect URLs, privacy policy URL, and app listing URLs match production.
- [ ] Confirm Shopify reviewer instructions include safe Judge.me test credentials or clearly documented provider limitations.
- [ ] Configure AI provider keys in the review environment, or document exactly which AI flows are unavailable.
- [ ] Confirm `SHOPIFY_BILLING_TEST` is set appropriately for the review environment so credit purchase approval is testable without unintended real charges.
- [ ] Test credit purchase approval, decline/cancel return, pending status, and ledger update.
- [ ] Verify privacy policy and public landing are reachable without authentication.
- [ ] Verify compliance webhooks return safe responses for `customers/data_request`, `customers/redact`, and `shop/redact`.
- [ ] Confirm public/support email works in production SMTP.
- [ ] Review final App Store listing copy for factual claims, pricing/credit package alignment, support scope, and no off-platform billing promises.
