-- =====================================================================
-- ASPARC platform – prices on online bookings
--
-- price_cents       : the service's list price when the booking was made
--                     (empty when the service is priced on enquiry)
-- final_price_cents : the price staff set after a discount or adjustment
--                     (empty means the list price applies)
-- price_note        : why the price was changed, e.g. "Club member 10% off"
-- Safe to run more than once.
-- =====================================================================

alter table public.appointments
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  add column if not exists final_price_cents integer check (final_price_cents is null or final_price_cents >= 0),
  add column if not exists price_note text check (price_note is null or char_length(price_note) <= 300);

-- Make the new columns visible to the API straight away.
notify pgrst, 'reload schema';
