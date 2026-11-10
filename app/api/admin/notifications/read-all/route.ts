import { db } from '@/lib/db';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const POST = handler(async (req) => {
  await requireAdmin(req, 'notifications:write');
  const repo = db();
  const unread = await repo.list('notifications', { eq: { read_at: null }, limit: 1000 });
  const now = new Date().toISOString();
  for (const n of unread) await repo.update('notifications', n.id, { read_at: now });
  return json({ updated: unread.length });
});
