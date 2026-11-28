-- =====================================================================
-- ASPARC platform – Members area (Training & Health resources)
--
-- members : one row per person who can sign in to /members – a player,
--           a coach, or a parent/guardian signing in for an under-18 player.
--           Staff add them in the dashboard; the person sets their own
--           password from an emailed one-time link. Staff never see or
--           handle passwords. Members can never reach /admin.
--
-- Passwords are scrypt hashes made by the app (lib/auth/password.ts) and
-- stored here, separate from the staff accounts in Supabase Auth.
-- invite_nonce is the id of the one link currently allowed to set the
-- password; it is cleared as soon as that link is used.
--
-- Every dashboard user can read members; the app restricts changes to
-- owners and managers (lib/auth/rbac.ts → members:manage); only the owner
-- can delete. Safe to run more than once.
-- =====================================================================

create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  email             text not null check (char_length(email) between 3 and 254),
  full_name         text not null check (char_length(full_name) between 2 and 120),
  club              text check (club is null or char_length(club) <= 120),
  team              text check (team is null or char_length(team) <= 120),
  is_guardian       boolean not null default false,
  athlete_name      text check (athlete_name is null or char_length(athlete_name) <= 160),
  access_hub        boolean not null default true,
  access_warmup     boolean not null default true,
  access_downloads  boolean not null default true,
  active            boolean not null default true,
  password_hash     text,
  password_set_at   timestamptz,
  invite_nonce      text check (invite_nonce is null or char_length(invite_nonce) <= 64),
  invite_expires_at timestamptz,
  invited_at        timestamptz,
  invited_by        text check (invited_by is null or char_length(invited_by) <= 254),
  last_login_at     timestamptz,
  login_count       integer not null default 0 check (login_count >= 0),
  notes             text check (notes is null or char_length(notes) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint members_guardian check (not is_guardian or athlete_name is not null)
);
create unique index if not exists members_email_key on public.members (lower(email));
create index if not exists members_active_idx on public.members (active, created_at desc);

do $$
declare t text := 'members';
begin
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
end $$;

notify pgrst, 'reload schema';
