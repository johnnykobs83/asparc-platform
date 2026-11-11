# ASPARC Platform – Session Handoff & Go-Live Plan

> **For Claude Code:** this file summarises the build session that produced this repository and lists, in order, everything needed to get it live. Read it fully before changing code. Then read `README.md`, `docs/DEPLOYMENT.md` and `docs/ARCHITECTURE.md`. Work through **Part 6** step by step. Stop and ask Johnny whenever a step is marked **👤 Johnny** or needs a business decision.

**Owner:** John "Johnny" Kobiela – founder, ASPARC (Australian Sports Performance and Rehabilitation Centre), Melbourne VIC
**Website:** www.asparc.com.au
**Session date:** 9–10 November 2026
**Status:** Phase 1 code complete and tested in a sandbox. **Not yet built with real npm packages, not deployed, not live.**

---

## Part 1 – What ASPARC is

A premium sports performance, athlete development, rehabilitation and recovery business in Melbourne. Clients:
- professional and semi-professional athletes
- football (soccer) players
- junior and youth athletes
- community sporting clubs
- adults

Services:
- **Sports performance:** S&C, speed, agility, power, football-specific prep, individual development, adult PT.
- **Performance Academy:** ages 8–10, 11–13, 14–16, 16–18. 10 weeks, one 45–60 min session per week. **$380, draft price.**
- **Rehabilitation:** exercise-based return-to-performance only.
- **Remedial massage:** 30/45/60 min at **$60/$80/$100, draft.** Delivered by contractors whose availability is still being confirmed.
- **Performance testing:** aerobic fitness, anaerobic fitness, functional strength, jump, speed, acceleration, power, body asymmetry and athletic profiling (confirmed by Johnny 11 Nov 2026; priced on enquiry).

Founder: Bachelor of Exercise Science & Human Movement (2010), Master of High Performance (2017), professional football high performance with Newcastle Jets and Avondale FC.

Tagline: **HIGH PERFORMANCE STARTS HERE.** Supporting line: *Unlock your potential. Develop your performance. Return stronger.*

Brand colours:

| Colour | Hex |
|---|---|
| Royal blue | `#14519C` |
| Light blue | `#6B9FC5` |
| Charcoal | `#101820` |
| White | `#FFFFFF` |
| Light grey | `#F2F5F8` |

---

## Part 2 – What was built this session

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · OpenAI · HubSpot · Resend · Vercel.

**Dependencies:** only `next`, `react`, `react-dom`, `zod`. Supabase, OpenAI, HubSpot and Resend are called through their REST APIs with `fetch`, with no SDKs.

