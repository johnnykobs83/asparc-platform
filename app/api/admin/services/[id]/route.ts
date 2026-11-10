import { z } from 'zod';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { ServiceFields } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'services:write');
  const id = (await params).id;
  const p = z.object(ServiceFields).partial().strict().parse(await readJson(req));
  const current = await db().get('services', id);
  if (!current) return error('Service not found', 404);
  const next = { ...current, ...p };
  if (next.price_status !== 'on_enquiry' && next.price_cents == null) return error('Draft or approved pricing needs a price', 422, { fields: { price_cents: 'Enter a price' } });
  if (next.payment_link_url && next.price_status !== 'approved') return error('Payment links can only be attached to approved pricing', 422, { fields: { payment_link_url: 'Approve the price first' } });
  return json({ service: await db().update('services', id, p) });
});
