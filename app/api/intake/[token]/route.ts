import { publicIntake, submitIntake } from '@/lib/clients/intake';
import { clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };
const noStore = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

/** The public pre-visit form, opened from the personal link in the client's email. */
export const GET = handler(async (req, { params }: Ctx) => {
  const rl = rateLimit(`intake-get:${clientIp(req)}`, 60, 10 * 60_000);
  if (!rl.ok) return error('Too many requests. Please try again shortly.', 429);
  return json(await publicIntake((await params).token), 200, noStore);
});

export const POST = handler(async (req, { params }: Ctx) => {
  const rl = rateLimit(`intake-post:${clientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return error('Too many submissions. Please try again shortly.', 429);
  const body = await readJson<Record<string, unknown>>(req, 32_000);
  if (typeof body.website === 'string' && body.website.length > 0) return json({ ok: true }, 200, noStore); // honeypot
  return json(await submitIntake((await params).token, body), 201, noStore);
});
