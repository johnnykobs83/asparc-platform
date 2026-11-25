import { z } from 'zod';
import type { Session } from '../auth/session';
import { can } from '../auth/rbac';
import { db } from '../db';
import type { Customer, IntakeForm } from '../db/types';
import { HttpError } from '../http/respond';
import { staffForSession } from '../planner/service';
import { melbourneDate } from '../time/melbourne';
import { formFlag } from './intake';

/**
 * The client database: everyone who has booked, enquired or registered, with
 * their history in one place.
 *
 * Contact details and booking history: every dashboard user.
 * Health forms and client notes: owners and managers, plus the practitioner
 * who has (or had) a booking with that client. Everyone else sees only the
 * form's status flag.
 */

// ------------------------------------------------------------------ access
export async function canSeeHealth(session: Session, customerId: string): Promise<boolean> {
  if (can(session.role, 'clients:health')) return true;
  const staff = await staffForSession(session);
  if (!staff) return false;
  const repo = db();
  const mine = (await repo.list('practitioners', { limit: 200 })).filter((p) => p.staff_member_id === staff.id);
  if (!mine.length) return false;
  const appts = await repo.list('appointments', { eq: { customer_id: customerId }, limit: 1000 });
  return appts.some((a) => mine.some((p) => p.id === a.practitioner_id));
}

export async function requireHealthAccess(session: Session, customerId: string) {
  if (!(await canSeeHealth(session, customerId))) throw new HttpError(403, 'Health forms and notes are only visible to managers and the practitioner seeing this client.');
}

// ------------------------------------------------------------------ list
export interface ClientListRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  sport: string | null;
  club: string | null;
  is_guardian: boolean;
  consent_marketing: boolean;
  source: string;
  created_at: string;
  bookings: number;
  visits: number;
  last_visit: string | null;
  next_visit: string | null;
  enquiries: number;
  form: ReturnType<typeof formFlag>;
}

export async function listClients(opts: { q?: string | null; limit?: number } = {}): Promise<ClientListRow[]> {
  const repo = db();
  const [customers, appts, forms, leads] = await Promise.all([
    repo.list('customers', { orderBy: 'created_at', ascending: false, limit: 5000 }),
    repo.list('appointments', { orderBy: 'starts_at', ascending: false, limit: 10000 }),
    repo.list('intake_forms', { limit: 10000 }).catch(() => [] as IntakeForm[]),
    repo.list('leads', { limit: 10000 }),
  ]);
  const now = Date.now();
  const today = melbourneDate();
  const byCustomer = <T extends { customer_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.customer_id, [...(m.get(r.customer_id) ?? []), r]);
    return m;
  };
  const apptMap = byCustomer(appts);
  const formMap = byCustomer(forms);
  const leadMap = byCustomer(leads);

  const q = opts.q?.trim().toLowerCase();
  const digits = q?.replace(/\D/g, '');
  const rows = customers
    .filter((c) => {
      if (!q) return true;
      const phone = (c.phone ?? '').replace(/\D/g, '');
      return c.full_name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (!!digits && digits.length >= 3 && phone.includes(digits));
    })
    .map((c): ClientListRow => {
      const a = (apptMap.get(c.id) ?? []).filter((x) => x.status !== 'cancelled');
      const past = a.filter((x) => Date.parse(x.starts_at) <= now && x.status !== 'no_show');
      const future = a.filter((x) => Date.parse(x.starts_at) > now && x.status === 'confirmed').sort((x, y) => x.starts_at.localeCompare(y.starts_at));
      return {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        sport: c.sport ?? null,
        club: c.club ?? null,
        is_guardian: c.is_guardian,
        consent_marketing: c.consent_marketing,
        source: c.source,
        created_at: c.created_at,
        bookings: a.length,
        visits: past.length,
        last_visit: past.map((x) => x.starts_at).sort().at(-1) ?? null,
        next_visit: future[0]?.starts_at ?? null,
        enquiries: (leadMap.get(c.id) ?? []).length,
        form: formFlag(formMap.get(c.id) ?? [], today),
      };
    });
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

