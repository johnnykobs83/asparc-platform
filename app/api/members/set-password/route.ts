import { z } from 'zod';
import { env } from '@/lib/config/env';
import { assertSameOrigin, clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { setPasswordFromLink } from '@/lib/members/service';
import { memberCookie, signMemberSession } from '@/lib/members/session';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const Body = z.object({ token: z.string().min(10).max(400), password: z.string().min(1).max(200) });

/** Sets the password from a one-time link, then signs the member in. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  if (!rateLimit(`member-setpw:${clientIp(req)}`, 10, 15 * 60_000).ok) return error('Too many attempts. Please wait 15 minutes.', 429);
  const body = Body.parse(await readJson(req, 2000));
  const m = await setPasswordFromLink(body.token, body.password);
  const token = await signMemberSession(m);
  return json({ ok: true }, 200, { 'Set-Cookie': memberCookie(token, env.isProduction) });
});
