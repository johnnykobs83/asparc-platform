import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { db } from '../db';
import type { Payment } from '../db/types';
import { notify } from '../notifications/service';
import { logIntegration } from './log';

/**
 * PHASE 4 – Stripe payments (webhook only, no SDK).
 *
 * ASPARC never handles card data: customers pay on Stripe-hosted pages
 * (Payment Links / Checkout). Stripe then calls /api/webhooks/stripe and this
 * module records the result in the `payments` table, which is the ONLY source
 * for the Revenue page and the daily summary.
 *
 * Inactive until STRIPE_WEBHOOK_SECRET is set.
 */

const TOLERANCE_SECONDS = 300;

export function stripeWebhookEnabled(): boolean {
  return Boolean(env.stripeWebhookSecret);
}

/**
 * Verifies the `Stripe-Signature` header: `t=<unix>,v1=<hex hmac>[,v1=...]`.
 * The signed payload is `${t}.${rawBody}` using the endpoint's signing secret.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, nowMs = Date.now()): boolean {
  const secret = env.stripeWebhookSecret;
  if (!secret || !header) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = v ?? '';
    if (k === 'v1' && v) signatures.push(v);
  }
  if (!/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const got = Buffer.from(sig, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

interface StripeEvent {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function upsertPayment(ref: string, patch: Partial<Payment>): Promise<{ payment: Payment; previous: Payment | null }> {
  const repo = db();
  const previous = await repo.findOne('payments', { provider_ref: ref });
  if (previous) {
    const updated = await repo.update('payments', previous.id, patch);
    return { payment: updated ?? previous, previous };
  }
  const payment = await repo.insert('payments', { provider: 'stripe', provider_ref: ref, amount_cents: 0, status: 'pending', ...patch });
  return { payment, previous: null };
}

const money = (cents: number, currency: string) => `${currency.toUpperCase()} $${(cents / 100).toFixed(2)}`;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The ASPARC service a Payment Link was made for (its metadata.service_slug, copied onto each Checkout Session). */
async function serviceFor(o: Record<string, unknown>): Promise<{ slug: string | null; name: string | null }> {
  const slug = str(obj(o.metadata).service_slug);
  if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug)) return { slug: null, name: null };
  const service = await db().findOne('services', { slug });
  return { slug, name: service?.name ?? null };
}

