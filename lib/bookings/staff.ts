import { z } from 'zod';
import { checkInbound } from '../ai/guardrails';
import { db } from '../db';
import type { Appointment, Customer } from '../db/types';
import { emailLayout, isResendConfigured, sendEmail } from '../integrations/resend';
import { listKnowledge } from '../kb/service';
import { randomUUID } from 'node:crypto';
import { addDays } from '../time/melbourne';
import { BookingError, dollars, insertAppointment, isOverlapError, melbourneLocalToUtc, updateAppointmentStatus, whenText } from './service';
import { sendIntakeIfDue } from '../clients/intake';

/**
 * Staff actions on the schedule: adding a booking by hand, and emailing the
 * customer whenever a booking is made, moved, cancelled or re-priced.
 *
 * Emails go through Resend. If Resend is not configured, or the customer has
 * no email address, nothing is sent and the caller is told why – the dashboard
 * shows that to staff so they know to contact the customer themselves.
 */

export type CustomerEmailStatus = 'sent' | 'not_configured' | 'no_email' | 'failed';
export type BookingEmailKind = 'confirmed' | 'moved' | 'cancelled' | 'price';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function contactLines(): Promise<{ address: string; contact: string }> {
  const kb = await listKnowledge();
  const loc = kb.find((k) => k.key === 'business.location');
  const con = kb.find((k) => k.key === 'business.contact');
  const address = loc?.status === 'approved' ? ((loc.data as { address?: string }).address ?? '') : '';
  const c = (con?.status === 'approved' ? con.data : {}) as { email?: string; phone?: string };
  const contact = [c.phone ? `call ${c.phone}` : '', c.email ? `email ${c.email}` : ''].filter(Boolean).join(' or ');
  return { address, contact };
}

/** What the customer will be charged for a booking, or null when no price is set. */
const chargeOf = (a: Appointment) => a.final_price_cents ?? a.price_cents ?? null;

/** Emails the customer about a change to their booking. Never throws. */
export async function emailCustomerAboutBooking(kind: BookingEmailKind, appointment: Appointment, opts: { previousStart?: string } = {}): Promise<CustomerEmailStatus> {
  try {
    const repo = db();
    const customer = await repo.get('customers', appointment.customer_id);
    if (!customer?.email) return 'no_email';
    if (!isResendConfigured()) return 'not_configured';
    const practitioner = await repo.get('practitioners', appointment.practitioner_id);
    const { address, contact } = await contactLines();
    const when = whenText(appointment.starts_at);
    const charge = chargeOf(appointment);

    const headline = { confirmed: 'Your booking is confirmed', moved: 'Your booking has been moved', cancelled: 'Your booking has been cancelled', price: 'Your booking price has been updated' }[kind];
    const lead = {
      confirmed: 'Your booking with ASPARC is confirmed:',
      moved: `Your booking with ASPARC has been moved${opts.previousStart ? ` from ${whenText(opts.previousStart)}` : ''}. Your new time is:`,
      cancelled: 'Your booking with ASPARC has been cancelled:',
      price: 'The price for your booking with ASPARC has been updated:',
    }[kind];
    const details = [appointment.service_name, practitioner ? `With ${practitioner.name}` : '', when, kind !== 'cancelled' && charge != null ? `Price: ${dollars(charge)}` : '', kind !== 'cancelled' ? address : ''].filter(Boolean);
    const help = contact ? `If this doesn't suit, or you have any questions, ${contact}.` : "If this doesn't suit, or you have any questions, reply to this email.";
    const subject = { confirmed: `Your ASPARC booking is confirmed – ${when}`, moved: `Your ASPARC booking has moved to ${when}`, cancelled: `Your ASPARC booking on ${when} has been cancelled`, price: `Your ASPARC booking on ${when} – price updated` }[kind];

    const r = await sendEmail({
      to: [customer.email],
      subject,
      text: `Hi ${customer.full_name},\n\n${lead}\n${details.join('\n')}\n\n${help}\n\nASPARC`,
      html: emailLayout(headline, `<p>Hi ${esc(customer.full_name)},</p><p>${esc(lead)}</p><p>${details.map(esc).join('<br>')}</p><p>${esc(help)}</p>`),
      entityType: 'appointment',
      entityId: appointment.id,
    });
    return r.status === 'sent' ? 'sent' : r.status === 'not_configured' ? 'not_configured' : 'failed';
  } catch {
    return 'failed';
  }
}

