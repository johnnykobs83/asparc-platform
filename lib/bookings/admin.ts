import { z } from 'zod';
import { db } from '../db';
import { normaliseWeeklyHours } from './service';

const Window = z.object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) }).refine((w) => w.start < w.end, 'End time must be after start time');

const Fields = {
  name: z.string().trim().min(2, 'Enter a name').max(120),
  title: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  service_ids: z.array(z.string().uuid()).max(100),
  /** Keys '0'–'6' (0 = Sunday); minutes from midnight, Melbourne time. */
  weekly_hours: z.record(z.string().regex(/^[0-6]$/), z.array(Window).max(4)).transform((v) => normaliseWeeklyHours(v)),
  buffer_minutes: z.number().int().min(0).max(120),
  active: z.boolean(),
};

/** Dashboard input when adding a practitioner. */
export const PractitionerCreate = z
  .object({
    ...Fields,
    service_ids: Fields.service_ids.default([]),
    weekly_hours: Fields.weekly_hours.default({}),
    buffer_minutes: Fields.buffer_minutes.default(0),
    active: Fields.active.default(true),
  })
  .strict();

/** Dashboard input when editing a practitioner – only the fields sent are changed. */
export const PractitionerPatch = z.object(Fields).partial().strict();

/** Upcoming and recent appointments with the customer and practitioner names staff need. */
export async function listAppointmentsForAdmin() {
  const repo = db();
  const [appointments, practitioners] = await Promise.all([
    repo.list('appointments', { orderBy: 'starts_at', ascending: false, limit: 500 }),
    repo.list('practitioners', { limit: 200 }),
  ]);
  const pName = new Map(practitioners.map((p) => [p.id, p.name]));
  const customerIds = [...new Set(appointments.map((a) => a.customer_id))];
  const found = await Promise.all(customerIds.map((id) => repo.get('customers', id)));
  const customers = new Map(found.filter((c) => c !== null).map((c) => [c.id, c]));
  return appointments.map((a) => {
    const c = customers.get(a.customer_id);
    return { ...a, practitioner_name: pName.get(a.practitioner_id) ?? 'Unknown', customer: c ? { full_name: c.full_name, email: c.email, phone: c.phone } : null };
  });
}
