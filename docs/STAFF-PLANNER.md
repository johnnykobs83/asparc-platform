# Staff Planner, My Week and Clients & Billing

Added 25 Nov 2026 on branch `feature/staff-planner`.

## What's in it

| Dashboard section | Who sees it | What it does |
|---|---|---|
| **Staff Planner** | Everyone; owners and managers can edit | A week of job cards per person (or per place) and a calendar view. Drag to move, click to edit, arrange cover. Flags double bookings, leave and too little travel time between venues. **Publish & email staff** sends each person their week – to everyone, one person or a few you tick; after that, **Send updates** emails the people who still need it, and **Send schedule** resends to anyone you pick. Copy last week as a starting point. The **Staff & places** tab manages people, venues and leave. |
| **My Week** | Everyone | The signed-in person's week as a **weekly calendar** (Mon–Sun time grid; day-by-day on phones) or a list, with map links, a **Got it** button and their personal calendar link. Owners and managers can look at anyone's week. **Share this week** sends a read-only link (`/schedule/<token>`) by the phone's share sheet, WhatsApp, text or email, or copies the week as text. The link shows published weeks only – times, jobs and venues, never access codes, notes, colleagues or clients – and "Make a new calendar link" cuts off every shared link. |
| **Clients & Billing** | **Owner only** | Each club or client's agreement, invoices, what's paid, outstanding and overdue (aged), and the sessions delivered from the planner. Managers and staff don't see it in the menu, the API answers 404, and the database gives them no rows. |

## Reminders

- **Publish** emails each person their week (Resend), with a "Got it – confirm my week" link and their calendar link.
- **Send updates** emails only the people affected by changes since publishing, including anyone taken off a job or covered.
- **Send to one person or several:** the send panel has a tick box per person (Everyone / Only those not up to date / None). Publishing can go to just some people first; the rest show as "not sent" until you send to them. After publishing, **Send schedule** resends the full week to whoever you tick; anyone with unsent changes gets the "what changed" email instead.
- **Evening before:** `/api/cron/staff-reminders` runs hourly (vercel.json) and sends tomorrow's jobs at `PLANNER_REMINDER_HOUR` Melbourne time (default 18 = 6 pm), once per person per day, for published weeks only.
- **Calendar feed:** `/api/calendar/staff/<token>.ics` – each person subscribes once in Google/Apple/Outlook calendar. Only published weeks appear. "Make a new calendar link" in Staff & places cuts off the old one.
- People without an email address (e.g. some contractors) are listed when you send, so you can tell them yourself.

## Going live

1. Supabase › SQL Editor: run `supabase/migrations/20261125000007_staff_planner_billing.sql` (safe to run twice).
2. Optional Vercel env vars: `PLANNER_REMINDER_HOUR` (0–23, default 18), `PLANNER_TRAVEL_BUFFER_MINUTES` (default 30, 0 turns the travel check off). `CRON_SECRET` and Resend are already set.
3. Stripe › Webhooks › your endpoint: also send `invoice.finalized` and `invoice.voided` (besides `invoice.paid`, `invoice.payment_failed`, `invoice.updated`). Then put each club's Stripe customer ID (`cus_…`) on its client record; its Stripe invoices appear and mark themselves paid.
4. In the dashboard: Staff Planner › Staff & places – add staff (with email), places (with address and access notes), and link each employee's dashboard login so they get My Week.

## Privacy

- Leave keeps dates and a reason only (leave / unavailable / sick / other) – no medical detail.
- Job notes are shown to staff; the form reminds you not to put athlete medical details there.
- Staff see colleagues' names and roles, not their email or phone. Client names and money are hidden from staff; managers see client names (to tag jobs) but never amounts.
- Calendar links and confirm links are secrets: confirm links are signed and expire after 21 days, and opening one doesn't confirm anything until the button is pressed (so mail scanners can't).

## Tests

`tests/planner.test.ts` and `tests/finance.test.ts` (15 tests), plus RLS checks for the new tables in `tests/sql/rls-test.sql`.
