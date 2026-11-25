import { z } from 'zod';
import { db } from '../db';
import { BILLING_MODELS, CLIENT_KINDS, type Client, type ClientAgreement, type ClientInvoice } from '../db/types';
import { HttpError } from '../http/respond';
import { addDays, melbourneDate } from '../time/melbourne';
import { isYmd, melbourneLocal } from '../planner/time';

/**
 * Client billing – OWNER ONLY (permission 'finance:manage', RLS is_owner()).
 * What each club or client has agreed to, what's been invoiced, what's been
 * paid and what is overdue. Stripe invoices update themselves through the
 * webhook (syncStripeInvoice); bank transfers and cash are marked paid by hand.
 * Money is integer cents, GST inclusive.
 */

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const ymd = z.string().refine(isYmd, 'Use a date like 2026-12-01');
const cents = z.number().int().min(0).max(100_000_000);

export const ClientInput = z.object({
  name: z.string().trim().min(2, 'Enter the club or client name').max(160),
  kind: z.enum(CLIENT_KINDS).default('club'),
  abn: z.preprocess(blankToNull, z.string().trim().regex(/^[\d ]{11,14}$/, 'An ABN is 11 digits').nullable().optional()),
  contact_name: optText(120),
  billing_email: z.preprocess(blankToNull, z.string().trim().email('Enter a valid email').max(200).nullable().optional()),
  phone: optText(40),
  stripe_customer_id: z.preprocess(blankToNull, z.string().trim().regex(/^cus_[A-Za-z0-9]+$/, 'Stripe customer IDs start with cus_').nullable().optional()),
  status: z.enum(['prospect', 'active', 'paused', 'ended']).default('active'),
  notes: optText(4000),
});
export const ClientPatch = ClientInput.partial();

export const AgreementInput = z
  .object({
    client_id: z.string().uuid(),
    title: z.string().trim().min(2, 'Give the agreement a name').max(160),
    billing_model: z.enum(BILLING_MODELS),
    rate_cents: cents,
    agreed_value_cents: cents.nullable().optional(),
    start_date: ymd,
    end_date: z.preprocess(blankToNull, ymd.nullable().optional()),
    payment_terms_days: z.number().int().min(0).max(120).default(14),
    inclusions: optText(2000),
    status: z.enum(['proposed', 'active', 'ended']).default('active'),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { message: 'The end date can’t be before the start date', path: ['end_date'] });
export const AgreementPatch = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  billing_model: z.enum(BILLING_MODELS).optional(),
  rate_cents: cents.optional(),
  agreed_value_cents: cents.nullable().optional(),
  start_date: ymd.optional(),
  end_date: z.preprocess(blankToNull, ymd.nullable().optional()),
  payment_terms_days: z.number().int().min(0).max(120).optional(),
  inclusions: optText(2000),
  status: z.enum(['proposed', 'active', 'ended']).optional(),
});

export const InvoiceInput = z
  .object({
    client_id: z.string().uuid(),
    agreement_id: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
    number: z.string().trim().min(1, 'Enter the invoice number').max(60),
    issued_on: ymd,
    due_on: ymd,
    amount_cents: cents,
    gst_cents: cents.optional(),
    notes: optText(2000),
  })
  .refine((v) => v.due_on >= v.issued_on, { message: 'The due date can’t be before the issue date', path: ['due_on'] });

export const InvoicePatch = z.object({
  /** Record a payment (bank transfer, cash…). amount defaults to everything still owing. */
  payment: z.object({ amount_cents: cents.optional(), paid_on: ymd.optional(), method: z.enum(['bank_transfer', 'cash', 'stripe', 'other']).default('bank_transfer') }).optional(),
  void: z.boolean().optional(),
  number: z.string().trim().min(1).max(60).optional(),
  due_on: ymd.optional(),
  amount_cents: cents.optional(),
  notes: optText(2000),
});

/** GST included in a GST-inclusive amount (1/11th), rounded to the cent. */
export const gstOf = (inclusiveCents: number) => Math.round(inclusiveCents / 11);

