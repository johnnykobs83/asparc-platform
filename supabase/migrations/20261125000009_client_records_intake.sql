-- =====================================================================
-- ASPARC platform – client records and the pre-visit health form
--
-- customers (extra columns) : date of birth, address, emergency contact,
--                             sport and club. Contact details only –
--                             health information is NEVER kept here.
-- client_notes              : notes about a client (may include health
--                             detail, so access is restricted).
-- intake_forms              : the pre-visit form – personal details,
--                             pre-exercise screening, injuries, consents.
--                             HEALTH INFORMATION: owners and managers in
--                             the database; the server also lets the
--                             practitioner on a client's booking see it.
-- practitioners.staff_member_id : links a bookable practitioner to the
--                             person in the staff planner (and so to
--                             their dashboard login) for that access rule.
--
-- Health records: Victoria's Health Records Act expects records to be
-- kept for 7 years after the last visit (adults) or until age 25 (minors).
-- Safe to run more than once.
-- =====================================================================

alter table public.customers add column if not exists date_of_birth date;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists emergency_contact_name text;
alter table public.customers add column if not exists emergency_contact_phone text;
alter table public.customers add column if not exists sport text;
alter table public.customers add column if not exists club text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_profile_lengths') then
    alter table public.customers add constraint customers_profile_lengths check (
      (address is null or char_length(address) <= 300)
      and (emergency_contact_name is null or char_length(emergency_contact_name) <= 120)
      and (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 32)
      and (sport is null or char_length(sport) <= 80)
      and (club is null or char_length(club) <= 120)
      and (date_of_birth is null or date_of_birth >= date '1900-01-01')
    );
  end if;
end $$;

alter table public.practitioners add column if not exists staff_member_id uuid references public.staff_members (id) on delete set null;
create unique index if not exists practitioners_staff_member_key on public.practitioners (staff_member_id) where staff_member_id is not null;

create table if not exists public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  author_id   uuid,
  author_name text check (author_name is null or char_length(author_name) <= 160),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists client_notes_customer_idx on public.client_notes (customer_id, created_at desc);

create table if not exists public.intake_forms (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  status            text not null default 'sent' check (status in ('sent', 'submitted', 'cancelled')),
  sent_at           timestamptz not null default now(),
  sent_by           text check (sent_by is null or char_length(sent_by) <= 200),
  sent_to           text check (sent_to is null or char_length(sent_to) <= 254),
  reason            text not null default 'manual' check (reason in ('first_booking', 'yearly_recheck', 'manual')),
  expires_at        timestamptz not null,
  submitted_at      timestamptz,
  for_whom          text check (for_whom is null or for_whom in ('self', 'child')),
  athlete_name      text check (athlete_name is null or char_length(athlete_name) <= 160),
  athlete_dob       date,
  details           jsonb not null default '{}'::jsonb,
  screening         jsonb not null default '{}'::jsonb,
  health            jsonb not null default '{}'::jsonb,
  screening_flags   integer not null default 0 check (screening_flags >= 0),
  review_status     text not null default 'not_needed' check (review_status in ('not_needed', 'needs_review', 'cleared', 'not_cleared')),
  reviewed_by       text check (reviewed_by is null or char_length(reviewed_by) <= 200),
  reviewed_at       timestamptz,
  review_note       text check (review_note is null or char_length(review_note) <= 2000),
  consent_health    boolean not null default false,
  consent_risk      boolean not null default false,
  consent_marketing boolean not null default false,
  signature_name    text check (signature_name is null or char_length(signature_name) <= 160),
  valid_until       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint intake_forms_submitted check (
    status <> 'submitted'
    or (submitted_at is not null and consent_health and consent_risk and signature_name is not null and valid_until is not null)
  )
);
create index if not exists intake_forms_customer_idx on public.intake_forms (customer_id, created_at desc);
create index if not exists intake_forms_review_idx on public.intake_forms (review_status) where review_status = 'needs_review';

drop trigger if exists intake_forms_set_updated_at on public.intake_forms;
create trigger intake_forms_set_updated_at before update on public.intake_forms for each row execute function public.set_updated_at();

-- Health detail: owners and managers only at the database level. The server
-- (service role) adds the practitioner-on-their-booking rule; other staff see
-- just a "form status" flag that the server works out for them.
do $$
declare t text;
begin
  foreach t in array array['client_notes', 'intake_forms']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_manager()) with check (public.is_manager())',
                   t || '_manager_all', t);
  end loop;
end $$;

-- Make the new columns and tables visible to the API straight away.
notify pgrst, 'reload schema';
