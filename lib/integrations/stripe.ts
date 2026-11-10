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

/** Checkout Session events (Payment Links also produce these). */
async function onCheckoutSession(type: string, session: Record<string, unknown>, eventCreated: number | undefined) {
  const ref = str(session.payment_intent) ?? str(session.id);
  if (!ref) return 'ignored: no reference';
  const amount = num(session.amount_total) ?? 0;
  const currency = str(session.currency) ?? 'aud';
  const details = (session.customer_details ?? {}) as Record<string, unknown>;
  const email = str(details.email)?.toLowerCase() ?? null;
  const customer = email ? await db().findOne('customers', { email }) : null;

  let status: Payment['status'];
  if (type === 'checkout.session.async_payment_failed') status = 'failed';
  else if (type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid') status = 'succeeded';
  else status = 'pending'; // e.g. bank debit still processing

  const { payment, previous } = await upsertPayment(ref, {
    customer_id: customer?.id ?? null,
    description: 'Online payment (Stripe Checkout)',
    amount_cents: amount,
    currency,
    status,
    paid_at: status === 'succeeded' ? new Date((eventCreated ?? Date.now() / 1000) * 1000).toISOString() : null,
  });

  // Notify once, when a payment first becomes successful. Staff still confirm the booking/registration.
  if (status === 'succeeded' && previous?.status !== 'succeeded') {
    await notify({
      type: 'payment_confirmation',
      title: `Payment received: ${money(payment.amount_cents, payment.currency)}`,
      body: `Stripe reports a successful payment${customer ? ` from ${customer.full_name}` : ''}. This does not confirm a booking or registration – please confirm it with the customer.`,
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
  // Only a full refund changes the status; partial refunds stay "succeeded".
  if (charge.refunded !== true) return 'ignored: partial refund';
  await db().update('payments', existing.id, { status: 'refunded' });
  return 'payment refunded';
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