| Area | Where | Summary |
|---|---|---|
| Website (10 pages) | `app/(site)/*`, `components/site/views/*` | Home, Sports Performance, Performance Academy, Rehabilitation, Recovery & Remedial Massage, Performance Testing, About, Contact, Privacy Policy, Terms. Server-rendered with `revalidate = 60`; content comes from the knowledge base in the DB. |
| Enquiry forms (5) | `components/site/EnquiryForm.tsx`, `app/api/enquiries` | General, booking request, Academy (parent/guardian + consent), club partnership, massage. Zod validation, contact consent, separate marketing opt-in, honeypot, rate limiting. |
| ASPARC AI receptionist | `lib/ai/*`, `components/chat/ChatWidget.tsx`, `app/api/chat` | OpenAI function calling with 7 controlled tools, **or guided mode with no key** (rules + knowledge base). Safety layer in code: AI disclosure; emergency → 000; self-harm → 000 + Lifeline 13 11 14; no diagnosis; card numbers redacted; complaints escalated; false "booked/paid" replies and invented prices blocked. |
| Lead intake & qualification | `lib/leads/*` | One `submitEnquiry()` path for every form and the chat. Transparent qualification score and priority; 6 stages (New Enquiry → Contacted → Qualified → Booking Requested → Converted / Not Proceeding); history; follow-ups. |
| Admin dashboard (12 sections) | `app/admin/*`, `components/admin/*`, `app/api/admin/*` | Overview, Conversations, Leads, Bookings, Academy Registrations, Revenue, AI Knowledge Base, Pricing & Services, Notifications, Integrations, Reports, Settings. |
| Auth & roles | `lib/auth/*`, `middleware.ts`, `lib/http/respond.ts` | HMAC-signed HttpOnly session cookie (12 h); Owner / Manager / Staff permission matrix (`lib/auth/rbac.ts`), mirrored in DB RLS; login rate limiting; same-origin check on mutations. Production passwords live in Supabase Auth. |
| Database | `supabase/migrations/*.sql` | 14 tables with foreign keys, check constraints, indexes and `updated_at` triggers. RLS on every table: anon denied; admins by role. Repository layer has a Supabase PostgREST adapter and a local JSON adapter for dev/tests (`lib/db/*`). |
| HubSpot | `lib/integrations/hubspot.ts`, `scripts/hubspot-setup.ts` | Contact upsert, enquiry note, optional deal in a pipeline, re-sync on stage change. **Uses only 6 custom properties** (HubSpot Free allows 10 in total); stage is also mapped to the built-in `hs_lead_status`. Children's names, transcripts and medical info are never synced. |
| Notifications & email | `lib/notifications/*`, `lib/integrations/resend.ts` | Dashboard notifications always created. Emailed via Resend for the types chosen in the KB setting `settings.notifications`. |
| Daily summary | `lib/reports/daily-summary.ts`, `app/api/cron/daily-summary`, `vercel.json` | Melbourne calendar day (DST-correct); built from real records only; stored, notified and emailed. Cron runs `0 21 * * *` UTC (≈ 7–8 am Melbourne). |
| Phase 2 prep (disabled) | `lib/channels/*`, `app/api/webhooks/whatsapp` | WhatsApp Cloud API adapter + signature-verified webhook. Returns 503 until `WHATSAPP_ENABLED=true`. |
| Brand | `public/brand/asparc-logo.jpg`, `lib/brand.ts`, `components/site/Logo.tsx` | Official logo (supplied 9 Nov, **byte-identical, never alter**). Site header is white so the logo sits on its own background; on dark areas it sits on a white panel. `app/icon.png` / `apple-icon.png` = full logo padded square. |
| Docs | `README.md`, `docs/*` | DEPLOYMENT, CREDENTIALS, TESTING, ARCHITECTURE, PHASE-2-WHATSAPP. |

A static design preview of the website was published as a private claude.ai artifact ("ASPARC – Website Preview"). Forms and chat are disabled in that preview.

---

## Part 3 – Rules that must not be broken (from the brief)

1. **Logo:** use `public/brand/asparc-logo.jpg` exactly as supplied. Never recolour, crop, redraw, filter or distort it. Preserve the aspect ratio (set height only).
2. **No invented business facts:** no prices, hours, addresses, phone numbers, qualifications, equipment, testimonials, statistics, client logos or partnerships beyond the brief. Unconfirmed items stay `draft` / `pending_confirmation` and display as such.
3. **No VALD / ForceDecks or other equipment claims** until Johnny confirms what's available.
4. **No physiotherapy or diagnosis claims.** Rehab is exercise-based return-to-performance, alongside the treating practitioner.
5. **No fake/demo data** in production: no fake customers, revenue or availability. The dashboard shows real records only.
6. **AI safety rules live in code** (`lib/ai/guardrails.ts`, `lib/ai/prompt.ts` → `HARD_RULES`). They must not become editable from the KB or be weakened.
7. **Nothing is "confirmed" automatically.** Bookings, registrations and payments are requests until a staff member confirms them.
8. **Privacy (APPs):** minimal collection; separate contact and marketing consent; guardian consent for minors; no medical data via chat/forms; secrets only in env vars.
9. **Keep dependencies minimal.** Don't add SDKs unless there's a clear need.

