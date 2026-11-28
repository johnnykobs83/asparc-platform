import { z } from 'zod';
import { assertSameOrigin, clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { requestPasswordLink } from '@/lib/members/service';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const Body = z.object({ email: z.string().email().max(254) });

/** Same answer whether or not the email has an account. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req, 1000));
  const rlIp = rateLimit(`member-forgot-ip:${clientIp(req)}`, 5, 15 * 60_000);
  const rlUser = rateLimit(`member-forgot-user:${body.email.toLowerCase()}`, 3, 60 * 60_000);
  if (!rlIp.ok || !rlUser.ok) return error('Too many requests. Please try again later.', 429);
  await requestPasswordLink(body.email);
  return json({ ok: true, message: "If that email has a member account, we've sent a link to set a new password. Check your inbox (and junk folder)." });
});