/** Answers to the Payment Link's custom fields, e.g. "Athlete: Sam Lee · Age group: 14–16". */
function customFieldText(session: Record<string, unknown>): string {
  const fields = Array.isArray(session.custom_fields) ? session.custom_fields : [];
  return fields
    .map((f) => {
      const field = obj(f);
      const label = str(obj(field.label).custom) ?? str(field.key) ?? '';
      let value = str(obj(field.text).value) ?? str(obj(field.numeric).value);
      const dropdown = obj(field.dropdown);
      const chosen = str(dropdown.value);
      if (chosen) {
        const opts = Array.isArray(dropdown.options) ? dropdown.options.map(obj) : [];
        value = str(opts.find((o) => o.value === chosen)?.label) ?? chosen;
      }
      return value ? `${label.replace(/^Athlete's full name$/i, 'Athlete')}: ${value.slice(0, 120)}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** GST on an invoice: `total_taxes` on current API versions, `tax` on older ones. */
function invoiceTax(inv: Record<string, unknown>): number | null {
  if (Array.isArray(inv.total_taxes)) return inv.total_taxes.reduce((sum: number, t) => sum + (num(obj(t).amount) ?? 0), 0);
  return num(inv.tax);
}

/** Checkout Session events (Payment Links also produce these). */
async function onCheckoutSession(type: string, session: Record<string, unknown>, eventCreated: number | undefined) {
  const ref = str(session.payment_intent) ?? str(session.id);
  if (!ref) return 'ignored: no reference';
  const amount = num(session.amount_total) ?? 0;
  const currency = str(session.currency) ?? 'aud';
  const details = (session.customer_details ?? {}) as Record<string, unknown>;
  const email = str(details.email)?.toLowerCase() ?? null;
  const customer = email ? await db().findOne('customers', { email }) : null;
  const service = await serviceFor(session);
  const extra = customFieldText(session);
  const description = [service.name ?? 'Online payment (Stripe Checkout)', extra].filter(Boolean).join(' – ');

  let status: Payment['status'];
  if (type === 'checkout.session.async_payment_failed') status = 'failed';
  else if (type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid') status = 'succeeded';
  else status = 'pending'; // e.g. bank debit still processing

  const { payment, previous } = await upsertPayment(ref, {
    customer_id: customer?.id ?? null,
    description,
    service_slug: service.slug,
    tax_cents: num(obj(session.total_details).amount_tax),
    amount_cents: amount,
    currency,
    status,
    paid_at: status === 'succeeded' ? new Date((eventCreated ?? Date.now() / 1000) * 1000).toISOString() : null,
  });

  // Notify once, when a payment first becomes successful. Staff still confirm the booking/registration.
  if (status === 'succeeded' && previous?.status !== 'succeeded') {
    await notify({
      type: 'payment_confirmation',
      title: `Payment received: ${money(payment.amount_cents, payment.currency)}${service.name ? ` – ${service.name}` : ''}`,
      body: `Stripe reports a successful payment${customer ? ` from ${customer.full_name}` : email ? ` from ${email}` : ''}${extra ? ` (${extra})` : ''}. This does not confirm a booking or registration – please confirm it with the customer.`,
      linkPath: '/admin/revenue',
    });
  }
  return `payment ${status}`;
}

async function onChargeRefunded(charge: Record<string, unknown>) {
  const ref = str(charge.payment_intent);
  if (!ref) return 'ignored: no payment_intent';
  const existing = await db().findOne('payments', { provider_ref: ref });
  if (!existing) return 'ignored: unknown payment';
  // amount_refunded is the running total, so a redelivered event changes nothing.
  const refunded = Math.min(existing.amount_cents, num(charge.amount_refunded) ?? 0);
  if (charge.refunded === true) {
    await db().update('payments', existing.id, { status: 'refunded', refunded_cents: existing.amount_cents });
    return 'payment refunded';
  }
  await db().update('payments', existing.id, { refunded_cents: refunded });
  return 'payment partly refunded';
}

/**
 * Invoices sent from the Stripe Dashboard (e.g. to clubs). The invoice id is the
 * payment's reference. A payment never confirms anything for the customer.
 */
async function onInvoice(type: string, inv: Record<string, unknown>, eventCreated: number | undefined) {
  const ref = str(inv.id);
  if (!ref) return 'ignored: no invoice id';
  const label = `Invoice ${str(inv.number) ?? ref}${str(inv.customer_name) ? ` – ${str(inv.customer_name)}` : ''}`;

  if (type === 'invoice.payment_failed') {
    await notify({
      type: 'payment_confirmation',
      title: `Invoice payment failed: ${label}`,
      body: 'Stripe could not collect this invoice payment. Stripe keeps the invoice open; check it in the Stripe Dashboard and follow up with the customer.',
      linkPath: '/admin/revenue',
    });
    return 'invoice payment failed';
  }

  if (type === 'invoice.updated') {
    // Credit notes issued after payment reduce what the invoice brought in. The amount is a running total.
    const existing = await db().findOne('payments', { provider_ref: ref });
    if (!existing) return 'ignored: invoice not paid';
    const credited = Math.min(existing.amount_cents, num(inv.post_payment_credit_notes_amount) ?? 0);
    if (credited === (existing.refunded_cents ?? 0)) return 'ignored: no change';
    await db().update('payments', existing.id, { refunded_cents: credited, status: credited >= existing.amount_cents ? 'refunded' : existing.status });
    return 'invoice credit recorded';
  }

  // invoice.paid
  const amount = num(inv.amount_paid) ?? num(inv.total) ?? 0;
  if (amount <= 0) return 'ignored: nothing paid';
  const email = str(inv.customer_email)?.toLowerCase() ?? null;
  const customer = email ? await db().findOne('customers', { email }) : null;
  const paidAt = num(obj(inv.status_transitions).paid_at) ?? eventCreated ?? Date.now() / 1000;
  const { payment, previous } = await upsertPayment(ref, {
    customer_id: customer?.id ?? null,
    description: label,
    tax_cents: invoiceTax(inv),
    amount_cents: amount,
    currency: str(inv.currency) ?? 'aud',
    status: 'succeeded',
    paid_at: new Date(paidAt * 1000).toISOString(),
  });
  if (previous?.status !== 'succeeded') {
    await notify({
      type: 'payment_confirmation',
      title: `Invoice paid: ${money(payment.amount_cents, payment.currency)} – ${label}`,
      body: 'Stripe reports this invoice as paid.',
      linkPath: '/admin/revenue',
    });
  }
  return 'invoice paid';
}

/** Processes a verified Stripe event. Idempotent: Stripe may deliver an event more than once. */
export async function handleStripeEvent(event: StripeEvent): Promise<{ handled: boolean; outcome: string }> {
  const object = event.data?.object ?? {};
  let outcome: string;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
        outcome = await onCheckoutSession(event.type, object, event.created);
        break;
      case 'charge.refunded':
        outcome = await onChargeRefunded(object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.updated':
        outcome = await onInvoice(event.type, object, event.created);
        break;
      default:
        return { handled: false, outcome: 'ignored: event type not used' };
    }
  } catch (e) {
    await logIntegration({ integration: 'stripe', action: event.type, status: 'error', error: String(e) });
    throw e;
  }
  await logIntegration({ integration: 'stripe', action: event.type, status: 'success', detail: { outcome } });
  return { handled: true, outcome };
}
