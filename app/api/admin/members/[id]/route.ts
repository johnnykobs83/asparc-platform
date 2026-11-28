import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { MemberPatch, publicMember, updateMember } from '@/lib/members/service';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'members:manage');
  const m = await updateMember((await params).id, MemberPatch.parse(await readJson(req)));
  return json({ member: publicMember(m) });
});

export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'data:delete');
  const id = (await params).id;
  if (!(await db().get('members', id))) return error('Member not found', 404);
  await db().remove('members', id);
  return json({ ok: true });
});
