import { db } from '@/lib/db';
import { error, handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'planner:write');
  const id = (await params).id;
  if (!(await db().get('staff_leave', id))) return error('Leave not found', 404);
  await db().remove('staff_leave', id);
  return json({ ok: true });
});
