-- ASPARC moved to 104/12 Ormond Blvd, Bundoora (27 Nov 2026): Academy sessions are held there.
alter table public.academy_sessions alter column location set default '104/12 Ormond Blvd, Bundoora';
update public.academy_sessions set location = '104/12 Ormond Blvd, Bundoora' where location = 'Avenger Park';
