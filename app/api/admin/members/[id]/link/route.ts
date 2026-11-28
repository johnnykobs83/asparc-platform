import { z } from 'zod';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { emailLink, issueLink, publicMember } from '@/lib/members/service';

export const dynamic = 'force-dynamic';

/**
 * A fresh one-time link: an invite if they haven't set a password yet, otherwise
 * a password reset. Any older link stops working. Staff can copy it to send by
 * text if email isn't set up.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireAdmin(req, 'members:manage');
  const { send_email } = z.object({ send_email: z.boolean().default(true) }).parse(await readJson(req));
  const current = await db().get('members', (await params).id);
  if (!current) return error('Member not found', 404);
  const { member, link, kind, expiresAt } = await issueLink(current, s.email);
  const email = send_email ? await emailLink(member, link, kind) : 'not_requested';
  return json({ member: publicMember(member), link, kind, expires_at: expiresAt, email });
});