// ------------------------------------------------------------------ staff-created bookings
export const StaffBookingSchema = z
  .object({
    practitioner_id: z.string().uuid(),
    /** A listed service, or leave empty and give a name for anything else. */
    service_id: z.string().uuid().nullable().optional(),
    service_name: z.string().trim().max(160).optional(),
    /** Melbourne local time: calendar date and minutes from midnight. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minutes: z.number().int().min(0).max(1435),
    duration_minutes: z.number().int().min(5).max(480).optional(),
    full_name: z.string().trim().min(2, 'Enter the customer’s name').max(160),
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : undefined))
      .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || /^[+()\d\s-]{8,20}$/.test(v), 'Enter a valid phone number'),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v ? v : undefined)),
    /** Price to charge in cents. Leave out to use the service's list price. */
    price_cents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    /** An existing client picked from the client database. */
    customer_id: z.string().uuid().optional(),
    /** Repeat on the same weekday and time every 1–4 weeks, until a date or for a number of sessions (counting the first). */
    repeat: z
      .object({
        every_weeks: z.number().int().min(1).max(4),
        count: z.number().int().min(2, 'Choose at least 2 sessions').max(52, 'The most is 52 sessions').optional(),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date').optional(),
      })
      .strict()
      .refine((r) => (r.count == null) !== (r.until == null), 'Choose an end date or a number of sessions')
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address or a mobile number' });
    if (!v.service_id && !v.service_name) ctx.addIssue({ code: 'custom', path: ['service_name'], message: 'Choose a service or type what the booking is for' });
    if (!v.service_id && !v.duration_minutes) ctx.addIssue({ code: 'custom', path: ['duration_minutes'], message: 'Enter how long the booking is' });
  });

async function upsertStaffCustomer(b: z.output<typeof StaffBookingSchema>): Promise<Customer> {
  const repo = db();
  if (b.customer_id) {
    // Picked from the client database: keep their record, only filling in a missing email or mobile.
    const picked = await repo.get('customers', b.customer_id);
    if (!picked) throw new BookingError(404, 'That client could not be found. Search again or enter their details.');
    const fill: Partial<Customer> = {};
    if (!picked.email && b.email && !(await repo.findOne('customers', { email: b.email }))) fill.email = b.email;
    if (!picked.phone && b.phone) fill.phone = b.phone;
    return Object.keys(fill).length ? (await repo.update('customers', picked.id, fill))! : picked;
  }
  const existing = (b.email ? await repo.findOne('customers', { email: b.email }) : null) ?? (b.phone && !b.email ? await repo.findOne('customers', { phone: b.phone }) : null);
  if (existing) return (await repo.update('customers', existing.id, { full_name: b.full_name, phone: b.phone ?? existing.phone, email: existing.email ?? b.email ?? null }))!;
  // The customer asked staff for this booking, so contacting them about it is expected. Marketing is never assumed.
  return repo.insert('customers', { full_name: b.full_name, email: b.email ?? null, phone: b.phone ?? null, preferred_contact: b.email ? 'email' : 'phone', consent_contact: true, consent_contact_at: new Date().toISOString(), consent_marketing: false, source: 'other' });
}

/** The most bookings one repeating booking can make, and how far ahead it can go. */
export const MAX_REPEAT_BOOKINGS = 52;
export const MAX_REPEAT_DAYS = 366;

/** The calendar dates of a booking and its repeats (Melbourne dates, same weekday). */
export function bookingDates(first: string, repeat?: { every_weeks: number; count?: number; until?: string }): string[] {
  if (!repeat) return [first];
  const out: string[] = [];
  const last = repeat.until ?? null;
  for (let i = 0; out.length < (repeat.count ?? MAX_REPEAT_BOOKINGS + 1); i++) {
    const d = addDays(first, i * repeat.every_weeks * 7);
    if (last && d > last) break;
    out.push(d);
    if (out.length > MAX_REPEAT_BOOKINGS) break;
  }
  return out;
}

export interface StaffBookingResult {
  appointment: Appointment;
  /** Every booking made – more than one for a repeating booking. */
  appointments: Appointment[];
  /** Repeats that could not be booked because the time was already taken. */
  skipped: { date: string; reason: string }[];
  customerEmail: CustomerEmailStatus;
  preVisitForm: Awaited<ReturnType<typeof sendIntakeIfDue>>;
}

