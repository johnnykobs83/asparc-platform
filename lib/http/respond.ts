import { ZodError } from 'zod';
import { can, type Permission } from '../auth/rbac';
import { readCookie, SESSION_COOKIE, verifySession, type Session } from '../auth/session';
import { env } from '../config/env';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const error = (message: string, status = 400, extra: Record<string, unknown> = {}) => json({ error: message, ...extra }, status);

export function zodErrorResponse(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path.join('.') || '_';
    if (!fields[k]) fields[k] = issue.message;
  }
  return error('Please check the highlighted fields.', 422, { fields });
}

export async function readJson<T = unknown>(req: Request, maxBytes = 32_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Basic CSRF defence for cookie-authenticated mutations (in addition to SameSite=Lax). */
export function assertSameOrigin(req: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients (no cookie anyway) / same-origin fetch in some browsers
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, 'Cross-origin request blocked');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, 'Cross-origin request blocked');
  }
}

/** Authenticates the admin session and checks a permission. */
export async function requireAdmin(req: Request, permission: Permission = 'dashboard:view'): Promise<Session> {
  const session = await verifySession(readCookie(req, SESSION_COOKIE));
  if (!session) throw new HttpError(401, 'Please sign in.');
  if (!can(session.role, permission)) throw new HttpError(403, 'Your role does not have access to this action.');
  assertSameOrigin(req);
  return session;
}

/** Wraps a route handler with uniform error handling. */
export function handler<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      if (e instanceof ZodError) return zodErrorResponse(e);
      console.error('[api]', req.method, new URL(req.url).pathname, e);
      return error(env.isProduction ? 'Something went wrong. Please try again.' : String(e), 500);
    }
  };
}

export const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
