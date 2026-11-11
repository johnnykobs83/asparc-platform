import { listAppointmentsForAdmin } from '@/lib/bookings/admin';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin(req);
  try {
    return json({ ready: true, appointments: await listAppointmentsForAdmin() });
  } catch {
    // The bookings tables have not been created in the database yet.
    return json({ ready: false, appointments: [] });
  }
});
