-- =====================================================================
-- ASPARC platform – a colour for each practitioner
--
-- colour : shades their bookings on the Bookings calendar so staff can
--          tell people apart at a glance. Empty = picked automatically.
-- Safe to run more than once.
-- =====================================================================

alter table public.practitioners add column if not exists colour text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'practitioners_colour_hex') then
    alter table public.practitioners add constraint practitioners_colour_hex check (colour is null or colour ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

notify pgrst, 'reload schema';
