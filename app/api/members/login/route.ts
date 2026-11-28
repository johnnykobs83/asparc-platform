import { z } from 'zod';
import { env } from '@/lib/config/env';
import { assertSameOrigin, clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { authenticateMember } from '@/lib/members/service';
import { memberCookie, signMemberSession } from '@/lib/members/session';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req, 2000));
  const rlIp = rateLimit(`member-login-ip:${clientIp(req)}`, 10, 15 * 60_000);
  const rlUser = rateLimit(`member-login-user:${body.email.toLowerCase()}`, 5, 15 * 60_000);
  if (!rlIp.ok || !rlUser.ok) return error('Too many sign-in attempts. Please wait 15 minutes.', 429);
  const r = await authenticateMember(body.email, body.password);
  if (!r.ok) return error(r.error, 401);
  const token = await signMemberSession(r.member);
  return json({ ok: true }, 200, { 'Set-Cookie': memberCookie(token, env.isProduction) });
});
