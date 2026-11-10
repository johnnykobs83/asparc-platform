import { handler, json, requireAdmin } from '@/lib/http/respond';
import { getOverview } from '@/lib/reports/overview';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 30));
  return json(await getOverview(days));
});
