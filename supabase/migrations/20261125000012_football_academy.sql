-- =====================================================================
-- ASPARC platform – Football Performance Academy timetable and enrolments
--
-- academy_sessions   : the weekly timetable – one row per group session
--                      (weekday, start/end in Melbourne minutes, places).
-- academy_enrolments : a parent's enrolment of an athlete in a group, with a
--                      package (1x or 2x a week per term, annual or casual)
--                      and the weekly session(s) chosen. Places are counted
--                      from enrolments that aren't cancelled or waitlisted.
-- Every dashboard user can read and update these (they work the Academy);
-- only the owner can delete. Safe to run more than once.
-- =====================================================================

create table if not exists public.academy_sessions (
  id            uuid primary key default gen_random_uuid(),
  group_key     text not null check (group_key in ('foundation', 'athletic', 'performance')),
  weekday       integer not null check (weekday between 1 and 7),
  start_minutes integer not null check (start_minutes between 0 and 1439),
  end_minutes   integer not null check (end_minutes between 1 and 1440),
  capacity      integer not null default 12 check (capacity between 1 and 100),
  location      text not null default 'Avenger Park' check (char_length(location) <= 120),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint academy_sessions_order check (end_minutes > start_minutes),
  constraint academy_sessions_unique unique (weekday, start_minutes, group_key)
);

create table if not exists public.academy_enrolments (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  athlete_name      text not null check (char_length(athlete_name) between 2 and 160),
  athlete_dob       date not null,
  group_key         text not null check (group_key in ('foundation', 'athletic', 'performance')),
  package           text not null check (package in ('term_1x', 'term_2x', 'annual', 'casual')),
  session_ids       uuid[] not null default '{}',
  casual_date       date,
  term_label        text not null default 'Term 1 2027' check (char_length(term_label) <= 60),
  status            text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'confirmed', 'waitlist', 'cancelled')),
  price_cents       integer check (price_cents is null or price_cents >= 0),
  paid_at           timestamptz,
  payment_ref       text check (payment_ref is null or char_length(payment_ref) <= 200),
  club              text check (club is null or char_length(club) <= 120),
  parent_note       text check (parent_note is null or char_length(parent_note) <= 1000),
  staff_note        text check (staff_note is null or char_length(staff_note) <= 1000),
  guardian_consent  boolean not null,
  consent_marketing boolean not null default false,
  source            text not null default 'website' check (char_length(source) <= 120),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint academy_enrolments_consent check (guardian_consent),
  constraint academy_enrolments_casual check ((package = 'casual') = (casual_date is not null))
);
create index if not exists academy_enrolments_customer_idx on public.academy_enrolments (customer_id);
create index if not exists academy_enrolments_status_idx on public.academy_enrolments (status, created_at desc);

-- The timetable from the owner (25 Nov 2026), 12 places each.
insert into public.academy_sessions (weekday, start_minutes, end_minutes, group_key) values
  (1, 990, 1040, 'foundation'),
  (2, 990, 1040, 'athletic'),
  (2, 1040, 1090, 'foundation'),
  (2, 1090, 1140, 'performance'),
  (3, 990, 1040, 'performance'),
  (3, 1040, 1090, 'athletic'),
  (3, 1090, 1140, 'foundation'),
  (4, 990, 1040, 'foundation'),
  (4, 1040, 1090, 'performance'),
  (4, 1090, 1140, 'athletic'),
  (5, 990, 1040, 'athletic'),
  (5, 1040, 1090, 'foundation'),
  (5, 1090, 1140, 'performance'),
  (6, 490, 540, 'foundation'),
  (6, 540, 590, 'athletic'),
  (6, 590, 640, 'performance')
on conflict (weekday, start_minutes, group_key) do nothing;

do $$
declare t text;
begin
  foreach t in array array['academy_sessions', 'academy_enrolments']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_rw', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_rw', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', t || '_owner_delete', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
