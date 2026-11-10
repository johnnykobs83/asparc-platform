import { db } from '@/lib/db';
import { handler, json, requireAdmin } from '@/lib/http/respond';
import { buildDailySummary } from '@/lib/reports/daily-summary';
import { getOverview } from '@/lib/reports/overview';
import { melbourneDate } from '@/lib/time/melbourne';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const date = new URL(req.url).searchParams.get('date') ?? melbourneDate();
  const [history, live, overview] = await Promise.all([
    db().list('daily_summaries', { orderBy: 'summary_date', limit: 60 }),
    buildDailySummary(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : melbourneDate()),
    getOverview(90),
  ]);
  return json({ history, live, funnel: overview.funnel, sources: overview.sources, types: overview.types });
});
