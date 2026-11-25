import { env } from '@/lib/config/env';
import { error, handler, json } from '@/lib/http/respond';
import { runDayBeforeReminders } from '@/lib/planner/notify';

export const dynamic = 'force-dynamic';

/** Hourly (vercel.json). Sends tomorrow's jobs at PLANNER_REMINDER_HOUR Melbourne time (default 6 pm), once per person. */
export const GET = handler(async (req) => {
  if (!env.cronSecret) return error('CRON_SECRET is not configured', 503);
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) return error('Unauthorised', 401);
  const force = new URL(req.url).searchParams.get('force') === '1';
  return json({ ok: true, ...(await runDayBeforeReminders(new Date(), { force })) });
});
