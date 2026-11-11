-- =====================================================================
-- ASPARC platform – online self-service bookings
--
-- practitioners : who can be booked, which services they deliver and
--                 their weekly working hours (Melbourne local time).
-- appointments  : confirmed bookings made by customers on the website.
--
-- Double-booking is impossible at the database level: an exclusion
-- constraint rejects any confirmed appointment that overlaps another
-- confirmed appointment for the same practitioner.
-- Safe to run more than once.
-- =====================================================================

create extension if not exists btree_gist;

create table if not exists public.practitioners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 120),
  title          text check (title is null or char_length(title) <= 120),
  -- array of services.id this practitioner can be booked for
  service_ids    jsonb not null default '[]'::jsonb,
  -- { "1": [{ "start": 360, "end": 1200 }], ... }  keys 0–6 (0 = Sunday),
  -- values are minutes from midnight, Melbourne local time
  weekly_hours   jsonb not null default '{}'::jsonb,
  -- gap kept free after each appointment
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete restrict,
  service_id      uuid references public.services (id) on delete set null,
  service_name    text not null,
  customer_id     uuid not null references public.customers (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- ends_at plus the practitioner's buffer; this is the range that must not overlap
  blocked_until   timestamptz not null,
  status          text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  notes           text check (notes is null or char_length(notes) <= 2000),
  cancel_reason   text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  source          text not null default 'website',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint appointments_time_order check (ends_at > starts_at and blocked_until >= ends_at),
  constraint appointments_no_overlap exclude using gist (
    practitioner_id with =,
    tstzrange(starts_at, blocked_until) with &&
  ) where (status = 'confirmed')
);

create index if not exists appointments_practitioner_idx on public.appointments (practitioner_id, starts_at);
create index if not exists appointments_starts_idx on public.appointments (starts_at);
create index if not exists appointments_customer_idx on public.appointments (customer_id);

do $$
declare t text;
begin
  foreach t in array array['practitioners', 'appointments']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())',
                   t || '_admin_read', t);
  end loop;
end $$;

-- Appointments are operational: any active admin may create and update them.
drop policy if exists appointments_admin_insert on public.appointments;
drop policy if exists appointments_admin_update on public.appointments;
create policy appointments_admin_insert on public.appointments for insert to authenticated with check (public.is_admin());
create policy appointments_admin_update on public.appointments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Practitioners and their hours are configuration: managers and owners only.
drop policy if exists practitioners_manager_insert on public.practitioners;
drop policy if exists practitioners_manager_update on public.practitioners;
create policy practitioners_manager_insert on public.practitioners for insert to authenticated with check (public.is_manager());
create policy practitioners_manager_update on public.practitioners for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Make the new tables visible to the API straight away.
notify pgrst, 'reload schema';
