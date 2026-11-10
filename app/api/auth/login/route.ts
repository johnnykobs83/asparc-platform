import { z } from 'zod';
import { authenticate } from '@/lib/auth/login';
import { sessionCookie, signSession } from '@/lib/auth/session';
import { env } from '@/lib/config/env';
import { assertSameOrigin, clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  const body = Body.parse(await readJson(req, 2000));
  const rlIp = rateLimit(`login-ip:${ip}`, 10, 15 * 60_000);
  const rlUser = rateLimit(`login-user:${body.email.toLowerCase()}`, 5, 15 * 60_000);
  if (!rlIp.ok || !rlUser.ok) return error('Too many sign-in attempts. Please wait 15 minutes.', 429);
  const result = await authenticate(body.email, body.password);
  if (!result.ok) return error(result.error, 401);
  const token = await signSession({ sub: result.user.id, email: result.user.email, role: result.user.role, name: result.user.full_name });
  return json(
    { ok: true, user: { email: result.user.email, role: result.user.role, name: result.user.full_name } },
    200,
    { 'Set-Cookie': sessionCookie(token, env.isProduction) },
  );
});
