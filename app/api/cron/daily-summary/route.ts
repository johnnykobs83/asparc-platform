import { env } from '@/lib/config/env';
import { error, handler, json } from '@/lib/http/respond';
import { runDailySummary } from '@/lib/reports/daily-summary';

export const dynamic = 'force-dynamic';

/** Called by Vercel Cron (vercel.json) with "Authorization: Bearer $CRON_SECRET". */
export const GET = handler(async (req) => {
  if (!env.cronSecret) return error('CRON_SECRET is not configured', 503);
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) return error('Unauthorised', 401);
  const date = new URL(req.url).searchParams.get('date') ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error('Invalid date', 400);
  const summary = await runDailySummary({ date });
  return json({ ok: true, date: summary.summary_date, email: summary.email_status });
});
