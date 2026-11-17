-- =====================================================================
-- ASPARC platform – special offers on services
--
-- standard_price_cents : the usual price, shown crossed out next to the
--                        offer price (price_cents). Leave empty when the
--                        service is not on special.
-- offer_label          : short badge text, e.g. "Introductory offer"
-- offer_terms          : the conditions shown under the price, e.g.
--                        "For the first 10 athletes"
-- is_featured          : promote this service across the website
--                        (homepage, site-wide banner, service pages, AI)
--
-- Also adds the Individual 6-Week High-Performance Program.
-- Safe to run more than once.
-- =====================================================================

alter table public.services
  add column if not exists standard_price_cents integer check (standard_price_cents is null or standard_price_cents >= 0),
  add column if not exists offer_label text check (offer_label is null or char_length(offer_label) <= 60),
  add column if not exists offer_terms text check (offer_terms is null or char_length(offer_terms) <= 200),
  add column if not exists is_featured boolean not null default false;

insert into public.services (
  slug, name, category, summary, duration_minutes,
  price_cents, price_unit, price_status, availability, bookable, is_public, sort_order,
  standard_price_cents, offer_label, offer_terms, is_featured
) values (
  'individual-high-performance-6-week',
  'Individual 6-Week High-Performance Program',
  'performance',
  'A 6-week program built around you as an individual athlete: one 1-on-1 training session a week with one of our coaches (6 sessions in total), plus a detailed weekly program to follow between sessions.',
  null,
  77000, 'for the 6-week program (incl. GST)', 'approved', 'available', false, true, 5,
  99000, 'Introductory offer', 'Introductory price for the first 10 athletes. Standard price $990 incl. GST.', true
)
on conflict (slug) do nothing;

-- Make the new columns visible to the API straight away.
notify pgrst, 'reload schema';