---

## Part 4 – Verification status

| Check | Result |
|---|---|
| `npm test` (node:test + tsx): guardrails, AI both modes with mocked OpenAI, all API routes, RBAC, HubSpot/Resend with mocked APIs, Supabase adapter, daily summary | ✅ 88/88 |
| Migrations + RLS on real PostgreSQL 16 with a Supabase auth/role shim (`npm run test:db`) | ✅ 12/12 checks |
| TypeScript strict (lib, API routes, middleware, tests) | ✅ clean |
| Browser E2E in Chrome (real components SSR + hydration, real route handlers): chat → in-chat Academy registration, emergency, booking form, admin login, lead stage + note, price approval reflected on site, all 12 admin sections | ✅ 9/9, 0 console/hydration errors |
| **`npm install` / `next build`** | ❌ **Never run.** The sandbox had no npm registry access |
| **Live calls to Supabase / OpenAI / HubSpot / Resend** | ❌ Not possible (no credentials). Covered by mocked tests only |

Bugs found and fixed during the session (for context):
- Tailwind v4 needs `@utility` for classes that are `@apply`-composed (`.btn*`).
- A non-component value exported from a `'use client'` module was used in a server component; it's now in `components/admin/sections-config.ts`.
- Zod `superRefine` was skipped when consent failed; consent is now checked inside `superRefine` so all errors show together.
- `tsconfig.json` now excludes `tools/`.
- Script commands now load `.env.local`.

---

## Part 5 – Known risks to check first (likely `next build` issues)

| Risk | What to check / do |
|---|---|
| First real build | `npm install && npm run build`. Fix anything it reports. The most likely areas are below. |
| Route handlers are wrapped: `export const GET = handler(async (req, ctx) => …)` | Next 15 type-checks route exports. If it complains about the wrapper's signature, convert to `export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) { return handler(...)(req, ctx) }` or loosen the `handler` generic. Dynamic routes use `params: Promise<…>` (Next 15 style). |
| `middleware.ts` uses `(req: Request)` and returns `Response.redirect` / `undefined` | Should be valid. If Next wants `NextRequest`, import the type from `next/server`. |
| Pages read the DB at build time (ISR) | **Supabase env vars must be set in Vercel before the first build.** Otherwise `lib/db/index.ts` falls back to the local store, which throws in production by design. Optionally set `export const dynamic = 'force-dynamic'` on `app/(site)/layout.tsx` if build-time DB access is a problem. |
| `next/font/google` (Barlow Condensed + Inter) | Needs network at build (fine on Vercel). |
| Tailwind v4 + PostCSS | `postcss.config.mjs` uses `@tailwindcss/postcss`. Brand tokens are in `app/globals.css` (`@theme`). |
| ESLint | No ESLint config/dependency. `next build` may warn; optional to add `eslint-config-next`. |
| Version drift | `package.json` uses caret ranges (`next ^15.5`, `react ^19.1`, `zod ^3.25`, `tailwindcss ^4.1`). If newer majors install, pin to these. Zod v3 API is used (`z.record(z.unknown())`, `.superRefine`); don't upgrade to Zod 4 without checking. |
| Rate limiting is in-memory per serverless instance | Acceptable for launch; swap `lib/security/ratelimit.ts` for Upstash Redis later if abused. |

---

## Part 6 – Steps to go live (in order)

Legend: **🤖 Claude Code** can do it in the repo/terminal · **👤 Johnny** needs his accounts, billing, DNS or a decision.

