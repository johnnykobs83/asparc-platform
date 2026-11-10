import { readCookie, SESSION_COOKIE, verifySession } from './lib/auth/session';

/**
 * Protects every /admin page. API routes enforce auth + role permissions
 * themselves (lib/http/respond.ts → requireAdmin), so this is defence in depth.
 */
export async function middleware(req: Request) {
  const url = new URL(req.url);
  if (url.pathname === '/admin/login') return;
  const session = await verifySession(readCookie(req, SESSION_COOKIE)).catch(() => null);
  if (!session) {
    const login = new URL('/admin/login', url);
    login.searchParams.set('next', url.pathname + url.search);
    return Response.redirect(login, 307);
  }
}

export const config = { matcher: ['/admin/:path*'] };
