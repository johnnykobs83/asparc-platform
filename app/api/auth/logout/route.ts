import { clearSessionCookie } from '@/lib/auth/session';
import { env } from '@/lib/config/env';
import { json } from '@/lib/http/respond';

export async function POST() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(env.isProduction) });
}
