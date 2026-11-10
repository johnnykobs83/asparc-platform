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
