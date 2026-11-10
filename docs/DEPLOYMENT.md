# Deployment – going live with Phase 1

Plan for about 1–2 hours. The steps are in order. Anything marked **(you)** needs your own account or a decision.

> **Important:** this project was built in a sandbox where `npm install` and `next build` couldn't run (no package-registry access). Everything else was verified there: 88 automated tests, PostgreSQL migration and RLS tests, TypeScript checks, and browser end-to-end tests of the real components and API routes. **Run `npm install && npm run build` locally (step 1) before deploying**, and fix anything that build reports.

---

## 1. Local check (10 min)

```bash
node -v                      # 20.11+ (22 LTS recommended)
npm install
cp .env.example .env.local
# In .env.local set:
#   SESSION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
#   ADMIN_BOOTSTRAP_EMAIL=you@example.com
#   ADMIN_BOOTSTRAP_PASSWORD=<12+ chars, upper, lower, number>
npm test                     # expect 88 passing
npm run build                # must succeed before deploying
npm run dev                  # check http://localhost:3000 and /admin
```

## 2. Supabase – database & staff logins **(you)** (15 min)

1. Create a project at supabase.com. Pick the **Sydney (ap-southeast-2)** region to keep data in Australia.
2. **SQL Editor →** run each file in `supabase/migrations/` **in order**:
   `20261109000001_init.sql`, then `20261109000002_rls.sql`.
   (Or use the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.
4. **Authentication → Providers → Email**: keep it enabled. **Disable "Allow new users to sign up"**, so only accounts you create can sign in.
5. Create your Owner login. From your computer, with the Supabase values in `.env.local` and `DATA_BACKEND=supabase`:
   ```bash
   npm run admin:create -- --email john@asparc.com.au --name "John Kobiela" --role owner
   ```
   This creates the Supabase Auth user and the matching `admin_users` row. The password is prompted for, never typed on the command line.
6. Services and the knowledge base seed themselves on first use.

**Plan note:** Supabase Free pauses a project after 7 days without activity and has no backups. The daily summary cron touches the database every day, which normally keeps it active. Once you hold real client data, upgrade to **Pro** for daily backups and no pausing.

## 3. Vercel – hosting **(you)** (15 min)

1. Push this folder to a private GitHub repository.
2. At vercel.com, **Add New → Project →** import the repo. The framework is auto-detected as Next.js.
3. **Plan:** Vercel's free Hobby plan is for personal, non-commercial use only. A business site needs **Pro**.
4. **Settings → Environment Variables:** add every variable from `.env.example` that you're using (Production + Preview):

   | Required now | Add when ready |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL=https://www.asparc.com.au` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
   | `DATA_BACKEND=supabase` | `HUBSPOT_ACCESS_TOKEN` (+ pipeline/stage IDs) |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_EMAIL_TO` |
   | `SESSION_SECRET` (new random value – not your local one) | `SEND_CUSTOMER_ACKNOWLEDGEMENTS=true` |
   | `CRON_SECRET` (random string) | |

   Do **not** set `ADMIN_BOOTSTRAP_*` in production. Changing a variable needs a redeploy.
5. **Deploy.** The cron in `vercel.json` (`0 21 * * *` UTC = 8am AEDT / 7am AEST) calls `/api/cron/daily-summary` with your `CRON_SECRET` automatically.

## 4. Domain **(you)** (10 min + DNS propagation)

Vercel → Project → **Settings → Domains** → add `www.asparc.com.au` and `asparc.com.au` (redirect apex → www). At your domain registrar, add the DNS records Vercel shows.

## 5. OpenAI – conversational AI (optional, recommended) **(you)**

1. platform.openai.com → create a project → **API keys** → create a key restricted to that project.
2. **Billing →** add credit and set a **monthly usage limit** (for example US$20).
3. Set `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-4o-mini`; any chat-completions model with function calling works.
4. Dashboard → **Integrations → OpenAI → Test connection**.

The safety rules, price checks and AI disclosure apply in code whichever model you choose.

## 6. HubSpot CRM (optional) **(you)**

1. Use your HubSpot account (the free CRM is enough to start).
2. **Settings → Integrations → Private Apps → Create** "ASPARC Platform" with scopes:
   `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `crm.schemas.contacts.read`, `crm.schemas.contacts.write`.
3. Set `HUBSPOT_ACCESS_TOKEN` locally and run `npm run hubspot:setup`. This creates 6 custom contact properties in an "ASPARC" group. HubSpot Free allows only 10 custom properties in total, so the stage is also mapped to HubSpot's built-in *Lead Status*.
4. **Optional deal pipeline:** Settings → Objects → Deals → Pipelines. Create or rename stages to: New Enquiry, Contacted, Qualified, Booking Requested, Converted (Closed won), Not Proceeding (Closed lost). Copy the pipeline ID and each stage's internal ID into `HUBSPOT_PIPELINE_ID` and `HUBSPOT_STAGE_*`. Without these, contacts and notes still sync; deals are skipped.
5. Set the token in Vercel → redeploy → **Integrations → HubSpot → Test connection**. Then submit a test enquiry and check that the contact appears.

What syncs: the parent/adult contact, the ASPARC properties and an enquiry note. What never syncs: children's names, chat transcripts, medical information.

## 7. Resend – email notifications (optional) **(you)**

1. resend.com → **Domains → Add domain** `asparc.com.au` → add the DNS records (SPF/DKIM) at your registrar → wait for *Verified*.
2. **API Keys →** create a key with *Sending access* for that domain.
3. Set `RESEND_API_KEY`, `RESEND_FROM="ASPARC <notifications@asparc.com.au>"` and `NOTIFY_EMAIL_TO=you@…,manager@…`.
4. Dashboard → **Integrations → Resend → Test connection** (sends a test email to you).
5. Choose which notification types are emailed in **AI Knowledge Base → Settings → Notification settings**.

## 8. Brand assets **(you)**

- Logo: installed (see `public/brand/README.md`). Optional: add an SVG or reversed version.
- Favicon: generated from the logo (`app/icon.png`); replace it with a square icon mark if you have one.
- Photography: see `public/images/README.md` for the shot list and file names.

## 9. Go-live checklist

- [ ] `npm run build` succeeds; Vercel deployment is green
- [ ] Owner can sign in at `/admin`; public sign-ups disabled in Supabase
- [ ] **Knowledge Base:** contact details, hours, address entered and **approved**; cancellation policy written and approved
- [ ] **Pricing & Services:** Academy and massage prices approved or left as draft (draft shows "subject to confirmation"); only confirmed testing assessments set to *Available*
- [ ] Privacy Policy and Terms reviewed by a lawyer → `LEGAL_STATUS.reviewed = true` in `lib/legal.ts`
- [ ] At least the hero and founder photos added
- [ ] Test each form and the chat on mobile; check that leads, notifications and (if configured) HubSpot and email arrive
- [ ] Integrations page shows the expected states; test buttons pass
- [ ] Reports → *Run summary for this day* works; next morning check the scheduled summary arrived
- [ ] Add staff users (Settings → Add team member) with the lowest role they need

## Updating content later

Everything customer-facing is edited in `/admin` (Knowledge Base, Pricing & Services). The website refreshes within about 60 seconds and ASPARC AI uses the change immediately. Code changes are only needed for layout or new features.
