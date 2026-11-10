# ASPARC Platform – Phase 1

**ASPARC – Australian Sports Performance and Rehabilitation Centre** · www.asparc.com.au
*PERFORMANCE STARTS HERE.*

Website, AI receptionist ("ASPARC AI – Your Performance Assistant"), lead management, notifications and a secure management dashboard, in one Next.js application.

| | |
|---|---|
| **Stack** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + RLS) · OpenAI · HubSpot · Resend · Vercel |
| **Dependencies** | Deliberately minimal: `next`, `react`, `react-dom`, `zod`. Supabase, OpenAI, HubSpot and Resend are called through their REST APIs, so there are no SDKs to keep updated. |
| **Tests** | 88 automated tests + PostgreSQL migration/RLS tests + browser end-to-end flows – see [docs/TESTING.md](docs/TESTING.md) |

---

## Feature status

The brief asked for a clear split between what works now and what still depends on accounts, keys or approvals.

### ✅ Fully functional now (no external accounts required)

| Feature | Notes |
|---|---|
| **Website – all 10 pages** | Home, Sports Performance, Performance Academy, Rehabilitation, Recovery & Remedial Massage, Performance Testing, About, Contact, Privacy Policy, Terms & Conditions. Responsive and accessible (skip link, labelled forms, keyboard navigation). |
| **Enquiry capture** | 5 pathways: general, booking request, Academy registration (parent/guardian + consent), club partnership, remedial massage. Validation, consent capture, honeypot and rate limiting. |
| **AI receptionist – guided mode** | Runs without an OpenAI key. Answers only from the knowledge base, quotes draft prices with a "subject to confirmation" label, shows in-chat enquiry forms, handles Academy / club / booking / complaint / medical / emergency paths, records every conversation, logs unanswered questions. |
| **AI safety layer** | Enforced in code on every message, in both modes: AI disclosure, emergency → 000, self-harm → 000 + Lifeline, no diagnosis, card numbers removed, complaints escalated, false "you're booked" / "payment received" replies blocked, invented prices blocked. |
| **Editable knowledge base** | Services, prices, availability, hours, contact details, FAQs, policies and AI tone are edited in `/admin`, with no code changes. Only *approved* items are published as fact. |
| **Admin dashboard (`/admin`)** | All 12 sections: Overview, Conversations, Leads, Bookings, Academy Registrations, Revenue, AI Knowledge Base, Pricing & Services, Notifications, Integrations, Reports, Settings. Searchable tables and charts. |
| **Authentication & roles** | Signed HttpOnly session cookie, rate-limited sign-in, roles Owner / Manager / Staff enforced on every API route and mirrored in database RLS. |
| **Lead management** | Qualification score, priority, the 6 pipeline stages, follow-up tracking, notes, history, linked bookings and registrations, privacy-request deletion. |
| **Dashboard notifications** | New qualified leads, Academy enquiries, club partnerships, complaints, unresolved AI questions, booking requests, escalations, daily summaries. |
| **Daily business summary** | Melbourne time zone, built from real records only; can be run on demand from Reports. |
| **Database** | Supabase migrations with foreign keys, indexes, check constraints, triggers and Row Level Security, verified on PostgreSQL 16. |

### 🔑 Built and tested, waiting on your API credentials

| Feature | What's needed | Until then |
|---|---|---|
| Production database & staff logins | Supabase project (URL + keys) | A local development store is used; it is refused in production |
| Conversational AI | `OPENAI_API_KEY` | Guided mode (fully functional) |
| HubSpot CRM sync (contacts, notes, pipeline deals, stage changes) | HubSpot private-app token | Leads live in the ASPARC database; each lead shows "HubSpot: not configured" |
| Email notifications & daily summary email | Resend API key + verified asparc.com.au domain | Notifications appear in the dashboard only |
| Scheduled daily summary | `CRON_SECRET` on Vercel | Run it manually from Reports |

### 🏗 Prepared for later phases (not claimed as live)

