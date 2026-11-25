-- =====================================================================
-- ASPARC platform – staff planner and owner-only client billing
--
-- Staff planner (owners and managers plan; every admin can read):
--   staff_members       : people who are rostered (employees and contractors).
--                          Contractors need no dashboard login.
--   work_locations      : where work happens (ASPARC, club grounds, schools …)
--   planner_jobs        : a job card – what, where, when
--   planner_assignments : who is on a job; covering_for_staff_id marks a cover
--   planner_weeks       : when a week was published (sent to staff)
--   planner_changes     : changes made after publishing, not yet sent to staff
--   staff_leave         : days someone can't work (no medical detail kept)
--   staff_reminders     : reminder emails already sent (stops double sends)
--
-- Client billing (OWNER ONLY – managers and staff see no rows):
--   clients, client_agreements, client_invoices
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 160),
  kind               text not null default 'club' check (kind in ('club', 'school', 'association', 'corporate', 'individual', 'other')),
  abn                text check (abn is null or char_length(abn) <= 20),
  contact_name       text check (contact_name is null or char_length(contact_name) <= 120),
  billing_email      text check (billing_email is null or char_length(billing_email) <= 200),
  phone              text check (phone is null or char_length(phone) <= 40),
  stripe_customer_id text unique check (stripe_customer_id is null or stripe_customer_id like 'cus\_%'),
  status             text not null default 'active' check (status in ('prospect', 'active', 'paused', 'ended')),
  notes              text check (notes is null or char_length(notes) <= 4000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.client_agreements (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete cascade,
  title              text not null check (char_length(title) between 2 and 160),
  billing_model      text not null check (billing_model in ('monthly_retainer', 'per_session', 'per_athlete', 'term_fee', 'fixed_project')),
  rate_cents         integer not null check (rate_cents >= 0),
  agreed_value_cents integer check (agreed_value_cents is null or agreed_value_cents >= 0),
  start_date         date not null,
  end_date           date,
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 120),
  inclusions         text check (inclusions is null or char_length(inclusions) <= 2000),
  status             text not null default 'active' check (status in ('proposed', 'active', 'ended')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint client_agreements_dates check (end_date is null or end_date >= start_date)
);
create index if not exists client_agreements_client_idx on public.client_agreements (client_id);

create table if not exists public.client_invoices (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  agreement_id      uuid references public.client_agreements (id) on delete set null,
  number            text not null check (char_length(number) between 1 and 60),
  issued_on         date not null,
  due_on            date not null,
  amount_cents      integer not null check (amount_cents >= 0),
  gst_cents         integer not null default 0 check (gst_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  paid_on           date,
  method            text check (method is null or method in ('stripe', 'bank_transfer', 'cash', 'other')),
  status            text not null default 'open' check (status in ('open', 'paid', 'void')),
  stripe_invoice_id text unique check (stripe_invoice_id is null or stripe_invoice_id like 'in\_%'),
  hosted_invoice_url text check (hosted_invoice_url is null or hosted_invoice_url like 'https://%'),
  notes             text check (notes is null or char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint client_invoices_dates check (due_on >= issued_on)
);
create index if not exists client_invoices_client_idx on public.client_invoices (client_id, due_on);

create table if not exists public.staff_members (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (char_length(full_name) between 2 and 120),
  email           text check (email is null or char_length(email) <= 200),
  phone           text check (phone is null or char_length(phone) <= 40),
  role_title      text check (role_title is null or char_length(role_title) <= 120),
  employment_type text not null default 'employee' check (employment_type in ('employee', 'contractor')),
  -- the dashboard login this person uses, if any ("My week")
  admin_user_id   uuid unique references public.admin_users (id) on delete set null,
  -- secret for the personal calendar feed; rotating it cuts off the old link
  calendar_token  text not null unique check (char_length(calendar_token) >= 32),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.work_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 120),
  kind         text not null default 'other' check (kind in ('asparc', 'club', 'school', 'client_site', 'other')),
  address      text check (address is null or char_length(address) <= 300),
  access_notes text check (access_notes is null or char_length(access_notes) <= 1000),
  colour       text not null default '#14519C' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  client_id    uuid references public.clients (id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.planner_jobs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 160),
  job_type    text not null default 'other' check (job_type in ('club_session', 'testing', 'academy', 'one_to_one', 'massage_clinic', 'match_day', 'admin', 'other')),
  location_id uuid not null references public.work_locations (id) on delete restrict,
  client_id   uuid references public.clients (id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  notes       text check (notes is null or char_length(notes) <= 2000),
  status      text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint planner_jobs_time_order check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours')
);
create index if not exists planner_jobs_starts_idx on public.planner_jobs (starts_at);
create index if not exists planner_jobs_client_idx on public.planner_jobs (client_id, starts_at);

create table if not exists public.planner_assignments (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.planner_jobs (id) on delete cascade,
  staff_id              uuid not null references public.staff_members (id) on delete cascade,
  covering_for_staff_id uuid references public.staff_members (id) on delete set null,
  cover_reason          text check (cover_reason is null or char_length(cover_reason) <= 300),
  acknowledged_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint planner_assignments_unique unique (job_id, staff_id),
  constraint planner_assignments_not_self check (covering_for_staff_id is null or covering_for_staff_id <> staff_id)
);
create index if not exists planner_assignments_staff_idx on public.planner_assignments (staff_id);

create table if not exists public.planner_weeks (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null unique check (extract(isodow from week_start) = 1),
  published_at timestamptz,
  published_by uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.planner_changes (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  staff_id    uuid not null references public.staff_members (id) on delete cascade,
  job_id      uuid references public.planner_jobs (id) on delete set null,
  summary     text not null check (char_length(summary) <= 400),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists planner_changes_week_idx on public.planner_changes (week_start, notified_at);

create table if not exists public.staff_leave (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff_members (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  reason     text not null default 'leave' check (reason in ('leave', 'unavailable', 'sick', 'other')),
  created_at timestamptz not null default now(),
  constraint staff_leave_dates check (end_date >= start_date and end_date - start_date <= 366)
);
create index if not exists staff_leave_staff_idx on public.staff_leave (staff_id, start_date);

create table if not exists public.staff_reminders (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff_members (id) on delete cascade,
  kind       text not null check (kind in ('week', 'update', 'day_before')),
  ref        text not null check (char_length(ref) <= 60),
  status     text not null check (status in ('sent', 'not_configured', 'no_email', 'failed')),
  created_at timestamptz not null default now()
);
create unique index if not exists staff_reminders_day_before_once on public.staff_reminders (staff_id, ref) where kind = 'day_before' and status = 'sent';

-- updated_at triggers + RLS on every new table
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_agreements', 'client_invoices', 'staff_members', 'work_locations',
                           'planner_jobs', 'planner_assignments', 'planner_weeks']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
  foreach t in array array['clients', 'client_agreements', 'client_invoices', 'staff_members', 'work_locations',
                           'planner_jobs', 'planner_assignments', 'planner_weeks', 'planner_changes',
                           'staff_leave', 'staff_reminders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Planner: every active admin can read; owners and managers plan.
do $$
declare t text;
begin
  foreach t in array array['staff_members', 'work_locations', 'planner_jobs', 'planner_assignments',
                           'planner_weeks', 'planner_changes', 'staff_leave']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_manager()) with check (public.is_manager())',
                   t || '_manager_write', t);
  end loop;
end $$;
-- staff_reminders is written only by the server (service role); managers can read the log.
drop policy if exists staff_reminders_manager_read on public.staff_reminders;
create policy staff_reminders_manager_read on public.staff_reminders for select to authenticated using (public.is_manager());

-- Client billing: the OWNER only. Managers and staff get no rows at all.
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_agreements', 'client_invoices']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
                   t || '_owner_all', t);
  end loop;
end $$;

-- Make the new tables visible to the API straight away.
notify pgrst, 'reload schema';
