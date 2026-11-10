import { z } from 'zod';
import { db } from '@/lib/db';
import { changeLeadStage } from '@/lib/leads/service';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
const Patch = z.object({
  status: z.enum(['requested', 'in_progress', 'confirmed_by_staff', 'declined', 'cancelled']).optional(),
  external_ref: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

/** Only a staff member can mark a booking confirmed – the system never auto-confirms. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireAdmin(req, 'bookings:write');
  const p = Patch.parse(await readJson(req));
  const id = (await params).id;
  const updated = await db().update('booking_requests', id, p);
  if (!updated) return error('Booking request not found', 404);
  if (p.status === 'confirmed_by_staff' && updated.lead_id) await changeLeadStage(updated.lead_id, 'converted', s.email);
  return json({ booking: updated });
});
