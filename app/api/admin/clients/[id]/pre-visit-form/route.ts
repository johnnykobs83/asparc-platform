import { z } from 'zod';
import { sendIntakeForm } from '@/lib/clients/intake';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/**
 * Sends a new pre-visit form (any older unfinished one stops working).
 * { email: true } emails the link; { email: false } just makes a link to copy and send another way.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin(req, 'clients:write');
  const { email } = z.object({ email: z.boolean().default(true) }).strict().parse(await readJson(req, 2_000));
  const customer = await db().get('customers', (await params).id);
  if (!customer) return error('Client not found', 404);
  if (email && !customer.email) return error('This client has no email address. Copy the link instead, or add their email first.', 422);
  const r = await sendIntakeForm(customer, { reason: 'manual', sentBy: session.email, email });
  return json({ link: r.link, email: r.email, expires_at: r.form.expires_at }, 201);
});
