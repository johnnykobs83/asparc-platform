import type { Member } from '../db/types';

/**
 * Members-area session: a signed HttpOnly cookie, separate from the staff
 * session (different cookie, different signing key, no role), so a member
 * cookie can never open /admin and a staff cookie is never a member.
 *
 * `pv` is the time the password was last set: resetting a password signs
 * every older session out. Switching a member off takes effect on their next
 * request, because every page loads the member row (lib/members/service.ts).
 */
export const MEMBER_COOKIE = 'asparc_member';
export const MEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface MemberSession {
  k: 'member';
  sub: string;
  pv: string;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return crypto.subtle.importKey('raw', enc.encode(`members-area:${s}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signMemberSession(m: Pick<Member, 'id' | 'password_set_at'>, ttl = MEMBER_TTL_SECONDS): Promise<string> {
  const payload: MemberSession = { k: 'member', sub: m.id, pv: m.password_set_at ?? '', exp: Math.floor(Date.now() / 1000) + ttl };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyMemberSession(token: string | undefined | null): Promise<MemberSession | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as MemberSession;
    if (s.k !== 'member' || !s.sub || !s.pv || !s.exp || s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

export function memberCookie(token: string, secure: boolean, maxAge = MEMBER_TTL_SECONDS): string {
  return `${MEMBER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearMemberCookie(secure: boolean): string {
  return `${MEMBER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