### Step 1 – Get the code building · 🤖 (+👤 for Node)
1. Unzip into a folder and `git init` (add `.gitignore` as provided). Commit as "Phase 1 initial".
2. Node 20.11+ (22 LTS recommended): `node -v`.
3. `npm install`
4. `cp .env.example .env.local` and set:
   - `SESSION_SECRET` = output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` (local only; 12+ chars with upper, lower and a number)
   - leave `DATA_BACKEND=local`
5. `npm test` → expect **88 passing**.
6. `npm run typecheck` → fix any errors that appear with the real `@types/react` / `next` types.
7. `npm run build` → **must succeed.** Fix issues (see Part 5). Re-run `npm test` after any fix.
8. `npm run dev` → smoke test http://localhost:3000 (all 10 pages, the chat, one of each form) and http://localhost:3000/admin (log in with the bootstrap credentials; check every section).
9. Commit.

**Done when:** tests pass, build succeeds, and the local smoke test is clean.

### Step 2 – GitHub · 👤 + 🤖
1. 👤 Create a **private** GitHub repo (e.g. `asparc-platform`).
2. 🤖 `git remote add origin …` and `git push -u origin main`. Never commit `.env*`.

### Step 3 – Supabase (database + staff logins) · 👤 + 🤖
1. 👤 Create a Supabase project, region **Sydney (ap-southeast-2)**. Save the DB password.
2. 👤 Project Settings → API: copy the **Project URL**, **anon key** and **service_role key**, and give them to Claude Code locally (not in chat logs, if avoidable).
3. 🤖 Apply migrations in order, with either:
   - the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - pasting `supabase/migrations/20261109000001_init.sql` then `…000002_rls.sql` into the SQL Editor.
4. 👤 Authentication → Providers → Email: enabled. **Turn OFF "Allow new users to sign up".**
5. 🤖 In `.env.local` set `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then run:
   `npm run admin:create -- --email <johnny's email> --name "John Kobiela" --role owner` (👤 types the password at the prompt).
6. 🤖 `npm run dev` → log in to `/admin` with that account. Visit `/` once so services and the KB seed. Submit a test enquiry and confirm it appears in Supabase (`leads`, `customers`).

**Done when:** owner login works against Supabase and a test lead is stored.

**Plan note:** Free tier pauses after 7 idle days and has no backups. The daily cron keeps it active. Upgrade to **Pro (~US$25/mo)** once real client data exists.

