import { BookingError, createBooking, listBookableServices } from '@/lib/bookings/service';
import { clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';

/** Services that can be booked online right now (empty when no practitioners are set up). */
export const GET = handler(async () => json({ services: await listBookableServices() }));

/** Creates a confirmed appointment from the public booking page. */
export const POST = handler(async (req) => {
  const rl = rateLimit(`booking:${clientIp(req)}`, 6, 10 * 60_000);
  if (!rl.ok) return error('Too many booking attempts. Please try again shortly.', 429);
  const body = await readJson<Record<string, unknown>>(req, 8_000);
  if (typeof body.website === 'string' && body.website.length > 0) return json({ ok: true }); // honeypot: silently accept
  try {
    const c = await createBooking(body);
    return json(
      {
        ok: true,
        reference: c.reference,
        when: c.when,
        service: c.appointment.service_name,
        practitioner: c.practitioner.name,
        starts_at: c.appointment.starts_at,
        ends_at: c.appointment.ends_at,
      },
      201,
    );
  } catch (e) {
    if (e instanceof BookingError) return error(e.message, e.status);
    throw e;
  }
});
