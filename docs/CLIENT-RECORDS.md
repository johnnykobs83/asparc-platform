# Client records and the pre-visit health form

## Clients (dashboard → Clients)
Everyone who books, enquires or registers is kept as one client record (matched by
email, or mobile when there is no email). The Clients page lists them with visits,
last and next visit, and the pre-visit form status. Opening a client shows:

- contact details, date of birth, address, emergency contact, sport and club (editable);
- every booking (past and upcoming), enquiries, booking requests, Academy registrations
  and online payments;
- the pre-visit health form and client notes (see access below).

When staff add a booking (Online Booking → Add booking) they can search for an existing
client so the booking lands on the same record.

## The pre-visit form
- Emailed automatically with a client's **first booking** (online or staff-made), and
  again when their last form is **more than 12 months old** on the day of the visit.
- Staff can **Send again** or **Copy new link** from the client record. A new link
  cancels any older one. Links last 30 days and can be used once.
- The form asks for contact details, an emergency contact, sport and goals, a 10-question
  health screen (structured like a standard adult pre-exercise screen, plus massage
  contraindications – ASPARC's own wording), injuries, medications, allergies, how they
  heard about ASPARC, an optional marketing opt-in, two required agreements and a typed
  signature. Parents can fill it in for a child.
- Any "yes" in the health screen marks the form **GP clearance needed**. A manager or the
  practitioner reviews it and records **Cleared to go ahead** or **Not cleared**, with a note.

## Who can see health information
| | Contact details & history | Form status flag | Health answers & notes |
|---|---|---|---|
| Owner, manager | ✓ | ✓ | ✓ |
| Practitioner on that client's booking* | ✓ | ✓ | ✓ |
| Other staff | ✓ | ✓ | – |

\* Link the practitioner to their Staff Planner profile (Online Booking → Edit practitioner →
"Same person in the Staff Planner"), and the planner profile to their dashboard login.

Health answers are never put in emails or notifications, never synced to HubSpot and
never given to the AI receptionist. Contact details from the form update the client record;
health answers stay on the form.

## Records
Victoria's Health Records Act expects health records to be kept for 7 years after the
last visit (adults) or until the client turns 25 (children). A privacy deletion
(owner only) removes the client with their bookings, forms and notes – check the
retention rule before deleting a client who has been seen.

## Database
Migration `supabase/migrations/20261125000009_client_records_intake.sql` adds the client
columns, `client_notes`, `intake_forms` (RLS: owners and managers) and
`practitioners.staff_member_id`.
