import { handleStripeEvent, stripeWebhookEnabled, verifyStripeSignature } from '@/lib/integrations/stripe';
import { error, handler, json } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/**
 * PHASE 4 – Stripe webhook. Inactive (503) until STRIPE_WEBHOOK_SECRET is set.
 * Every request must carry a valid Stripe signature; nothing else is trusted.
 */
export const POST = handler(async (req) => {
  if (!stripeWebhookEnabled()) return error('Stripe payments are not enabled', 503);
  const raw = await req.text();
  if (raw.length > 500_000) return error('Request too large', 413);
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'))) return error('Invalid signature', 401);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return error('Invalid JSON', 400);
  }
  if (!event || typeof event.type !== 'string' || !event.data) return error('Invalid event', 400);
  const result = await handleStripeEvent(event);
  return json({ received: true, ...result });
});