// ------------------------------------------------------------------ one client
export async function clientDetail(id: string, session: Session) {
  const repo = db();
  const customer = await repo.get('customers', id);
  if (!customer) throw new HttpError(404, 'Client not found');
  const [appts, practitioners, leads, requests, academy, payments, forms] = await Promise.all([
    repo.list('appointments', { eq: { customer_id: id }, orderBy: 'starts_at', ascending: false, limit: 500 }),
    repo.list('practitioners', { limit: 200 }),
    repo.list('leads', { eq: { customer_id: id }, orderBy: 'created_at', ascending: false, limit: 100 }),
    repo.list('booking_requests', { eq: { customer_id: id }, orderBy: 'created_at', ascending: false, limit: 100 }),
    repo.list('academy_registrations', { eq: { guardian_customer_id: id }, orderBy: 'created_at', ascending: false, limit: 100 }),
    repo.list('payments', { eq: { customer_id: id }, orderBy: 'created_at', ascending: false, limit: 200 }),
    repo.list('intake_forms', { eq: { customer_id: id }, orderBy: 'created_at', ascending: false, limit: 100 }).catch(() => [] as IntakeForm[]),
  ]);
  const pName = new Map(practitioners.map((p) => [p.id, p.name]));
  const health = await canSeeHealth(session, id);
  const notes = health ? await repo.list('client_notes', { eq: { customer_id: id }, orderBy: 'created_at', ascending: false, limit: 500 }).catch(() => []) : [];

  const spent = appts
    .filter((a) => a.status === 'completed' || (a.status === 'confirmed' && Date.parse(a.starts_at) <= Date.now()))
    .reduce((s, a) => s + (a.final_price_cents ?? a.price_cents ?? 0), 0);
  const paid = payments.filter((p) => p.status === 'succeeded').reduce((s, p) => s + p.amount_cents - (p.refunded_cents ?? 0), 0);

  return {
    customer,
    form: formFlag(forms),
    health_access: health,
    totals: { bookings: appts.filter((a) => a.status !== 'cancelled').length, booked_value_cents: spent, paid_online_cents: paid },
    appointments: appts.map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      service_name: a.service_name,
      practitioner_name: pName.get(a.practitioner_id) ?? '–',
      status: a.status,
      charge_cents: a.final_price_cents ?? a.price_cents ?? null,
    })),
    enquiries: leads.map((l) => ({ id: l.id, created_at: l.created_at, lead_type: l.lead_type, stage: l.stage, service_interest: l.service_interest, enquiry_details: l.enquiry_details })),
    booking_requests: requests.map((r) => ({ id: r.id, created_at: r.created_at, service_name: r.service_name, status: r.status })),
    academy: academy.map((r) => ({ id: r.id, created_at: r.created_at, athlete: [r.athlete_first_name, r.athlete_last_name].filter(Boolean).join(' '), age_group: r.athlete_age_group, status: r.status, payment_status: r.payment_status })),
    payments: payments.map((p) => ({ id: p.id, paid_at: p.paid_at, description: p.description, amount_cents: p.amount_cents, refunded_cents: p.refunded_cents ?? 0, status: p.status })),
    // Health detail only for those allowed; everyone else gets dates and status.
    forms: forms.map((f) =>
      health
        ? f
        : { id: f.id, status: f.status, sent_at: f.sent_at, submitted_at: f.submitted_at, review_status: f.review_status, valid_until: f.valid_until, expires_at: f.expires_at },
    ),
    notes,
  };
}

// ------------------------------------------------------------------ edit / add
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const ClientFields = {
  full_name: z.string().trim().min(2, 'Enter a name').max(160),
  email: z
    .string()
    .trim()
    .max(254)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || /^[+()\d\s-]{8,20}$/.test(v), 'Enter a valid phone number'),
  preferred_contact: z.enum(['email', 'phone', 'sms', 'whatsapp']).nullable().optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .refine((v) => !v || (v >= '1900-01-01' && v <= melbourneDate()), 'Enter a real date of birth'),
  address: opt(300),
  emergency_contact_name: opt(120),
  emergency_contact_phone: opt(32),
  sport: opt(80),
  club: opt(120),
  is_guardian: z.boolean().optional(),
  consent_marketing: z.boolean().optional(),
};

export const ClientCreate = z
  .object(ClientFields)
  .strict()
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address or a mobile number' });
  });
export const ClientPatch = z.object(ClientFields).partial().strict();

async function assertUniqueEmail(email: string | null | undefined, exceptId?: string) {
  if (!email) return;
  const other = await db().findOne('customers', { email });
  if (other && other.id !== exceptId) throw new HttpError(409, `${other.full_name} already uses that email address. Search for them instead.`);
}

export async function createClient(raw: unknown): Promise<Customer> {
  const v = ClientCreate.parse(raw);
  await assertUniqueEmail(v.email);
  const now = new Date().toISOString();
  return db().insert('customers', {
    ...v,
    preferred_contact: v.preferred_contact ?? (v.email ? 'email' : 'phone'),
    is_guardian: v.is_guardian ?? false,
    // Added by staff because the client asked for a service, so contacting them about it is expected.
    consent_contact: true,
    consent_contact_at: now,
    consent_marketing: v.consent_marketing ?? false,
    consent_marketing_at: v.consent_marketing ? now : null,
    source: 'other',
  } as Partial<Customer> as Customer);
}

export async function updateClient(id: string, raw: unknown): Promise<Customer> {
  const repo = db();
  const current = await repo.get('customers', id);
  if (!current) throw new HttpError(404, 'Client not found');
  const v = ClientPatch.parse(raw);
  if ('email' in v) await assertUniqueEmail(v.email, id);
  const email = 'email' in v ? v.email : current.email;
  const phone = 'phone' in v ? v.phone : current.phone;
  if (!email && !phone) throw new HttpError(422, 'Keep an email address or a mobile number so the client can be contacted.');
  const extra: Partial<Customer> = {};
  if (v.consent_marketing !== undefined && v.consent_marketing !== current.consent_marketing) extra.consent_marketing_at = v.consent_marketing ? new Date().toISOString() : null;
  return (await repo.update('customers', id, { ...v, ...extra }))!;
}

export const NoteInput = z.object({ body: z.string().trim().min(1, 'Write a note').max(4000) }).strict();

export async function addNote(customerId: string, raw: unknown, session: Session) {
  const { body } = NoteInput.parse(raw);
  if (!(await db().get('customers', customerId))) throw new HttpError(404, 'Client not found');
  return db().insert('client_notes', { customer_id: customerId, body, author_id: session.sub, author_name: session.name ?? session.email });
}
