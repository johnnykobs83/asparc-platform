import { listWithCustomer } from '@/lib/admin/service';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json({ bookings: await listWithCustomer('booking_requests') });
});
