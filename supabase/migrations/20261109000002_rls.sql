-- =====================================================================
-- ASPARC platform – Row Level Security
--
-- * The public website never talks to the database directly; all public
--   writes go through validated server routes using the service role
--   (which bypasses RLS). Therefore the `anon` role gets NO policies –
--   anonymous access to every table is denied.
-- * Authenticated users only gain access if they have an active row in
--   admin_users. Roles:
--     owner   – everything, including admin user management
--     manager – read everything, write operational + content tables
--     staff   – read everything, write operational tables (leads, bookings …)
-- =====================================================================

create or replace function public.admin_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_users where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_role() is not null
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.admin_role() in ('owner', 'manager'), false)
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.admin_role() = 'owner', false)
$$;

revoke all on function public.admin_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.admin_role(), public.is_admin(), public.is_manager(), public.is_owner() to authenticated;

-- Enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array['admin_users', 'customers', 'conversations', 'messages', 'leads', 'lead_events',
                           'services', 'knowledge_base', 'booking_requests', 'academy_registrations',
                           'payments', 'notifications', 'integration_logs', 'daily_summaries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Read access for every active admin
do $$
declare t text;
begin
  foreach t in array array['customers', 'conversations', 'messages', 'leads', 'lead_events',
                           'services', 'knowledge_base', 'booking_requests', 'academy_registrations',
                           'payments', 'notifications', 'integration_logs', 'daily_summaries']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())',
                   t || '_admin_read', t);
  end loop;
end $$;

-- Operational writes: any active admin (staff and above)
do $$
declare t text;
begin
  foreach t in array array['customers', 'conversations', 'leads', 'lead_events', 'booking_requests',
                           'academy_registrations', 'notifications']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
                   t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin_update', t);
  end loop;
end $$;

-- Content & configuration writes: managers and owners
do $$
declare t text;
begin
  foreach t in array array['services', 'knowledge_base']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_manager())',
                   t || '_manager_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_manager()) with check (public.is_manager())',
                   t || '_manager_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_manager())',
                   t || '_manager_delete', t);
  end loop;
end $$;

-- Deleting customer data (privacy requests) – owners only
create policy customers_owner_delete on public.customers for delete to authenticated using (public.is_owner());
create policy leads_owner_delete on public.leads for delete to authenticated using (public.is_owner());
create policy conversations_owner_delete on public.conversations for delete to authenticated using (public.is_owner());

-- Admin users: everyone sees their own row; owners manage all
create policy admin_users_self_read on public.admin_users for select to authenticated
  using (id = auth.uid() or public.is_owner());
create policy admin_users_owner_insert on public.admin_users for insert to authenticated with check (public.is_owner());
create policy admin_users_owner_update on public.admin_users for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy admin_users_owner_delete on public.admin_users for delete to authenticated using (public.is_owner());

-- messages, payments, integration_logs, daily_summaries are written only by
-- the server (service role) – no authenticated write policies on purpose.
