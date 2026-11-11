import { z } from 'zod';
import { BookingError, moveAppointment, setAppointmentPrice, updateAppointmentStatus } from '@/lib/bookings/service';
import type { Appointment } from '@/lib/db/types';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** One change per request: a status, a move to a new day/time, or a price adjustment. */
const Patch = z
  .object({
    status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
    cancel_reason: z.string().trim().max(500).nullable().optional(),
    /** New start in Melbourne local time: a calendar date and minutes from midnight. */
    move: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), minutes: z.number().int().min(0).max(1435) }).strict().optional(),
    /** Price charged after a discount or adjustment, in cents. null restores the list price. */
    price: z.object({ final_price_cents: z.number().int().min(0).max(1_000_000).nullable(), note: z.string().trim().max(300).nullable().optional() }).strict().optional(),
  })
  .strict()
  .refine((v) => [v.status, v.move, v.price].filter((x) => x !== undefined).length === 1, 'Send exactly one of status, move or price');

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'bookings:write');
  const p = Patch.parse(await readJson(req));
  const id = (await params).id;
  try {
    let updated: Appointment | null;
    if (p.move) updated = await moveAppointment(id, p.move.date, p.move.minutes);
    else if (p.price) updated = await setAppointmentPrice(id, p.price.final_price_cents, p.price.note ?? null);
    else updated = await updateAppointmentStatus(id, p.status!, p.cancel_reason);
    return updated ? json({ appointment: updated }) : error('Appointment not found', 404);
  } catch (e) {
    if (e instanceof BookingError) return error(e.message, e.status);
    throw e;
  }
});
