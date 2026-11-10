import { z } from 'zod';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireAdmin(req, 'users:manage');
  const id = (await params).id;
  const p = z.object({ role: z.enum(['owner', 'manager', 'staff']).optional(), active: z.boolean().optional(), full_name: z.string().max(120).nullable().optional() }).strict().parse(await readJson(req));
  if (id === s.sub && (p.active === false || (p.role && p.role !== 'owner'))) return error('You cannot remove your own owner access.', 422);
  const u = await db().update('admin_users', id, p);
  if (!u) return error('User not found', 404);
  const { password_hash: _p, ...safe } = u;
  return json({ user: safe });
});
