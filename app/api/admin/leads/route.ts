import { listLeads } from '@/lib/admin/service';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json({ leads: await listLeads(new URL(req.url).searchParams) });
});
