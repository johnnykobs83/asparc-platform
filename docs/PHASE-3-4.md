# Phases 3 and 4 – what is built and how to switch it on

Everything here is **inactive by default**. Each endpoint returns 503 until its
environment variables are set, so nothing goes live by accident. All of it is
covered by automated tests against mocked provider APIs (`tests/phases.test.ts`);
none of it has been tested against the real services yet.

## Phase 3 – Facebook Messenger and Instagram

Built:

- `lib/channels/messenger.ts`: Messenger Platform sender for both Facebook and Instagram, quick replies, and splitting of long replies to fit each platform's message limit.
- `app/api/webhooks/meta/route.ts`: one webhook for both. Messages go to the **same** ASPARC AI receptionist, knowledge base and guardrails as the website, with the same STOP/START opt-out and redelivery protection as WhatsApp.

You need to provide:

1. A Facebook Page for ASPARC, linked to the Instagram professional account.
2. A Meta developer app with the Messenger and Instagram products, and **app review** approved for `pages_messaging` and `instagram_manage_messages`.
3. Environment variables in Vercel:
   - `META_MESSENGER_ENABLED=true`
   - `META_PAGE_ACCESS_TOKEN` – a long-lived Page access token
   - `META_APP_SECRET` – App settings → Basic (shared with WhatsApp)
   - `META_VERIFY_TOKEN` – any random string (falls back to `WHATSAPP_VERIFY_TOKEN`)
4. In the Meta app, set the webhook callback URL to `https://www.asparc.com.au/api/webhooks/meta`, use the verify token above, and subscribe the Page to the `messages` field (and the Instagram account to `messages`).

Then test from a personal account: AI disclosure, an Academy question, a medical question, an emergency (000) and a complaint.

## Phase 4 – Payments (Stripe)

Built:

- `lib/integrations/stripe.ts` and `app/api/webhooks/stripe/route.ts`: a signature-verified Stripe webhook that writes to the `payments` table. No Stripe SDK and no card data: customers pay on Stripe-hosted pages (Payment Links or Checkout).
- Events handled: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded` (full refunds).
- A successful payment creates a "Payment received" notification. It does **not** confirm a booking or registration – staff still do that.
- The Revenue page and daily summary read only from these records.

You need to provide:

1. A Stripe account (stripe.com) with the business verified.
2. A Payment Link for each thing you want to sell online. Paste it into the service's *Payment link* field in **Pricing & Services** (only allowed once that price is approved).
3. In Stripe → Developers → Webhooks, add an endpoint `https://www.asparc.com.au/api/webhooks/stripe` with the four events above, and copy its **signing secret**.
4. Environment variable in Vercel: `STRIPE_WEBHOOK_SECRET` (the `whsec_…` signing secret). `STRIPE_SECRET_KEY` is not needed by the webhook.

Then make a test-mode payment and confirm it appears in **Revenue**.

## Phase 4 – Bookings (Cliniko or similar): not built

Live availability and automatic booking confirmation are **not** built. They
depend on which booking system ASPARC chooses and on that account existing, and
"nothing is confirmed automatically" is a rule of this platform until that
decision is made. Booking requests continue to be captured for staff to confirm.
