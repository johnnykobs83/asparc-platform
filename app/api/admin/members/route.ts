import { z } from 'zod';
import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { isResendConfigured } from '@/lib/integrations/resend';
import { DOWNLOADS, MEMBER_PAGES } from '@/lib/members/catalog';
import { createMember, emailLink, issueLink, MemberInput, publicMember } from '@/lib/members/service';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin(req, 'members:view');
  const base = { pages: MEMBER_PAGES, downloads: DOWNLOADS, email_configured: isResendConfigured() };
  try {
    const members = (await db().list('members', { orderBy: 'created_at', ascending: false })).map(publicMember);
    return json({ ready: true, members, ...base });
  } catch (e) {
    // The members table arrives with migration 20261128000014_members.sql.
    if (/members|PGRST205|does not exist/i.test(String(e))) return json({ ready: false, members: [], ...base });
    throw e;
  }
});

/** Adds a member and makes their invite link (emailed when asked and email is set up). */
export const POST = handler(async (req) => {
  const s = await requireAdmin(req, 'members:manage');
  const raw = await readJson<Record<string, unknown>>(req);
  const sendInvite = z.boolean().default(true).parse(raw.send_email);
  const { send_email: _s, ...fields } = raw;
  const created = await createMember(MemberInput.parse(fields));
  const { member, link, kind, expiresAt } = await issueLink(created, s.email);
  const email = sendInvite ? await emailLink(member, link, kind) : 'not_requested';
  return json({ member: publicMember(member), link, expires_at: expiresAt, email }, 201);
});
