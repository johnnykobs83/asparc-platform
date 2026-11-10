import { z } from 'zod';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'notifications:write');
  const { read } = z.object({ read: z.boolean() }).parse(await readJson(req));
  const n = await db().update('notifications', (await params).id, { read_at: read ? new Date().toISOString() : null });
  return n ? json({ notification: n }) : error('Not found', 404);
});
