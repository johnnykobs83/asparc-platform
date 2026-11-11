import { z } from 'zod';
import { checkInbound } from '../ai/guardrails';
import { db } from '../db';
import type { Appointment, Customer, Practitioner, Service, WeeklyHours } from '../db/types';
import { emailLayout, sendEmail } from '../integrations/resend';
import { listKnowledge, listServices } from '../kb/service';
import { notify } from '../notifications/service';
import { addDays, formatMelbourne, melbourneDate, offsetMinutes } from '../time/melbourne';

/**
 * Online self-service bookings.
 *
 * A customer picks a service, a practitioner (or "any"), a day and a time
 * from the practitioner's real availability, enters their details, and the
 * appointment is confirmed immediately – no staff step.
 *
 * What can be booked online is driven entirely by dashboard configuration:
 * a service is bookable only when it has a duration, is public and available,
 * and at least one active practitioner with working hours is assigned to it.
 * With no practitioners configured nothing is offered, and the site falls
 * back to the booking-request form.
 */

export const BOOKING_RULES = {
  /** Start times are offered on this grid. */
  slotStepMinutes: 30,
  /** Earliest bookable start is this far from now. */
  minNoticeMinutes: 120,
  /** How far ahead customers can book. */
  horizonDays: 28,
  /** Most days returned by one availability request. */
  maxDaysPerRequest: 14,
} as const;

export class BookingError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const SLOT_TAKEN = 'Sorry, that time has just been taken. Please choose another time.';

// ------------------------------------------------------------------ time
/** UTC instant for a Melbourne local date + minutes-from-midnight (daylight-saving safe). */
export function melbourneLocalToUtc(ymd: string, minutes: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetMinutes(new Date(guess)) * 60000;
  t = guess - offsetMinutes(new Date(t)) * 60000;
  return new Date(t);
}

const weekdayOf = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// ------------------------------------------------------------------ config
export function normaliseWeeklyHours(raw: unknown): WeeklyHours {
  const out: WeeklyHours = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [day, windows] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day) || !Array.isArray(windows)) continue;
    const clean = windows
      .map((w) => w as { start?: unknown; end?: unknown })
      .filter((w) => Number.isInteger(w.start) && Number.isInteger(w.end) && (w.start as number) >= 0 && (w.end as number) <= 1440 && (w.start as number) < (w.end as number))
      .map((w) => ({ start: w.start as number, end: w.end as number }))
      .sort((a, b) => a.start - b.start);
    if (clean.length) out[day] = clean;
  }
  return out;
}

const hasHours = (p: Practitioner) => Object.keys(normaliseWeeklyHours(p.weekly_hours)).length > 0;

const serviceIsEligible = (s: Service) =>
  Boolean(s.duration_minutes && s.duration_minutes > 0) && s.is_public && s.availability === 'available' && s.category !== 'academy';

/** Active practitioners. Returns [] if the bookings tables do not exist yet (migration not applied). */
export async function listActivePractitioners(): Promise<Practitioner[]> {
  try {
    const rows = await db().list('practitioners', { eq: { active: true }, orderBy: 'name', ascending: true, limit: 200 });
    return rows.map((p) => ({ ...p, service_ids: Array.isArray(p.service_ids) ? p.service_ids : [], weekly_hours: normaliseWeeklyHours(p.weekly_hours) }));
  } catch {
    return [];
  }
}

export interface BookableService {
  id: string;
  name: string;
  summary: string;
  duration_minutes: number;
  price_cents: number | null;
  price_status: Service['price_status'];
  practitioners: { id: string; name: string; title: string | null }[];
}

export async function listBookableServices(): Promise<BookableService[]> {
  const practitioners = (await listActivePractitioners()).filter(hasHours);
  if (!practitioners.length) return [];
  const services = (await listServices({ publicOnly: true })).filter(serviceIsEligible);
  return services
    .map((s) => ({
      id: s.id,
      name: s.name,
      summary: s.summary,
      duration_minutes: s.duration_minutes as number,
      price_cents: s.price_cents,
      price_status: s.price_status,
      practitioners: practitioners.filter((p) => p.service_ids.includes(s.id)).map((p) => ({ id: p.id, name: p.name, title: p.title })),
    }))
    .filter((s) => s.practitioners.length > 0);
}

export async function onlineBookingEnabled(): Promise<boolean> {
  return (await listBookableServices()).length > 0;
}

// ------------------------------------------------------------------ availability
export interface Slot {
  start: string;
  practitioner_id: string;
}

async function confirmedAppointments(practitionerId: string): Promise<Appointment[]> {
  return db().list('appointments', { eq: { practitioner_id: practitionerId, status: 'confirmed' }, orderBy: 'starts_at', ascending: false, limit: 1000 });
}

