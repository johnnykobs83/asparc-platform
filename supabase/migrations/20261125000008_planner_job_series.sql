-- =====================================================================
-- ASPARC platform – repeating jobs in the staff planner
--
-- series_id : jobs added together (several days and/or repeating weekly)
--             share one id, so "this and following" changes and deletes
--             can find the rest of the series.
-- Safe to run more than once.
-- =====================================================================

alter table public.planner_jobs add column if not exists series_id uuid;
create index if not exists planner_jobs_series_idx on public.planner_jobs (series_id, starts_at) where series_id is not null;

-- Make the new column visible to the API straight away.
notify pgrst, 'reload schema';
