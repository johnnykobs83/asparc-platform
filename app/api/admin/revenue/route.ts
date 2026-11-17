import { env } from '@/lib/config/env';
import { db } from '@/lib/db';
import { netCents } from '@/lib/db/types';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
/** Revenue comes ONLY from real payment records (Stripe webhook, Phase 4). No estimates. */
export const GET = handler(async (req) => {
  await requireAdmin(req, 'revenue:view');
  if (!env.stripeKey && !env.stripeWebhookSecret) return json({ connected: false, payments: [], totalCents: 0 });
  const payments = await db().list('payments', { limit: 500 });
  const totalCents = payments.reduce((s, p) => s + netCents(p), 0);
  const gstCents = payments.filter((p) => p.status === 'succeeded').reduce((s, p) => s + (p.tax_cents ?? 0), 0);
  return json({ connected: true, payments, totalCents, gstCents });
});
