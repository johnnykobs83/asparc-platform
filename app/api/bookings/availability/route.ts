import { BookingError, getAvailability } from '@/lib/bookings/service';
import { clientIp, error, handler, json } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Free start times for a service: ?service=<id>&from=YYYY-MM-DD&days=7&practitioner=<id> */
export const GET = handler(async (req) => {
  const rl = rateLimit(`availability:${clientIp(req)}`, 120, 10 * 60_000);
  if (!rl.ok) return error('Too many requests. Please try again shortly.', 429);
  const p = new URL(req.url).searchParams;
  const service = p.get('service') ?? '';
  const practitioner = p.get('practitioner');
  if (!UUID.test(service) || (practitioner && !UUID.test(practitioner))) return error('Invalid request', 400);
  try {
    // Only free start times are returned – details of existing bookings are never exposed.
    return json(await getAvailability(service, p.get('from'), Number(p.get('days')) || 7, practitioner || null));
  } catch (e) {
    if (e instanceof BookingError) return error(e.message, e.status);
    throw e;
  }
});