// ------------------------------------------------------------------ balances
export type InvoiceState = 'paid' | 'part_paid' | 'due' | 'overdue' | 'void';
export function invoiceState(inv: Pick<ClientInvoice, 'status' | 'amount_cents' | 'amount_paid_cents' | 'due_on'>, today = melbourneDate()): InvoiceState {
  if (inv.status === 'void') return 'void';
  if (inv.amount_paid_cents >= inv.amount_cents) return 'paid';
  if (inv.due_on < today) return 'overdue';
  return inv.amount_paid_cents > 0 ? 'part_paid' : 'due';
}
const owing = (i: ClientInvoice) => (i.status === 'void' ? 0 : Math.max(0, i.amount_cents - i.amount_paid_cents));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export interface ClientSummary {
  client: Client;
  agreements: ClientAgreement[];
  agreed_cents: number;
  invoiced_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  overdue_cents: number;
  oldest_overdue_days: number;
  next_due_on: string | null;
  status: 'paid_up' | 'due' | 'overdue' | 'no_invoices';
}

function summarise(client: Client, agreements: ClientAgreement[], invoices: ClientInvoice[], today: string): ClientSummary {
  const live = invoices.filter((i) => i.status !== 'void');
  const overdue = live.filter((i) => invoiceState(i, today) === 'overdue');
  const outstanding = live.reduce((s, i) => s + owing(i), 0);
  const nextDue = live.filter((i) => owing(i) > 0 && i.due_on >= today).map((i) => i.due_on).sort()[0] ?? null;
  return {
    client,
    agreements,
    agreed_cents: agreements.filter((a) => a.status !== 'proposed').reduce((s, a) => s + (a.agreed_value_cents ?? 0), 0),
    invoiced_cents: live.reduce((s, i) => s + i.amount_cents, 0),
    paid_cents: live.reduce((s, i) => s + Math.min(i.amount_paid_cents, i.amount_cents), 0),
    outstanding_cents: outstanding,
    overdue_cents: overdue.reduce((s, i) => s + owing(i), 0),
    oldest_overdue_days: overdue.reduce((m, i) => Math.max(m, daysBetween(i.due_on, today)), 0),
    next_due_on: nextDue,
    status: !live.length ? 'no_invoices' : overdue.length ? 'overdue' : outstanding > 0 ? 'due' : 'paid_up',
  };
}

export async function financeOverview(today = melbourneDate()) {
  const repo = db();
  const [clients, agreements, invoices] = await Promise.all([
    repo.list('clients', { orderBy: 'name', ascending: true, limit: 1000 }),
    repo.list('client_agreements', { limit: 2000 }),
    repo.list('client_invoices', { limit: 5000 }),
  ]);
  const rows = clients.map((c) =>
    summarise(
      c,
      agreements.filter((a) => a.client_id === c.id),
      invoices.filter((i) => i.client_id === c.id),
      today,
    ),
  );
  const aged = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
  for (const i of invoices) {
    const o = owing(i);
    if (!o) continue;
    const late = daysBetween(i.due_on, today);
    if (late <= 0) aged.current += o;
    else if (late <= 30) aged.d1_30 += o;
    else if (late <= 60) aged.d31_60 += o;
    else aged.d61_plus += o;
  }
  const sum = (k: keyof Pick<ClientSummary, 'agreed_cents' | 'invoiced_cents' | 'paid_cents' | 'outstanding_cents' | 'overdue_cents'>) => rows.reduce((s, r) => s + r[k], 0);
  return {
    today,
    totals: { agreed_cents: sum('agreed_cents'), invoiced_cents: sum('invoiced_cents'), paid_cents: sum('paid_cents'), outstanding_cents: sum('outstanding_cents'), overdue_cents: sum('overdue_cents') },
    aged,
    clients: rows,
  };
}

