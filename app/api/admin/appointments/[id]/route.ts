import { z } from 'zod';
import { BookingError, updateAppointmentStatus } from '@/lib/bookings/service';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
const Patch = z.object({ status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']), cancel_reason: z.string().trim().max(500).nullable().optional() }).strict();

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'bookings:write');
  const p = Patch.parse(await readJson(req));
  try {
    const updated = await updateAppointmentStatus((await params).id, p.status, p.cancel_reason);
    return updated ? json({ appointment: updated }) : error('Appointment not found', 404);
  } catch (e) {
    if (e instanceof BookingError) return error(e.message, e.status);
    throw e;
  }
});