### Step 4 – Vercel (hosting) · 👤 + 🤖
1. 👤 Vercel account on the **Pro plan** (Hobby is non-commercial only, ~US$20/mo). Import the GitHub repo; framework is Next.js.
2. 👤/🤖 Settings → Environment Variables (Production + Preview). **Set these BEFORE the first deploy:**
   - `NEXT_PUBLIC_SITE_URL=https://www.asparc.com.au`
   - `DATA_BACKEND=supabase`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`: a **new** random value, not the local one
   - `CRON_SECRET`: random string
   - Do **not** set `ADMIN_BOOTSTRAP_*` in production.
3. Deploy. 🤖 If the build fails, read the Vercel build log, fix and push.
4. 🤖 On the `*.vercel.app` URL: all pages, chat, each form, `/admin` login, Integrations page (Supabase "Connected").

**Done when:** the deployment is green and the smoke test passes on the Vercel URL.

### Step 5 – Domain · 👤
1. Vercel → Settings → Domains: add `www.asparc.com.au` (primary) and `asparc.com.au` (redirect to www).
2. Add the DNS records Vercel shows at the domain registrar. Wait for HTTPS to be issued.

### Step 6 – OpenAI (conversational AI; optional, recommended) · 👤 + 🤖
1. 👤 platform.openai.com: new project → API key → add billing credit → **set a monthly spend limit**.
2. 👤/🤖 Vercel env: `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini` (or another chat-completions model with tool calling). Redeploy.
3. 🤖 `/admin/integrations` → OpenAI → **Test connection**. Then run the AI acceptance tests in `docs/TESTING.md` (disclosure, Academy pricing with draft label, medical redirect, 000, complaint escalation, "book me Tuesday" never confirmed, test card number redacted). Check Conversations shows *AI mode: OpenAI*.

Without a key, guided mode stays active and is fully functional.

### Step 7 – Resend (email notifications; optional) · 👤 + 🤖
1. 👤 resend.com → Domains → add `asparc.com.au` → add the SPF/DKIM DNS records → wait for *Verified*.
2. 👤 Create an API key with sending access.
3. Vercel env:
   - `RESEND_API_KEY`
   - `RESEND_FROM="ASPARC <notifications@asparc.com.au>"`
   - `NOTIFY_EMAIL_TO=<comma-separated management emails>`
   - optionally `SEND_CUSTOMER_ACKNOWLEDGEMENTS=true`
   
   Redeploy.
4. 🤖 `/admin/integrations` → Resend → **Test connection** (emails the signed-in user). Choose which notification types are emailed in *AI Knowledge Base → Settings*.

### Step 8 – HubSpot CRM (optional) · 👤 + 🤖
1. 👤 HubSpot → Settings → Integrations → **Private Apps** → create "ASPARC Platform" with these scopes, then copy the token:
   - `crm.objects.contacts.read/write`
   - `crm.objects.deals.read/write`
   - `crm.schemas.contacts.read/write`
2. 🤖 With `HUBSPOT_ACCESS_TOKEN` in `.env.local`: `npm run hubspot:setup` (creates 6 properties in an "ASPARC" group; idempotent). Check the account doesn't already use more than 4 of the 10 free custom properties.
3. Optional deal pipeline: 👤 create stages New Enquiry, Contacted, Qualified, Booking Requested, Converted (won), Not Proceeding (lost). 🤖 Put `HUBSPOT_PIPELINE_ID` and `HUBSPOT_STAGE_*` IDs into Vercel env.
4. Vercel env `HUBSPOT_ACCESS_TOKEN` (+ optional `HUBSPOT_PORTAL_ID`) → redeploy → **Test connection** → submit a test enquiry → confirm the contact, note and (if configured) deal in HubSpot. Change its stage in `/admin` and confirm HubSpot updates.

### Step 9 – Scheduled daily summary · 🤖
1. With `CRON_SECRET` set, Vercel Cron calls `/api/cron/daily-summary` daily (`vercel.json`). Check Vercel → Settings → Cron Jobs lists it.
2. Test now: `/admin/reports` → **Run summary for this day**. Next morning, confirm the automatic summary arrived (dashboard + email if Resend is configured).

### Step 10 – Content & approvals · 👤 (🤖 can make the edits once Johnny decides)
All of these are edited in `/admin` (no code), except the legal flag and photos:
- [ ] **Knowledge Base → Contact details:** email, phone, Instagram/Facebook/LinkedIn → set *Approved* (hidden until then).
- [ ] **Knowledge Base → Location:** venue address → *Approved*.
- [ ] **Knowledge Base → Opening hours** → *Approved*.
- [ ] **Knowledge Base → Cancellation & refund policy** → write + *Approved*.
- [ ] **Pricing & Services:** approve or keep draft Academy $380 and massage $60/$80/$100. Set Academy and massage availability once dates and contractors are confirmed. Set only the testing assessments ASPARC can actually deliver to *Available*.
- [ ] **Legal:** have a lawyer review `/privacy-policy` and `/terms-and-conditions` (text in `components/site/views/StaticPages.tsx`). Then 🤖 set `LEGAL_STATUS.reviewed = true` in `lib/legal.ts`.
- [ ] **Photography:** add files named per `public/images/README.md` (hero, sports-performance, academy, rehabilitation, recovery, performance-testing, founder, about). Licensed or owned only; written consent for identifiable people; parent/guardian consent for minors.
- [ ] **Optional brand assets:** SVG logo master, reversed (white) logo → `logo.srcOnDark` in `lib/brand.ts`, and a square icon mark → `app/icon.png`.
- [ ] **Team:** Settings → Add team member, with the lowest role needed.

### Step 11 – Final acceptance & launch · 🤖 + 👤
1. 🤖 Run the full manual checklist in `docs/TESTING.md` on the live domain (mobile + desktop).
2. 🤖 Integrations page shows the expected states; every test button passes.
3. 👤 Sign off, then share the URL (socials, Google Business Profile, club networks).
4. 🤖 Tag release `v1.0.0`.

---

## Part 7 – Accounts & indicative monthly costs (Nov 2026; confirm on provider sites)

| Service | Plan | Cost |
|---|---|---|
| Vercel | **Pro required** (Hobby = non-commercial only) | ~US$20 |
| Supabase | Free to start → **Pro recommended** once live | US$0 → ~US$25 |
| OpenAI | Usage; `gpt-4o-mini` $0.15 / $0.60 per 1M input/output tokens | ~a dollar or two per 1,000 chat messages |
| HubSpot | Free CRM (2 users, 1 pipeline, 10 custom properties) | US$0 |
| Resend | Free (3,000 emails/mo, 100/day, 1 domain) | US$0 |

Full variable list and permissions: `docs/CREDENTIALS.md` and `.env.example`.

---

## Part 8 – After launch (later phases)

- **Phase 2 – WhatsApp:**
  - Code is prepared and disabled.
  - Needs: Meta Business verification; a number not already on WhatsApp; a Meta app with a permanent System User token (`whatsapp_business_messaging`, `whatsapp_business_management`); display-name approval; billing.
  - Since 1 Oct 2026, service replies are billable after 1,000 free per month per number.
  - Remaining dev: interactive buttons, STOP opt-out, approved templates, AI → human hand-over. See `docs/PHASE-2-WHATSAPP.md`.
- **Phase 3 – Instagram & Messenger:** Meta app review (`pages_messaging`, `instagram_manage_messages`), a `messenger` adapter beside `lib/channels/whatsapp.ts`, same receptionist core.
- **Phase 4 – Bookings & payments:** Cliniko (or similar) for live availability and confirmation; Stripe Payment Links / Checkout + webhook writing to the `payments` table. The Revenue page then shows real figures. Keep: never take card details in chat.

---

## Part 9 – File map

```
app/(site)/…              10 public pages (+ layout with header/footer/chat)
app/admin/…               dashboard pages (login, overview, [section])
app/api/chat|enquiries|auth|admin|cron|webhooks
components/site/          Header, Footer, Logo, EnquiryForm, ui, views/*
components/chat/          ChatWidget
components/admin/         AdminApp, ui, charts, api, sections-config, sections/*
lib/ai/                   receptionist, guardrails, prompt, tools, guided, context, openai, types
lib/kb/                   defaults (seed content), service
lib/leads/                service (submitEnquiry, changeLeadStage), qualify
lib/integrations/         hubspot, resend, log
lib/notifications/ lib/reports/ lib/auth/ lib/db/ lib/channels/ lib/time/ lib/security/ lib/http/ lib/config/env.ts
lib/brand.ts  lib/legal.ts
middleware.ts  next.config.mjs  vercel.json  postcss.config.mjs  tsconfig.json
supabase/migrations/      init + RLS
scripts/                  create-admin, hubspot-setup, run-daily-summary, test-migrations.sh
tests/                    *.test.ts + sql/ (shim + RLS assertions)
public/brand/             asparc-logo.jpg (official – do not alter)
public/images/            photo slots (README with shot list)
docs/                     DEPLOYMENT, CREDENTIALS, TESTING, ARCHITECTURE, PHASE-2-WHATSAPP
```

---

## Part 10 – Suggested first message to Claude Code

> I'm Johnny, founder of ASPARC. This repo is my Phase 1 website + AI receptionist + admin dashboard. Read `HANDOFF.md`, then `README.md` and `docs/`. Start with Part 6 → Step 1: install, run the tests, run `next build`, and fix anything that fails without breaking the rules in Part 3. Show me what you changed. Then guide me through Steps 2–5 to get it live on Vercel with Supabase, pausing whenever you need my accounts or a decision.
