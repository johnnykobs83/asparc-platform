import { enrol, publicAcademy } from '@/lib/academy/service';
import { clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';

/** The Academy timetable with places left, and the packages with live prices. */
export const GET = handler(async () => json(await publicAcademy(), 200, { 'Cache-Control': 'no-store' }));

/** A parent enrols their child (group, package and session days). */
export const POST = handler(async (req) => {
  const rl = rateLimit(`academy-enrol:${clientIp(req)}`, 12, 10 * 60_000);
  if (!rl.ok) return error('Too many attempts. Please try again shortly.', 429);
  const body = await readJson<Record<string, unknown>>(req, 8_000);
  if (typeof body.website === 'string' && body.website.length > 0) return json({ ok: true }); // honeypot
  return json({ ok: true, ...(await enrol(body)) }, 201);
});
