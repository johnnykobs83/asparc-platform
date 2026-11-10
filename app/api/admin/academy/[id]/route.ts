import { z } from 'zod';
import { db } from '@/lib/db';
import { changeLeadStage } from '@/lib/leads/service';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
const Patch = z.object({
  status: z.enum(['enquiry', 'registration_submitted', 'waitlist', 'offered', 'enrolled', 'withdrawn']).optional(),
  program_term: z.string().max(120).nullable().optional(),
}).strict();

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireAdmin(req, 'academy:write');
  const p = Patch.parse(await readJson(req));
  const updated = await db().update('academy_registrations', (await params).id, p);
  if (!updated) return error('Registration not found', 404);
  if (updated.lead_id && p.status === 'enrolled') await changeLeadStage(updated.lead_id, 'converted', s.email);
  if (updated.lead_id && p.status === 'withdrawn') await changeLeadStage(updated.lead_id, 'not_proceeding', s.email);
  return json({ registration: updated });
});