| Phase | Status |
|---|---|
| 2 – WhatsApp | Channel adapter, signature-verified webhook and pseudonymous identities are built but **switched off**. Needs Meta Business verification. See [docs/PHASE-2-WHATSAPP.md](docs/PHASE-2-WHATSAPP.md). |
| 3 – Instagram / Messenger | Channel architecture ready, needs Meta app review. |
| 4 – Bookings & payments | Booking requests and registrations captured now; a `payments` table, payment-link fields and Revenue reporting are ready. Live availability, booking confirmation and payments stay off until Cliniko / Stripe are connected. |

### 🧪 Demonstration data

**None.** The dashboard starts empty and shows only real records. There are no sample customers, testimonials, revenue or booking availability.

### 📝 Business information awaiting your approval

These are seeded as **draft / pending** and are labelled that way on the website and by the AI until you approve them in `/admin`:

- Performance Academy price **$380 per 10-week program** (draft) and program dates
- Remedial massage **$60 / $80 / $100** (draft) and practitioner availability
- Performance testing menu: every assessment is *pending confirmation*, and no equipment brand (e.g. VALD/ForceDecks) is mentioned anywhere
- Contact email, phone, social links, venue address and opening hours (left blank and hidden until you enter and approve them)
- Cancellation/refund policy
- Privacy Policy and Terms are drafts showing a "pending legal review" notice (set `LEGAL_STATUS.reviewed = true` in `lib/legal.ts` after review)
- Founder profile wording (from the brief: qualifications and Newcastle Jets / Avondale FC work; nothing added)
- **Photography** (see `public/images/README.md`). The official logo is in place (`public/brand/asparc-logo.jpg`, unaltered); a reversed/white version would let it sit directly on dark backgrounds

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local          # set SESSION_SECRET, ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD
npm run dev                         # http://localhost:3000  ·  admin: /admin
npm test                            # 88 tests
```

With `DATA_BACKEND=local` everything runs without external accounts; data is stored in `.data/local-db.json`. Sign in to `/admin` with the bootstrap email and password, which creates the first Owner.

Production setup is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The full list of accounts and keys is in **[docs/CREDENTIALS.md](docs/CREDENTIALS.md)**.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit + API + AI + integration tests (`node:test`) |
| `npm run test:db` | Apply migrations to a scratch PostgreSQL DB and verify RLS |
| `npm run typecheck` | TypeScript |
| `npm run admin:create -- --email … --role owner` | Create a dashboard user (Supabase Auth in production) |
| `npm run hubspot:setup` | Create the ASPARC custom properties in HubSpot |
| `npm run summary:run -- 2026-11-09` | Generate a daily summary manually |

## Project structure

```
app/
  (site)/                 10 public pages (server-rendered, revalidate every 60s)
  admin/                  dashboard pages (protected by middleware.ts)
  api/
    chat/                 AI receptionist endpoint (+ history)
    enquiries/            all website & in-chat forms
    auth/                 login / logout / me
    admin/…               dashboard API (role-checked)
    cron/daily-summary/   Vercel Cron target
    webhooks/whatsapp/    Phase 2 (disabled)
components/
  site/                   website UI, views, forms
  chat/ChatWidget.tsx     ASPARC AI widget
  admin/                  dashboard UI + 12 sections
lib/
  ai/                     receptionist, guardrails, prompt, tools, guided mode, OpenAI client
  kb/                     knowledge base defaults + service
  leads/                  enquiry intake + qualification
  integrations/           HubSpot, Resend, integration log
  notifications/ reports/ auth/ db/ channels/ time/ security/ http/
supabase/migrations/      schema + RLS
scripts/                  admin creation, HubSpot setup, summaries, migration test
tests/                    automated tests
docs/                     deployment, credentials, testing, architecture, Phase 2
```

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – step-by-step go-live
- [docs/CREDENTIALS.md](docs/CREDENTIALS.md) – every account, key, permission and indicative cost
- [docs/TESTING.md](docs/TESTING.md) – automated and manual test plans
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – data model, AI safety design, channels, privacy
- [docs/PHASE-2-WHATSAPP.md](docs/PHASE-2-WHATSAPP.md) – exactly what Phase 2 requires
