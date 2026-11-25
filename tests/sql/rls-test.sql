\set ON_ERROR_STOP on
-- seed as superuser
insert into auth.users values ('00000000-0000-0000-0000-000000000001','owner@test'),('00000000-0000-0000-0000-000000000002','staff@test'),('00000000-0000-0000-0000-000000000003','outsider@test');
insert into admin_users (id,email,role) values ('00000000-0000-0000-0000-000000000001','owner@test','owner'),('00000000-0000-0000-0000-000000000002','staff@test','staff');
insert into customers (full_name,email,consent_contact,source) values ('Test Parent','parent@test.dev',true,'academy_form');
insert into services (slug,name,category,price_cents,price_status) values ('academy','Academy','academy',38000,'draft');
-- constraint: price_status draft requires price
do $$ begin
  begin insert into services (slug,name,category,price_status) values ('bad','Bad','testing','approved'); raise exception 'price constraint failed';
  exception when check_violation then raise notice 'OK price consistency enforced'; end;
  begin insert into academy_registrations (guardian_customer_id,athlete_first_name,athlete_age_group,guardian_consent) select id,'Kid','8-10',false from customers limit 1; raise exception 'consent constraint failed';
  exception when check_violation then raise notice 'OK guardian consent enforced'; end;
  begin insert into customers (full_name,source) values ('No contact','other'); raise exception 'contactable failed';
  exception when check_violation then raise notice 'OK contactable enforced'; end;
end $$;

-- anon: denied
set role anon;
do $$ begin
  begin perform * from customers; raise exception 'anon could read customers';
  exception when insufficient_privilege then raise notice 'OK anon denied'; end;
end $$;
reset role;

-- outsider authenticated (not admin): sees nothing
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select case when count(*)=0 then 'OK outsider sees 0 customers' else 'FAIL' end from customers;
-- staff: can read customers, cannot edit services, cannot see other admins
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select case when count(*)=1 then 'OK staff reads customers' else 'FAIL' end from customers;
update services set price_cents=1 where slug='academy';
select case when price_cents=38000 then 'OK staff cannot update services (0 rows)' else 'FAIL' end from services where slug='academy';
select case when count(*)=1 then 'OK staff sees only own admin row' else 'FAIL' end from admin_users;
-- owner: can update services & see all admins
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update services set price_cents=39000 where slug='academy';
select case when price_cents=39000 then 'OK owner updates services' else 'FAIL' end from services where slug='academy';
select case when count(*)=2 then 'OK owner sees all admins' else 'FAIL' end from admin_users;
reset role;
-- service role bypasses
set role service_role;
select case when count(*)>=1 then 'OK service role bypasses RLS' else 'FAIL' end from customers;
reset role;
-- updated_at trigger
select case when updated_at >= created_at then 'OK updated_at trigger' else 'FAIL' end from services where slug='academy';

-- Staff planner + client billing (migration 000007)
insert into clients (name) values ('Test Club');
insert into staff_members (full_name, calendar_token) values ('Test Coach', repeat('a', 40));
insert into work_locations (name) values ('Test Ground');
set role authenticated;
-- staff: read the planner, but no client billing at all and no planning
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select case when count(*)=1 then 'OK staff reads the planner (staff_members)' else 'FAIL' end from staff_members;
select case when count(*)=0 then 'OK staff sees 0 clients (owner only)' else 'FAIL' end from clients;
do $$ begin
  begin insert into planner_jobs (title, location_id, starts_at, ends_at) select 'Sneaky', id, now(), now() + interval '1 hour' from work_locations limit 1;
    raise exception 'FAIL staff could add a job';
  exception when insufficient_privilege then raise notice 'OK staff cannot add planner jobs'; end;
  begin insert into clients (name) values ('Sneaky Club'); raise exception 'FAIL staff could add a client';
  exception when insufficient_privilege then raise notice 'OK staff cannot add clients'; end;
end $$;
-- owner: sees and manages clients
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select case when count(*)=1 then 'OK owner sees clients' else 'FAIL' end from clients;
insert into planner_jobs (title, location_id, starts_at, ends_at) select 'Owner job', id, now(), now() + interval '1 hour' from work_locations limit 1;
select case when count(*)=1 then 'OK owner adds planner jobs' else 'FAIL' end from planner_jobs;
reset role;
do $$ begin
  begin insert into planner_jobs (title, location_id, starts_at, ends_at) select 'Backwards', id, now(), now() - interval '1 hour' from work_locations limit 1;
    raise exception 'FAIL job time order';
  exception when check_violation then raise notice 'OK job must end after it starts'; end;
  begin insert into planner_weeks (week_start) values ('2026-12-01'); raise exception 'FAIL week must start on Monday';
  exception when check_violation then raise notice 'OK planner weeks start on a Monday'; end;
end $$;

-- Client records + pre-visit health forms (migration 000009)
insert into intake_forms (customer_id, expires_at) select id, now() + interval '30 days' from customers limit 1;
insert into client_notes (customer_id, body) select id, 'Test note' from customers limit 1;
do $$ begin
  begin update intake_forms set status = 'submitted'; raise exception 'FAIL submitted form without consent';
  exception when check_violation then raise notice 'OK a submitted form needs consents and a signature'; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select case when count(*)=0 then 'OK staff see 0 health forms directly' else 'FAIL' end from intake_forms;
select case when count(*)=0 then 'OK staff see 0 client notes directly' else 'FAIL' end from client_notes;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select case when count(*)=1 then 'OK owner sees health forms' else 'FAIL' end from intake_forms;
reset role;
set role anon;
do $$ begin
  begin perform * from intake_forms; raise exception 'FAIL anon could read health forms';
  exception when insufficient_privilege then raise notice 'OK anon denied health forms'; end;
end $$;
reset role;