/**
 * Staff add a booking straight onto the schedule – once, or repeating every 1–4 weeks
 * until a date or for a number of sessions. Staff are not limited to the published hours
 * or notice period, but a booking can never overlap another for the same practitioner:
 * for a repeating booking, any repeat that would clash is skipped and listed.
 */
export async function createStaffBooking(raw: unknown, staffEmail: string): Promise<StaffBookingResult> {
  const b = StaffBookingSchema.parse(raw);
  const repo = db();
  const practitioner = await repo.get('practitioners', b.practitioner_id);
  if (!practitioner) throw new BookingError(404, 'Practitioner not found');
  const service = b.service_id ? await repo.get('services', b.service_id) : null;
  if (b.service_id && !service) throw new BookingError(404, 'Service not found');

  const duration = b.duration_minutes ?? service?.duration_minutes ?? null;
  if (!duration) throw new BookingError(422, 'Enter how long the booking is.');
  if (Number.isNaN(melbourneLocalToUtc(b.date, b.minutes).getTime())) throw new BookingError(422, 'That is not a valid day or time.');
  if (b.repeat?.until && b.repeat.until > addDays(b.date, MAX_REPEAT_DAYS)) throw new BookingError(422, 'A repeating booking can run for up to a year. Choose an earlier end date.');
  const dates = bookingDates(b.date, b.repeat);
  if (dates.length > MAX_REPEAT_BOOKINGS) throw new BookingError(422, `That would make more than ${MAX_REPEAT_BOOKINGS} bookings. Choose an earlier end date or fewer sessions.`);
  if (b.repeat && dates.length < 2) throw new BookingError(422, 'The end date is before the first repeat. Choose a later date, or book it once.');

  const others = await repo.list('appointments', { eq: { practitioner_id: practitioner.id, status: 'confirmed' }, orderBy: 'starts_at', ascending: false, limit: 5000 });
  const slots = dates.map((date) => {
    const startMs = melbourneLocalToUtc(date, b.minutes).getTime();
    const endMs = startMs + duration * 60000;
    return { date, startMs, endMs, blockedMs: endMs + practitioner.buffer_minutes * 60000 };
  });
  const clashes = (x: { startMs: number; blockedMs: number }) => others.some((a) => Date.parse(a.starts_at) < x.blockedMs && Date.parse(a.blocked_until) > x.startMs);
  const OVERLAP = 'That time overlaps another booking for this practitioner.';
  if (!b.repeat && clashes(slots[0])) throw new BookingError(409, OVERLAP);
  const free = slots.filter((x) => !clashes(x));
  const skipped = slots.filter((x) => clashes(x)).map((x) => ({ date: x.date, reason: 'Already booked at that time' }));
  if (!free.length) throw new BookingError(409, 'Every one of those times overlaps another booking for this practitioner.');

  const listPrice = service && service.price_status !== 'on_enquiry' ? service.price_cents : null;
  const customer = await upsertStaffCustomer(b);
  const seriesId = free.length > 1 ? randomUUID() : null;
  const made: Appointment[] = [];
  for (const x of free) {
    const row: Partial<Appointment> = {
      practitioner_id: practitioner.id,
      service_id: service?.id ?? null,
      service_name: service?.name ?? b.service_name!,
      customer_id: customer.id,
      starts_at: new Date(x.startMs).toISOString(),
      ends_at: new Date(x.endMs).toISOString(),
      blocked_until: new Date(x.blockedMs).toISOString(),
      status: 'confirmed',
      notes: b.notes ? checkInbound(b.notes).sanitized : null,
      source: `staff:${staffEmail}`.slice(0, 120),
      price_cents: listPrice,
      final_price_cents: b.price_cents != null && b.price_cents !== listPrice ? b.price_cents : null,
      ...(seriesId ? { series_id: seriesId } : {}),
    };
    try {
      made.push(await insertAppointment(row));
    } catch (e) {
      if (!isOverlapError(e)) throw e;
      // Someone booked that time a moment ago.
      if (!b.repeat) throw new BookingError(409, OVERLAP);
      skipped.push({ date: x.date, reason: 'Already booked at that time' });
    }
  }
  if (!made.length) throw new BookingError(409, OVERLAP);
  skipped.sort((p, q) => p.date.localeCompare(q.date));

  const customerEmail = made.length === 1 ? await emailCustomerAboutBooking('confirmed', made[0]) : await emailCustomerAboutSeries('confirmed', made);
  // First booking, or their health form is more than a year old: send the pre-visit form.
  const preVisitForm = await sendIntakeIfDue(customer.id, made[0].starts_at, `staff:${staffEmail}`);
  return { appointment: made[0], appointments: made, skipped, customerEmail, preVisitForm };
}