/** One client: agreements, invoices with their state, and the planner sessions delivered for them by month. */
export async function clientDetail(id: string, today = melbourneDate()) {
  const repo = db();
  const client = await repo.get('clients', id);
  if (!client) throw new HttpError(404, 'Client not found');
  const [agreements, invoices, jobs] = await Promise.all([
    repo.list('client_agreements', { eq: { client_id: id }, orderBy: 'start_date', ascending: false }),
    repo.list('client_invoices', { eq: { client_id: id }, orderBy: 'issued_on', ascending: false, limit: 1000 }),
    repo.list('planner_jobs', { eq: { client_id: id }, orderBy: 'starts_at', ascending: false, limit: 2000 }),
  ]);
  const now = Date.now();
  const delivered = new Map<string, number>();
  let upcoming = 0;
  for (const j of jobs) {
    if (j.status !== 'scheduled') continue;
    if (Date.parse(j.ends_at) <= now) {
      const month = melbourneLocal(j.starts_at).ymd.slice(0, 7);
      delivered.set(month, (delivered.get(month) ?? 0) + 1);
    } else upcoming++;
  }
  return {
    ...summarise(client, agreements, invoices, today),
    invoices: invoices.map((i) => ({ ...i, state: invoiceState(i, today), owing_cents: owing(i) })),
    sessions: { by_month: [...delivered.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, count]) => ({ month, count })), upcoming },
  };
}

// ------------------------------------------------------------------ writes
export async function createClient(input: z.infer<typeof ClientInput>) {
  if (input.stripe_customer_id && (await db().findOne('clients', { stripe_customer_id: input.stripe_customer_id }))) throw new HttpError(422, 'Another client already uses that Stripe customer ID');
  return db().insert('clients', input);
}

export async function updateClient(id: string, patch: z.infer<typeof ClientPatch>) {
  if (patch.stripe_customer_id) {
    const other = await db().findOne('clients', { stripe_customer_id: patch.stripe_customer_id });
    if (other && other.id !== id) throw new HttpError(422, `${other.name} already uses that Stripe customer ID`);
  }
  const c = await db().update('clients', id, patch);
  if (!c) throw new HttpError(404, 'Client not found');
  return c;
}

export async function createAgreement(input: z.infer<typeof AgreementInput>) {
  if (!(await db().get('clients', input.client_id))) throw new HttpError(422, 'Client not found');
  return db().insert('client_agreements', { ...input, end_date: input.end_date ?? null, agreed_value_cents: input.agreed_value_cents ?? null, inclusions: input.inclusions ?? null });
}

export async function updateAgreement(id: string, patch: z.infer<typeof AgreementPatch>) {
  const current = await db().get('client_agreements', id);
  if (!current) throw new HttpError(404, 'Agreement not found');
  const end = patch.end_date === undefined ? current.end_date : patch.end_date;
  if (end && end < (patch.start_date ?? current.start_date)) throw new HttpError(422, 'The end date can’t be before the start date');
  return (await db().update('client_agreements', id, patch))!;
}

export async function createInvoice(input: z.infer<typeof InvoiceInput>) {
  const repo = db();
  if (!(await repo.get('clients', input.client_id))) throw new HttpError(422, 'Client not found');
  if (input.agreement_id) {
    const a = await repo.get('client_agreements', input.agreement_id);
    if (!a || a.client_id !== input.client_id) throw new HttpError(422, 'That agreement belongs to another client');
  }
  const dupe = (await repo.list('client_invoices', { eq: { client_id: input.client_id, number: input.number } })).length;
  if (dupe) throw new HttpError(422, `Invoice ${input.number} is already recorded for this client`);
  return repo.insert('client_invoices', { ...input, agreement_id: input.agreement_id ?? null, gst_cents: input.gst_cents ?? gstOf(input.amount_cents), notes: input.notes ?? null });
}