/** Free start times for one practitioner on one Melbourne calendar day. */
export function slotsForDay(ymd: string, durationMinutes: number, practitioner: Practitioner, appointments: Appointment[], nowMs: number): Slot[] {
  const windows = normaliseWeeklyHours(practitioner.weekly_hours)[String(weekdayOf(ymd))] ?? [];
  const earliest = nowMs + BOOKING_RULES.minNoticeMinutes * 60000;
  const busy = appointments.filter((a) => a.status === 'confirmed').map((a) => [Date.parse(a.starts_at), Date.parse(a.blocked_until)] as const);
  const out: Slot[] = [];
  for (const w of windows) {
    for (let t = w.start; t + durationMinutes <= w.end; t += BOOKING_RULES.slotStepMinutes) {
      const start = melbourneLocalToUtc(ymd, t).getTime();
      const blockedUntil = start + (durationMinutes + practitioner.buffer_minutes) * 60000;
      if (start < earliest) continue;
      if (busy.some(([s, e]) => s < blockedUntil && e > start)) continue;
      out.push({ start: new Date(start).toISOString(), practitioner_id: practitioner.id });
    }
  }
  return out;
}

export interface Availability {
  service: BookableService;
  from: string;
  days: { date: string; slots: Slot[] }[];
  rules: { minNoticeMinutes: number; horizonDays: number; lastDate: string };
}

export async function getAvailability(serviceId: string, fromYmd: string | null, days = 7, practitionerId: string | null = null, nowMs = Date.now()): Promise<Availability> {
  const service = (await listBookableServices()).find((s) => s.id === serviceId);
  if (!service) throw new BookingError(404, 'That service cannot be booked online.');
  const today = melbourneDate(new Date(nowMs));
  const lastDate = addDays(today, BOOKING_RULES.horizonDays);
  let from = fromYmd && isYmd(fromYmd) ? fromYmd : today;
  if (from < today) from = today;
  const count = Math.max(1, Math.min(BOOKING_RULES.maxDaysPerRequest, days));

  const all = await listActivePractitioners();
  const chosen = all.filter((p) => service.practitioners.some((sp) => sp.id === p.id) && (!practitionerId || p.id === practitionerId));
  const appts = new Map<string, Appointment[]>();
  for (const p of chosen) appts.set(p.id, await confirmedAppointments(p.id));

  const out: Availability['days'] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(from, i);
    if (date > lastDate) break;
    const slots = chosen.flatMap((p) => slotsForDay(date, service.duration_minutes, p, appts.get(p.id) ?? [], nowMs)).sort((a, b) => a.start.localeCompare(b.start));
    out.push({ date, slots });
  }
  return { service, from, days: out, rules: { minNoticeMinutes: BOOKING_RULES.minNoticeMinutes, horizonDays: BOOKING_RULES.horizonDays, lastDate } };
}

// ------------------------------------------------------------------ booking
export const BookingSchema = z
  .object({
    service_id: z.string().uuid(),
    /** Omit or null for "any available practitioner". */
    practitioner_id: z.string().uuid().nullable().optional(),
    start: z.string().datetime({ offset: true }),
    full_name: z.string().trim().min(2, 'Please enter your full name').max(160),
    email: z
      .string()
      .trim()
      .max(254)
      .transform((v) => v.toLowerCase())
      .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Please enter a valid email address'),
    phone: z
      .string()
      .trim()
      .max(32)
      .refine((v) => /^[+()\d\s-]{8,20}$/.test(v), 'Please enter a valid phone number'),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v ? v : undefined)),
    consent_contact: z.boolean().optional(),
    consent_marketing: z.boolean().optional().default(false),
    website: z.string().max(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.consent_contact !== true) ctx.addIssue({ code: 'custom', path: ['consent_contact'], message: 'Please confirm we may contact you about your booking' });
  });

async function upsertBookingCustomer(b: z.output<typeof BookingSchema>): Promise<Customer> {
  const repo = db();
  const now = new Date().toISOString();
  const existing = await repo.findOne('customers', { email: b.email });
  if (existing) {
    const patch: Partial<Customer> = { full_name: b.full_name, phone: b.phone, consent_contact: true, consent_contact_at: existing.consent_contact_at ?? now };
    // Marketing consent is only ever granted by an explicit opt-in; it is never removed here.
    if (b.consent_marketing && !existing.consent_marketing) {
      patch.consent_marketing = true;
      patch.consent_marketing_at = now;
    }
    return (await repo.update('customers', existing.id, patch))!;
  }
  return repo.insert('customers', {
    full_name: b.full_name,
    email: b.email,
    phone: b.phone,
    preferred_contact: 'email',
    consent_contact: true,
    consent_contact_at: now,
    consent_marketing: b.consent_marketing,
    consent_marketing_at: b.consent_marketing ? now : null,
    source: 'booking_form',
  });
}

export interface BookingConfirmation {
  appointment: Appointment;
  practitioner: { id: string; name: string; title: string | null };
  when: string;
  reference: string;
}

