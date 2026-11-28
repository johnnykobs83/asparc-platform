import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../auth/password';
import { env } from '../config/env';
import { db } from '../db';
import type { Member } from '../db/types';
import { HttpError } from '../http/respond';
import { emailLayout, escapeHtml as esc, isResendConfigured, sendEmail } from '../integrations/resend';
import { verifyMemberSession } from './session';

/**
 * Members area: people staff invite to the Training & Health resources.
 *
 * - Staff add a member in the dashboard. The member gets a one-time link
 *   (emailed, or copied by staff) and sets their own password. Staff never
 *   see or choose passwords.
 * - Each link works once: its id (invite_nonce) is stored on the member and
 *   cleared when used, and a newer link replaces an older one.
 * - Switching a member off ends access on their next request.
 * - Under-18 players: the account belongs to a parent or guardian
 *   (is_guardian + athlete_name), in line with the junior policy.
 */

export const INVITE_DAYS = 14;
export const RESET_HOURS = 24;

export type MemberState = 'active' | 'invited' | 'link_expired' | 'switched_off';
export type PublicMember = Omit<Member, 'password_hash' | 'invite_nonce'> & { state: MemberState };

export function memberState(m: Member, now = Date.now()): MemberState {
  if (!m.active) return 'switched_off';
  if (m.password_set_at) return 'active';
  return m.invite_expires_at && Date.parse(m.invite_expires_at) > now ? 'invited' : 'link_expired';
}

export function publicMember(m: Member): PublicMember {
  const { password_hash: _p, invite_nonce: _n, ...rest } = m;
  return { ...rest, state: memberState(m) };
}

// ------------------------------------------------------------------ input
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const MemberInput = z
  .object({
    full_name: z.string().trim().min(2, 'Enter their full name').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    club: opt(120),
    team: opt(120),
    is_guardian: z.boolean().default(false),
    athlete_name: opt(160),
    access_hub: z.boolean().default(true),
    access_warmup: z.boolean().default(true),
    access_downloads: z.boolean().default(true),
    notes: opt(1000),
  })
  .superRefine((v, ctx) => {
    if (v.is_guardian && !v.athlete_name) ctx.addIssue({ code: 'custom', path: ['athlete_name'], message: "Enter the player's name" });
  });
export type MemberInput = z.infer<typeof MemberInput>;

export const MemberPatch = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    club: opt(120),
    team: opt(120),
    is_guardian: z.boolean(),
    athlete_name: opt(160),
    access_hub: z.boolean(),
    access_warmup: z.boolean(),
    access_downloads: z.boolean(),
    active: z.boolean(),
    notes: opt(1000),
  })
  .partial()
  .strict();

// ------------------------------------------------------------------ one-time links
const hmac = (s: string) => createHmac('sha256', `members-link:${env.sessionSecret}`).update(s).digest('base64url');

export function linkToken(memberId: string, nonce: string, expiresAt: string): string {
  const body = Buffer.from(`${memberId}|${nonce}|${Math.floor(Date.parse(expiresAt) / 1000)}`).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function readLinkToken(token: string, now = Date.now()): { id: string; nonce: string } | null {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [id, nonce, exp] = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !nonce || !(Number(exp) > now / 1000)) return null;
  return { id, nonce };
}

export const linkUrl = (token: string) => `${env.siteUrl}/members/set-password/${token}`;

/** Checks a link without using it. */
export async function checkLink(token: string): Promise<{ ok: true; member: Member; kind: 'invite' | 'reset' } | { ok: false }> {
  const t = readLinkToken(token);
  if (!t) return { ok: false };
  const m = await db().get('members', t.id);
  if (!m || !m.active || !m.invite_nonce || m.invite_nonce !== t.nonce) return { ok: false };
  if (!m.invite_expires_at || Date.parse(m.invite_expires_at) <= Date.now()) return { ok: false };
  return { ok: true, member: m, kind: m.password_set_at ? 'reset' : 'invite' };
}

/** Makes a new one-time link for this member (any older link stops working). */
export async function issueLink(member: Member, by: string | null): Promise<{ member: Member; link: string; kind: 'invite' | 'reset'; expiresAt: string }> {
  if (!member.active) throw new HttpError(422, 'This member is switched off. Switch them back on first.');
  const kind = member.password_set_at ? 'reset' : 'invite';
  const nonce = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + (kind === 'invite' ? INVITE_DAYS * 86_400_000 : RESET_HOURS * 3_600_000)).toISOString();
  const patch: Partial<Member> = { invite_nonce: nonce, invite_expires_at: expiresAt };
  if (kind === 'invite') Object.assign(patch, { invited_at: new Date().toISOString(), invited_by: by });
  const updated = (await db().update('members', member.id, patch)) ?? member;
  return { member: updated, link: linkUrl(linkToken(member.id, nonce, expiresAt)), kind, expiresAt };
}

