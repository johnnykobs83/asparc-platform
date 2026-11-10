import { db } from '@/lib/db';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const p = new URL(req.url).searchParams;
  const rows = await db().list('notifications', { limit: 300 });
  const filtered = rows.filter((n) => (p.get('unread') === '1' ? !n.read_at : true)).filter((n) => (p.get('type') ? n.type === p.get('type') : true));
  return json({ notifications: filtered, unread: rows.filter((n) => !n.read_at).length });
});
