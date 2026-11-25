import { reviewIntake } from '@/lib/clients/intake';
import { requireHealthAccess } from '@/lib/clients/service';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Records the review of a form with screening flags: cleared (e.g. GP clearance received) or not cleared. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin(req, 'clients:view');
  const id = (await params).id;
  const form = await db().get('intake_forms', id);
  if (!form) return error('Form not found', 404);
  await requireHealthAccess(session, form.customer_id);
  return json({ form: await reviewIntake(id, await readJson(req, 4_000), session.name ?? session.email) });
});
