# Architecture

```
                ┌──────────────────────── Vercel (Next.js 15) ────────────────────────┐
 Visitors ───▶  │  Website pages (SSR/ISR 60s) ──reads──▶ Knowledge base & services    │
                │  Chat widget ──▶ /api/chat ──▶ Receptionist ──▶ Guardrails           │
                │                                    │  ├─ OpenAI (function calling)   │
                │  Forms ──▶ /api/enquiries ──▶ Lead intake ─┤  └─ Guided mode (no key)│
                │                              │  ├─ qualification                     │
                │                              │  ├─ notifications ──▶ Resend email    │
                │                              │  └─ CRM sync ──▶ HubSpot              │
 Staff ──────▶  │  /admin (middleware) ──▶ /api/admin/* (session + role check)         │
 Vercel Cron ─▶ │  /api/cron/daily-summary (Melbourne time)                            │
 Meta (Ph 2–3)▶ │  /api/webhooks/whatsapp (disabled until configured)                  │
                └──────────────────────────────┬──────────────────────────────────────┘
                                               │ service role (server only)
                                     Supabase PostgreSQL + RLS + Auth
```

## Key decisions

- **One repository interface** (`lib/db/repo.ts`) with two adapters: Supabase (PostgREST over `fetch`) for production and a local JSON store for development and tests. All domain logic is tested once and runs on both.
- **No vendor SDKs.** Supabase, OpenAI, HubSpot and Resend are called over REST with timeouts and logging (`integration_logs`). That means fewer dependencies, a smaller attack surface and easy mocking.
- **One intake path.** Every enquiry (5 forms + chat) goes through `submitEnquiry()`: validate → upsert customer → qualify → lead + history → booking request / Academy registration → notification → HubSpot. This keeps behaviour consistent across channels.
- **The knowledge base is the single source of truth** for the website and the AI. Only `approved` items are presented as fact; `draft` shows as "being confirmed".

## Data model (`supabase/migrations`)

`customers` 1─* `leads` 1─* `lead_events` · `leads` 1─* `booking_requests`, `academy_registrations` · `conversations` 1─* `messages` (conversation ↔ customer/lead links) · `services`, `knowledge_base` · `notifications`, `integration_logs`, `daily_summaries` · `payments` (Phase 4) · `admin_users` (= Supabase Auth users + role).

Enforced in the database, not just the app:
- Pipeline stages, lead types and age groups are check constraints.
- Every customer must have an email or a phone number.
- Draft or approved pricing must have a price; payment links must be `https://`.
- Academy registrations require recorded guardian consent.
- `updated_at` is maintained by triggers.

Indexes cover every list and filter used by the dashboard.

## AI receptionist safety design

Order of operations for every inbound message (`lib/ai/receptionist.ts`):

1. **Deterministic checks in code**, before any model call. Card numbers are redacted before storage or model calls; self-harm → 000 + Lifeline and escalation; emergency → 000 and an urgent notification; "are you human" → honest disclosure; request for a person, or a complaint → escalation; medical question → no diagnosis and a practitioner referral.
2. **Model or guided mode.** OpenAI receives a system prompt with hard rules plus the knowledge-base snapshot, and can act **only** through 7 controlled tools:
   - `search_knowledge_base`
   - `list_services`
   - `show_enquiry_form`
   - `capture_lead` (rejected without explicit consent; Academy enquiries must come from a parent or guardian)
   - `escalate_to_management`
   - `log_unanswered_question`
   - `get_payment_link` (only approved prices with a configured link)

   If the model fails, guided mode answers from the knowledge base instead.
3. **Output validation.** Replies claiming a booking, registration or payment is confirmed are replaced. Any dollar amount not in the services table is blocked, and the conversation is flagged for review.
4. **Disclosure.** The first reply always states it's an AI assistant (prepended in code).

Contact details are captured with **forms and checkbox consent** (also inside the chat), not parsed from free text, so consent is explicit and data is validated. Tool-call logs store `[recorded]` instead of contact details. The AI is told not to ask for medical information, and forms ask people not to include it.

## Multi-channel design (Phases 2–3)

`lib/channels/` defines a `ChannelAdapter` (`enabled`, `renderActions`, `send`). Every channel calls the **same** `handleChatMessage()`, so it gets the same knowledge base, guardrails and tools. Conversations are keyed by `(channel, visitor_id)`. Messaging IDs are hashed into pseudonymous visitor IDs, and conversations are **never merged across channels** automatically. Linking to a customer happens only when the person submits details with consent. The WhatsApp adapter replies only to inbound messages (inside the 24-hour service window), turns forms into secure links to the website, and verifies Meta's `X-Hub-Signature-256`.

## Privacy (Australian Privacy Principles)

- **Collection:** only what's needed; contact consent and marketing opt-in are separate, timestamped fields.
- **Children:** parent or guardian only; children's names are never sent to HubSpot.
- **Medical:** not collected through chat or forms.
- **Overseas disclosure:** processors are listed in the Privacy Policy.
- **Access and deletion:** Owner can delete a customer and all linked records (Leads → lead → *Delete customer data*).
- **Security:** RLS on every table, role-based access, signed sessions, rate limiting, secrets only in environment variables, `noindex` and `no-store` on `/admin`, security headers in `next.config.mjs`.