export async function emailLink(member: Member, link: string, kind: 'invite' | 'reset'): Promise<'sent' | 'not_configured' | 'failed'> {
  const first = esc(member.full_name.split(/\s+/)[0]);
  const forWhom = member.is_guardian && member.athlete_name ? ` for ${esc(member.athlete_name)}` : '';
  const invite = kind === 'invite';
  const title = invite ? 'Your ASPARC Members access' : 'Reset your ASPARC Members password';
  const body = invite
    ? `<p>Hi ${first},</p><p>ASPARC has given you access${forWhom} to the Members area: our Training &amp; Health resources, the ASPARC Warm-Up and printable posters.</p><p>Use the button below to set your password. The link works once and expires in ${INVITE_DAYS} days.</p><p>Didn't expect this? You can ignore this email.</p>`
    : `<p>Hi ${first},</p><p>Use the button below to choose a new password for the ASPARC Members area. The link works once and expires in ${RESET_HOURS} hours.</p><p>If you didn't ask for this, you can ignore this email. Your password won't change.</p>`;
  const text = invite
    ? `Hi ${member.full_name.split(/\s+/)[0]},\n\nASPARC has given you access to the Members area. Set your password here (works once, expires in ${INVITE_DAYS} days):\n${link}\n`
    : `Reset your ASPARC Members password here (works once, expires in ${RESET_HOURS} hours):\n${link}\n\nIf you didn't ask for this, ignore this email.`;
  const r = await sendEmail({
    to: [member.email],
    subject: title,
    html: emailLayout(title, body, { label: invite ? 'Set my password' : 'Choose a new password', url: link }),
    text,
    entityType: 'member',
    entityId: member.id,
  });
  return r.status;
}

// ------------------------------------------------------------------ staff actions
export async function createMember(input: MemberInput): Promise<Member> {
  const repo = db();
  if (await repo.findOne('members', { email: input.email })) {
    throw new HttpError(409, 'Someone with that email already has a member account.', { email: 'Already a member' });
  }
  return repo.insert('members', { ...input, athlete_name: input.is_guardian ? input.athlete_name : null });
}

export async function updateMember(id: string, patch: z.infer<typeof MemberPatch>): Promise<Member> {
  const repo = db();
  const current = await repo.get('members', id);
  if (!current) throw new HttpError(404, 'Member not found');
  if (patch.email && patch.email !== current.email) {
    const other = await repo.findOne('members', { email: patch.email });
    if (other && other.id !== id) throw new HttpError(409, 'Someone with that email already has a member account.', { email: 'Already a member' });
  }
  const guardian = patch.is_guardian ?? current.is_guardian;
  const athlete = patch.athlete_name !== undefined ? patch.athlete_name : current.athlete_name;
  if (guardian && !athlete) throw new HttpError(422, "Enter the player's name", { athlete_name: "Enter the player's name" });
  const next: Partial<Member> = { ...patch, athlete_name: guardian ? athlete : null };
  // Switching someone off also kills any unused link.
  if (patch.active === false) Object.assign(next, { invite_nonce: null, invite_expires_at: null });
  return (await repo.update('members', id, next))!;
}

// ------------------------------------------------------------------ member actions
export async function setPasswordFromLink(token: string, password: string): Promise<Member> {
  const check = await checkLink(token);
  if (!check.ok) throw new HttpError(410, 'This link has expired or has already been used. Ask ASPARC for a new one, or use "Forgot password".');
  const weak = validatePasswordStrength(password);
  if (weak) throw new HttpError(422, weak, { password: weak });
  const now = new Date().toISOString();
  const m = await db().update('members', check.member.id, {
    password_hash: await hashPassword(password),
    password_set_at: now,
    invite_nonce: null,
    invite_expires_at: null,
    last_login_at: now,
    login_count: check.member.login_count + 1,
  });
  return m!;
}

const GENERIC = 'Incorrect email or password.';

export async function authenticateMember(emailRaw: string, password: string): Promise<{ ok: true; member: Member } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  const m = email ? await db().findOne('members', { email }) : null;
  // Always run a hash check so response time doesn't reveal which emails exist.
  const valid = await verifyPassword(password, m?.password_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!m || !valid) return { ok: false, error: GENERIC };
  if (!m.active) return { ok: false, error: 'This account has been switched off. Contact ASPARC if you think this is a mistake.' };
  const updated = await db().update('members', m.id, { last_login_at: new Date().toISOString(), login_count: m.login_count + 1 });
  return { ok: true, member: updated ?? m };
}

/**
 * "Forgot password": emails a fresh link to an active member. The answer is
 * the same whether or not the email belongs to anyone.
 */
export async function requestPasswordLink(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const m = await db().findOne('members', { email });
  if (!m || !m.active || !isResendConfigured()) return;
  const { member, link, kind } = await issueLink(m, null);
  await emailLink(member, link, kind);
}

/** The signed-in member for a cookie value, or null (expired, switched off, or password changed since). */
export async function memberFromCookie(cookieValue: string | null | undefined): Promise<Member | null> {
  const s = await verifyMemberSession(cookieValue);
  if (!s) return null;
  const m = await db().get('members', s.sub);
  if (!m || !m.active || !m.password_set_at || m.password_set_at !== s.pv) return null;
  return m;
}