/** One email for several bookings at once (a repeating booking made or cancelled). Never throws. */
export async function emailCustomerAboutSeries(kind: 'confirmed' | 'cancelled', appointments: Appointment[]): Promise<CustomerEmailStatus> {
  try {
    if (!appointments.length) return 'no_email';
    const repo = db();
    const first = appointments[0];
    const customer = await repo.get('customers', first.customer_id);
    if (!customer?.email) return 'no_email';
    if (!isResendConfigured()) return 'not_configured';
    const practitioner = await repo.get('practitioners', first.practitioner_id);
    const { address, contact } = await contactLines();
    const sorted = [...appointments].sort((p, q) => p.starts_at.localeCompare(q.starts_at));
    const dates = sorted.map((a) => {
      const charge = chargeOf(a);
      return `${whenText(a.starts_at)}${kind === 'confirmed' && charge != null ? ` – ${dollars(charge)}` : ''}`;
    });
    const n = sorted.length;
    const headline = kind === 'confirmed' ? `Your ${n} bookings are confirmed` : `${n} bookings have been cancelled`;
    const lead = kind === 'confirmed' ? `Your repeating booking with ASPARC is confirmed – ${n} sessions:` : `These ${n} bookings with ASPARC have been cancelled:`;
    const about = [first.service_name, practitioner ? `With ${practitioner.name}` : '', kind === 'confirmed' ? address : ''].filter(Boolean);
    const help = contact ? `If anything doesn't suit, or you have any questions, ${contact}.` : "If anything doesn't suit, or you have any questions, reply to this email.";
    const subject = kind === 'confirmed' ? `Your ASPARC bookings are confirmed – ${n} sessions from ${whenText(sorted[0].starts_at)}` : `${n} ASPARC bookings cancelled from ${whenText(sorted[0].starts_at)}`;
    const r = await sendEmail({
      to: [customer.email],
      subject,
      text: `Hi ${customer.full_name},\n\n${lead}\n${about.join('\n')}\n\n${dates.map((d) => `• ${d}`).join('\n')}\n\n${help}\n\nASPARC`,
      html: emailLayout(
        headline,
        `<p>Hi ${esc(customer.full_name)},</p><p>${esc(lead)}</p><p>${about.map(esc).join('<br>')}</p><ul style="padding-left:18px">${dates.map((d) => `<li>${esc(d)}</li>`).join('')}</ul><p>${esc(help)}</p>`,
      ),
      entityType: 'appointment',
      entityId: first.id,
    });
    return r.status === 'sent' ? 'sent' : r.status === 'not_configured' ? 'not_configured' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Cancels a booking and every later booking in the same repeating series. */
export async function cancelSeriesFrom(id: string, reason: string | null): Promise<{ cancelled: Appointment[]; customerEmail: CustomerEmailStatus }> {
  const repo = db();
  const one = await repo.get('appointments', id);
  if (!one) throw new BookingError(404, 'Appointment not found');
  const targets = one.series_id
    ? (await repo.list('appointments', { eq: { series_id: one.series_id }, orderBy: 'starts_at', ascending: true, limit: 500 })).filter((a) => a.starts_at >= one.starts_at && a.status === 'confirmed')
    : one.status === 'confirmed'
      ? [one]
      : [];
  const cancelled: Appointment[] = [];
  for (const a of targets) {
    const u = await updateAppointmentStatus(a.id, 'cancelled', reason);
    if (u) cancelled.push(u);
  }
  const customerEmail = cancelled.length > 1 ? await emailCustomerAboutSeries('cancelled', cancelled) : cancelled.length === 1 ? await emailCustomerAboutBooking('cancelled', cancelled[0]) : 'no_email';
  return { cancelled, customerEmail };
}