export async function updateInvoice(id: string, patch: z.infer<typeof InvoicePatch>) {
  const repo = db();
  const inv = await repo.get('client_invoices', id);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (patch.void) return (await repo.update('client_invoices', id, { status: 'void' }))!;
  if (inv.status === 'void') throw new HttpError(422, 'This invoice has been voided');
  const next: Partial<ClientInvoice> = {};
  if (patch.number) next.number = patch.number;
  if (patch.notes !== undefined) next.notes = patch.notes ?? null;
  if (patch.due_on) {
    if (patch.due_on < inv.issued_on) throw new HttpError(422, 'The due date can’t be before the issue date');
    next.due_on = patch.due_on;
  }
  if (patch.amount_cents !== undefined) {
    if (inv.stripe_invoice_id) throw new HttpError(422, 'Change Stripe invoices in Stripe – they update here by themselves');
    next.amount_cents = patch.amount_cents;
    next.gst_cents = gstOf(patch.amount_cents);
  }
  const amount = next.amount_cents ?? inv.amount_cents;
  if (patch.payment) {
    const add = patch.payment.amount_cents ?? Math.max(0, amount - inv.amount_paid_cents);
    if (add <= 0) throw new HttpError(422, 'Nothing is owing on this invoice');
    next.amount_paid_cents = Math.min(amount, inv.amount_paid_cents + add);
    next.method = patch.payment.method;
    next.paid_on = patch.payment.paid_on ?? melbourneDate();
  }
  const paid = next.amount_paid_cents ?? inv.amount_paid_cents;
  next.status = paid >= amount ? 'paid' : 'open';
  return (await repo.update('client_invoices', id, next))!;
}

// ------------------------------------------------------------------ Stripe (called from the webhook)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const unixToYmd = (s: number | null) => (s ? melbourneDate(new Date(s * 1000)) : null);

/**
 * Keeps client_invoices in step with Stripe for clients whose Stripe customer ID is on file.
 * Invoices for other customers are ignored here (they still reach Revenue through payments).
 */
export async function syncStripeInvoice(type: string, inv: Record<string, unknown>): Promise<string> {
  const stripeId = str(inv.id);
  const customerId = str(inv.customer);
  if (!stripeId || !customerId) return 'client billing: no invoice or customer id';
  const repo = db();
  let client: Client | null = null;
  try {
    client = await repo.findOne('clients', { stripe_customer_id: customerId });
  } catch {
    return 'client billing: tables not created yet';
  }
  if (!client) return 'client billing: customer not linked to a client';
  const existing = await repo.findOne('client_invoices', { stripe_invoice_id: stripeId });
  const total = num(inv.total) ?? num(inv.amount_due) ?? 0;
  const paid = num(inv.amount_paid) ?? 0;
  const transitions = (inv.status_transitions ?? {}) as Record<string, unknown>;
  const issued = unixToYmd(num(transitions.finalized_at) ?? num(inv.created)) ?? melbourneDate();
  const due = unixToYmd(num(inv.due_date)) ?? issued;
  const tax = num(inv.total_taxes) ?? (Array.isArray(inv.total_taxes) ? (inv.total_taxes as { amount?: number }[]).reduce((s, t) => s + (t.amount ?? 0), 0) : null) ?? num(inv.tax);
  const fields: Partial<ClientInvoice> = {
    client_id: client.id,
    number: str(inv.number) ?? stripeId,
    issued_on: issued,
    due_on: due < issued ? issued : due,
    amount_cents: total,
    gst_cents: tax ?? gstOf(total),
    amount_paid_cents: Math.min(paid, total),
    hosted_invoice_url: str(inv.hosted_invoice_url),
    status: type === 'invoice.voided' || inv.status === 'void' ? 'void' : paid >= total && total > 0 ? 'paid' : 'open',
    ...(paid > 0 ? { method: 'stripe' as const, paid_on: unixToYmd(num(transitions.paid_at)) ?? melbourneDate() } : {}),
  };
  if (existing) {
    await repo.update('client_invoices', existing.id, fields);
    return `client billing: invoice ${fields.status}`;
  }
  if (type === 'invoice.voided') return 'client billing: void invoice not on file';
  await repo.insert('client_invoices', { ...fields, stripe_invoice_id: stripeId });
  return `client billing: invoice recorded (${fields.status})`;
}

/** Due dates for a new invoice from an agreement's payment terms. */
export const dueFrom = (issuedOn: string, termsDays: number) => addDays(issuedOn, termsDays);
