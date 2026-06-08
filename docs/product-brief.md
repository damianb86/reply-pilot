# Product brief

## Problem
Merchants using Judge.me reviews need a safe way to draft brand-consistent public replies without handing full control to AI. Review queues can grow quickly, low-star reviews need human care, and replies should preserve the merchant's tone.

## Target user
Store owner, support lead, or ecommerce ops manager responsible for review response quality and response time.

## Merchant persona
Small to mid-size Shopify merchant with an active review flow, usually using Judge.me, who wants faster reply drafting while keeping final approval inside Shopify Admin.

## Value proposition
ReplyPulse AI: Review Replies imports Judge.me reviews, generates AI reply drafts using a saved Brand Voice, routes sensitive reviews to humans, tracks sent replies, and charges credits according to model tier and operation.

## Primary flow
1. Merchant opens ReplyPulse AI: Review Replies embedded in Shopify Admin.
2. Merchant connects Judge.me with a private API token.
3. Merchant configures Brand Voice, greeting, sign-off, avoided phrases, selected AI model, and reply length.
4. Merchant syncs reviews into Queue.
5. Merchant generates or regenerates AI drafts.
6. Merchant edits, skips, restores, approves, and sends replies.
7. Merchant audits sent replies and credit usage.

## Current functional surface
- Connect dashboard for Judge.me status and token management.
- Reviews queue for sync, generation, revision, skip/restore, and approve/send workflows.
- Brand Voice builder with imported historical replies and live preview.
- Settings page for queue behavior, privacy retention, and Brand Voice sections.
- Credits page for packages, Shopify one-time purchases, credit ledger, and model costs.
- Sent log for reply history and CSV export in UI.
- Help page with contact form and privacy data request/delete actions.

## MVP boundaries
- Judge.me is the only active review provider.
- AI providers are OpenAI and Google Gemini, selected by model tier.
- Shopify product reads are used for product context only.
- No autonomous sending: merchant approval remains required.

## Future scope
- Additional review providers: Loox, Yotpo, Stamped, Google Business, Trustpilot.
- Provider-specific write APIs beyond Judge.me.
- More granular team permissions and approval workflows.
- Background jobs for scheduled sync/generation.
- Production observability dashboards.
