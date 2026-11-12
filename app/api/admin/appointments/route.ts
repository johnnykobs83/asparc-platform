import { listAppointmentsForAdmin } from '@/lib/bookings/admin';
import { BookingError } from '@/lib/bookings/service';
import { createStaffBooking } from '@/lib/bookings/staff';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { isResendConfigured } from '@/lib/integrations/resend';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin(req);
  // email_ready tells the dashboard whether customers will be emailed about changes.
  const email_ready = isResendConfigured();
  try {
    return json({ ready: true, email_ready, appointments: await listAppointmentsForAdmin() });
  } catch {
    // The bookings tables have not been created in the database yet.
    return json({ ready: false, email_ready, appointments: [] });
  }
});

/** Staff add a booking straight onto the schedule. The customer is emailed a confirmation. */
export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'bookings:write');
  try {
    const { appointment, customerEmail } = await createStaffBooking(await readJson(req, 8_000), session.email);
    return json({ appointment, customer_email: customerEmail }, 201);
  } catch (e) {
    if (e instanceof BookingError) return error(e.message, e.status);
    throw e;
  }
});
