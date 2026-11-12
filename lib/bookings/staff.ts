import { z } from 'zod';
import { checkInbound } from '../ai/guardrails';
import { db } from '../db';
import type { Appointment, Customer } from '../db/types';
import { emailLayout, isResendConfigured, sendEmail } from '../integrations/resend';
import { listKnowledge } from '../kb/service';
import { BookingError, dollars, insertAppointment, isOverlapError, melbourneLocalToUtc, whenText } from './service';

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
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address or a mobile number' });
    if (!v.service_id && !v.service_name) ctx.addIssue({ code: 'custom', path: ['service_name'], message: 'Choose a service or type what the booking is for' });
    if (!v.service_id && !v.duration_minutes) ctx.addIssue({ code: 'custom', path: ['duration_minutes'], message: 'Enter how long the booking is' });
  });

async function upsertStaffCustomer(b: z.output<typeof StaffBookingSchema>): Promise<Customer> {
  const repo = db();
  const existing = (b.email ? await repo.findOne('customers', { email: b.email }) : null) ?? (b.phone && !b.email ? await repo.findOne('customers', { phone: b.phone }) : null);
  if (existing) return (await repo.update('customers', existing.id, { full_name: b.full_name, phone: b.phone ?? existing.phone, email: existing.email ?? b.email ?? null }))!;
  // The customer asked staff for this booking, so contacting them about it is expected. Marketing is never assumed.
  return repo.insert('customers', { full_name: b.full_name, email: b.email ?? null, phone: b.phone ?? null, preferred_contact: b.email ? 'email' : 'phone', consent_contact: true, consent_contact_at: new Date().toISOString(), consent_marketing: false, source: 'other' });
}

/**
 * Staff add a booking straight onto the schedule. Staff are not limited to the published
 * hours or notice period, but a booking can never overlap another for the same practitioner.
 */
export async function createStaffBooking(raw: unknown, staffEmail: string): Promise<{ appointment: Appointment; customerEmail: CustomerEmailStatus }> {
  const b = StaffBookingSchema.parse(raw);
  const repo = db();
  const practitioner = await repo.get('practitioners', b.practitioner_id);
  if (!practitioner) throw new BookingError(404, 'Practitioner not found');
  const service = b.service_id ? await repo.get('services', b.service_id) : null;
  if (b.service_id && !service) throw new BookingError(404, 'Service not found');

  const duration = b.duration_minutes ?? service?.duration_minutes ?? null;
  if (!duration) throw new BookingError(422, 'Enter how long the booking is.');
  const startMs = melbourneLocalToUtc(b.date, b.minutes).getTime();
  if (Number.isNaN(startMs)) throw new BookingError(422, 'That is not a valid day or time.');
  const endMs = startMs + duration * 60000;
  const blockedMs = endMs + practitioner.buffer_minutes * 60000;

  const others = await repo.list('appointments', { eq: { practitioner_id: practitioner.id, status: 'confirmed' }, orderBy: 'starts_at', ascending: false, limit: 1000 });
  if (others.some((a) => Date.parse(a.starts_at) < blockedMs && Date.parse(a.blocked_until) > startMs)) throw new BookingError(409, 'That time overlaps another booking for this practitioner.');

  const listPrice = service && service.price_status !== 'on_enquiry' ? service.price_cents : null;
  const customer = await upsertStaffCustomer(b);
  let appointment: Appointment;
  try {
    appointment = await insertAppointment({
      practitioner_id: practitioner.id,
      service_id: service?.id ?? null,
      service_name: service?.name ?? b.service_name!,
      customer_id: customer.id,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      blocked_until: new Date(blockedMs).toISOString(),
      status: 'confirmed',
      notes: b.notes ? checkInbound(b.notes).sanitized : null,
      source: `staff:${staffEmail}`.slice(0, 120),
      price_cents: listPrice,
      final_price_cents: b.price_cents != null && b.price_cents !== listPrice ? b.price_cents : null,
    });
  } catch (e) {
    if (isOverlapError(e)) throw new BookingError(409, 'That time overlaps another booking for this practitioner.');
    throw e;
  }
  return { appointment, customerEmail: await emailCustomerAboutBooking('confirmed', appointment) };
}
