# Online booking – how it works and how to switch it on

Customers book themselves at `/book`: they choose a service, a practitioner (or
"any available"), a day and a time, enter their name, email and mobile, and the
appointment is **confirmed immediately**. No staff step is needed.

This is the one exception to the platform rule that nothing is confirmed
automatically. Everything else – enquiry forms, Academy registrations and
anything said to ASPARC AI – is still a request that staff confirm. ASPARC AI
cannot make or confirm bookings; it points people to the booking page.

## Switching it on

1. **Database (once):** run `supabase/migrations/20261111000003_bookings.sql`
   in the Supabase SQL Editor. It creates the `practitioners` and
   `appointments` tables with the same security rules as the rest of the
   database. It is safe to run more than once.
2. **Dashboard → Bookings → Add practitioner:** enter the person's name, their
   working hours for each day, and tick the services they deliver.
3. **Dashboard → Pricing & Services:** a service can be booked online when it
   has a **duration**, is **public** and its availability is **Available**.
   (The Academy is a program, not an appointment, and is never booked here.)

As soon as one active practitioner has hours and a bookable service, the
website header changes from "Enquire now" to "Book online", the massage page
gains a "Book online" button, and ASPARC AI starts pointing people to `/book`.
Until then `/book` shows a link to the booking-request form.

## Rules

| Rule | Value | Where to change |
|---|---|---|
| Start times | every 30 minutes | `BOOKING_RULES.slotStepMinutes` in `lib/bookings/service.ts` |
| Minimum notice | 2 hours | `BOOKING_RULES.minNoticeMinutes` |
| How far ahead | 28 days | `BOOKING_RULES.horizonDays` |
| Gap after an appointment | per practitioner, default 0 | Dashboard → Bookings → Edit practitioner |
| Time zone | Melbourne, daylight-saving aware | – |

Double-booking is prevented twice: the server re-checks the time is free when
the booking is made, and the database refuses any confirmed appointment that
overlaps another for the same practitioner.

## What staff see and do

- **Dashboard → Bookings** lists upcoming and past online bookings with the
  customer's name, mobile and email.
- Each booking creates a notification ("Booked online: …"). If Resend email is
  configured, the customer also receives a confirmation email and management
  can be emailed the notification.
- Staff can mark a booking **Completed**, **No-show** or **Cancel** it.
  Cancelling frees the time for other customers. The customer is **not**
  notified automatically – contact them.

## Not built yet

- Customers cannot cancel or reschedule online; they contact ASPARC.
- No online payment at booking. (Stripe is prepared separately – see
  `docs/PHASE-3-4.md`.)
- No reminders by SMS or email.
- No one-off days off or holidays: to block time, shorten the practitioner's
  hours or switch them off for online booking.
- Each day has one working-hours block per practitioner in the dashboard
  (the database supports several).
