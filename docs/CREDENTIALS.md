# Accounts, API keys & permissions you need to supply

Every secret goes in **Vercel → Settings → Environment Variables** (and `.env.local` for local work). Never put secrets in code, the dashboard or chat. Only `NEXT_PUBLIC_SITE_URL` is visible to browsers.

Prices are indicative (checked November 2026, mostly USD) and can change, so confirm on each provider's pricing page.

## Phase 1 – needed to go live

| # | Account | Why | Variables | Permissions / settings | Indicative cost |
|---|---|---|---|---|---|
| 1 | **Vercel** | Hosting, HTTPS, daily cron | — (set the others here) | Owner of the project | Hobby is non-commercial only → **Pro ≈ US$20/month** for a business site |
| 2 | **Supabase** | Database, staff authentication, RLS | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_BACKEND=supabase` | Region Sydney; email auth on; **public sign-ups off**; service role key server-only | Free to start (pauses after 7 days' inactivity, no backups); **Pro ≈ US$25/month** recommended once real client data is stored |
| 3 | **Session secret** | Signs admin sessions | `SESSION_SECRET` (48+ random bytes) | Different value per environment | — |
| 4 | **Cron secret** | Protects the daily summary endpoint | `CRON_SECRET` | — | — |
| 5 | **Domain** asparc.com.au | Website address, email sending | DNS records for Vercel + Resend | Registrar access | Existing |

## Phase 1 – optional, recommended

| # | Account | Why | Variables | Permissions | Indicative cost |
|---|---|---|---|---|---|
| 6 | **OpenAI** | Conversational AI receptionist (guided mode works without it) | `OPENAI_API_KEY`, `OPENAI_MODEL` | Project-scoped key; set a monthly spend limit | Usage-based. `gpt-4o-mini` lists at US$0.15 / 1M input and US$0.60 / 1M output tokens, so roughly a dollar or two per thousand chat messages at this size of prompt |
| 7 | **HubSpot** | CRM & sales pipeline | `HUBSPOT_ACCESS_TOKEN`, optional `HUBSPOT_PORTAL_ID`, `HUBSPOT_PIPELINE_ID`, `HUBSPOT_STAGE_*` | Private app scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`, `crm.schemas.contacts.read/write` | Free CRM: 2 users, 1 deal pipeline, **10 custom properties** (ASPARC uses 6), contact cap on newer free accounts |
| 8 | **Resend** | Email notifications & daily summary | `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_EMAIL_TO`, `SEND_CUSTOMER_ACKNOWLEDGEMENTS` | Verified sending domain asparc.com.au; key with sending access only | Free: 3,000 emails/month, 100/day, 1 domain |

**Minimum monthly running cost for Phase 1: about US$20 (Vercel Pro), with Supabase Free, HubSpot Free and Resend Free, plus small OpenAI usage. Recommended once live: about US$45 (adds Supabase Pro for backups).**

## Later phases

| Phase | Account | Variables | Approval needed |
|---|---|---|---|
| 2 | **Meta Business** + WhatsApp Business Platform (Cloud API) | `WHATSAPP_ENABLED`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` | Meta Business verification; a phone number not already on WhatsApp; app with `whatsapp_business_messaging` + `whatsapp_business_management` |
| 3 | **Meta app** for Instagram & Messenger | `META_MESSENGER_ENABLED`, `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_ACCOUNT_ID` | Meta App Review for `pages_messaging`, `instagram_manage_messages`; Instagram professional account linked to the Facebook Page |
| 4 | **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Business verification; restricted key; webhook for `checkout.session.completed` / `payment_intent.succeeded` |
| 4 | **Cliniko** (or another booking system) | `CLINIKO_API_KEY`, `CLINIKO_SHARD` | API key from a Cliniko user with appropriate permissions |

## Security practices built in

- Secrets are read only in server code (`lib/config/env.ts`). The Integrations page shows *which* variables are missing, never their values.
- The Supabase service role key is used only by server routes. Every table has RLS, so the public `anon` role can't read or write anything.
- Admin sessions: HMAC-signed, HttpOnly, SameSite=Lax, Secure in production, 12-hour expiry. Sign-in is rate-limited per IP and per email.
- Rotate any key immediately if it's exposed: update it in Vercel, then redeploy.
