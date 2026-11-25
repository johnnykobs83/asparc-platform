-- =====================================================================
-- ASPARC platform – repeating client bookings
--
-- series_id : bookings made together as a repeating booking (e.g. every
--             Tuesday at 4 pm for 10 weeks) share one id, so "cancel this
--             and all later ones" can find the rest.
-- Safe to run more than once.
-- =====================================================================

alter table public.appointments add column if not exists series_id uuid;
create index if not exists appointments_series_idx on public.appointments (series_id, starts_at) where series_id is not null;

notify pgrst, 'reload schema';