export const whenText = (iso: string) => formatMelbourne(iso, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

async function locationLine(): Promise<string> {
  const loc = (await listKnowledge()).find((k) => k.key === 'business.location');
  const address = loc?.status === 'approved' ? (loc.data as { address?: string }).address : '';
  return address ?? '';
}

/** Creates a confirmed appointment. Throws BookingError (409) if the time is no longer free. */
export async function createBooking(raw: unknown, nowMs = Date.now()): Promise<BookingConfirmation> {
  const b = BookingSchema.parse(raw);
  if (b.website) throw new BookingError(400, 'Invalid request');
  const repo = db();

  const service = (await listBookableServices()).find((s) => s.id === b.service_id);
  if (!service) throw new BookingError(404, 'That service cannot be booked online.');
  const startMs = Date.parse(b.start);
  const ymd = melbourneDate(new Date(startMs));
  const today = melbourneDate(new Date(nowMs));
  if (ymd < today || ymd > addDays(today, BOOKING_RULES.horizonDays)) throw new BookingError(422, 'Please choose a time within the next 4 weeks.');

  // Re-derive availability on the server: the requested start must be a slot that is really free right now.
  const candidates = (await listActivePractitioners()).filter((p) => service.practitioners.some((sp) => sp.id === p.id) && (!b.practitioner_id || p.id === b.practitioner_id));
  let practitioner: Practitioner | null = null;
  for (const p of candidates) {
    const free = slotsForDay(ymd, service.duration_minutes, p, await confirmedAppointments(p.id), nowMs);
    if (free.some((s) => Date.parse(s.start) === startMs)) {
      practitioner = p;
      break;
    }
  }
  if (!practitioner) throw new BookingError(409, SLOT_TAKEN);

  const customer = await upsertBookingCustomer(b);
  const endsMs = startMs + service.duration_minutes * 60000;
  let appointment: Appointment;
  try {
    appointment = await repo.insert('appointments', {
      practitioner_id: practitioner.id,
      service_id: service.id,
      service_name: service.name,
      customer_id: customer.id,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endsMs).toISOString(),
      blocked_until: new Date(endsMs + practitioner.buffer_minutes * 60000).toISOString(),
      status: 'confirmed',
      // Card numbers are redacted; the form asks people not to include medical details.
      notes: b.notes ? checkInbound(b.notes).sanitized : null,
      source: 'website',
    });
  } catch (e) {
    // The database's no-overlap rule rejected it: someone else booked the same time a moment earlier.
    if (/23P01|appointments_no_overlap|conflicting key|exclusion/i.test(String(e))) throw new BookingError(409, SLOT_TAKEN);
    throw e;
  }

  const when = whenText(appointment.starts_at);
  await notify({
    type: 'booking_request',
    title: `Booked online: ${service.name} – ${when}`,
    body: `${customer.full_name} booked ${service.name} with ${practitioner.name} for ${when}. This booking is confirmed – no action is needed unless you want to change it.\n${customer.email ?? ''}${customer.phone ? ` · ${customer.phone}` : ''}`,
    linkPath: '/admin/bookings',
  });

  if (customer.email) {
    const address = await locationLine();
    const lines = [`${service.name} (${service.duration_minutes} minutes)`, `With ${practitioner.name}`, when, address].filter(Boolean);
    await sendEmail({
      to: [customer.email],
      subject: `Your ASPARC booking is confirmed – ${when}`,
      text: `Hi ${customer.full_name},\n\nYour booking is confirmed:\n${lines.join('\n')}\n\nNeed to change or cancel? Reply to this email or contact us and we will sort it out.\n\nASPARC`,
      html: emailLayout(
        'Your booking is confirmed',
        `<p>Hi ${customer.full_name.replace(/[&<>"']/g, '')},</p><p>Your booking is confirmed:</p><p>${lines.map((l) => l.replace(/[&<>]/g, '')).join('<br>')}</p><p>Need to change or cancel? Reply to this email or contact us and we will sort it out.</p>`,
      ),
      entityType: 'appointment',
      entityId: appointment.id,
    });
  }

  return {
    appointment,
    practitioner: { id: practitioner.id, name: practitioner.name, title: practitioner.title },
    when,
    reference: appointment.id.slice(0, 8).toUpperCase(),
  };
}

/** Staff changes to an appointment. Cancelling frees the time for other customers. */
export async function updateAppointmentStatus(id: string, status: Appointment['status'], reason?: string | null): Promise<Appointment | null> {
  const repo = db();
  const current = await repo.get('appointments', id);
  if (!current) return null;
  if (status === 'confirmed' && current.status !== 'confirmed') {
    // Re-confirming must not create an overlap.
    const others = (await confirmedAppointments(current.practitioner_id)).filter((a) => a.id !== id);
    const s = Date.parse(current.starts_at);
    const e = Date.parse(current.blocked_until);
    if (others.some((a) => Date.parse(a.starts_at) < e && Date.parse(a.blocked_until) > s)) throw new BookingError(409, 'That time now overlaps another confirmed booking.');
  }
  return repo.update('appointments', id, { status, cancel_reason: status === 'cancelled' ? (reason ?? null) : null });
}
