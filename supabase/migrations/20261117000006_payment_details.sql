-- =====================================================================
-- ASPARC platform – more detail on Stripe payments
--
-- service_slug   : which service was bought (from the Payment Link's
--                  metadata), so Revenue can say what each payment was for
-- tax_cents      : the GST included in the amount (helps with the BAS)
-- refunded_cents : how much has been refunded or credited so far
--                  (partial refunds and invoice credit notes)
-- Safe to run more than once.
-- =====================================================================

alter table public.payments
  add column if not exists service_slug text check (service_slug is null or char_length(service_slug) <= 80),
  add column if not exists tax_cents integer check (tax_cents is null or tax_cents >= 0),
  add column if not exists refunded_cents integer not null default 0 check (refunded_cents >= 0);

-- Make the new columns visible to the API straight away.
notify pgrst, 'reload schema';
