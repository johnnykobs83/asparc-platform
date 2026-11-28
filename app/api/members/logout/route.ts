import { env } from '@/lib/config/env';
import { assertSameOrigin, handler } from '@/lib/http/respond';
import { clearMemberCookie } from '@/lib/members/session';

export const dynamic = 'force-dynamic';

/** Plain form POST from the member bar or the Members home page. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  return new Response(null, {
    status: 303,
    headers: { Location: '/members/login?signed_out=1', 'Set-Cookie': clearMemberCookie(env.isProduction), 'Cache-Control': 'no-store' },
  });
});
