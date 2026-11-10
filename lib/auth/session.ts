import type { Role } from '../db/types';

/**
 * Stateless signed session cookie (HMAC-SHA256 via Web Crypto, so it works in
 * both the Edge middleware and Node route handlers).
 */
export const SESSION_COOKIE = 'asparc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface Session {
  sub: string;
  email: string;
  role: Role;
  name: string | null;
  exp: number; // unix seconds
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return s;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(data: Omit<Session, 'exp'>, ttl = SESSION_TTL_SECONDS): Promise<string> {
  const payload: Session = { ...data, exp: Math.floor(Date.now() / 1000) + ttl };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!s.exp || s.exp < Math.floor(Date.now() / 1000)) return null;
    if (!['owner', 'manager', 'staff'].includes(s.role)) return null;
    return s;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
