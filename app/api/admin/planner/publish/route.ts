import { z } from 'zod';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { publishWeek } from '@/lib/planner/notify';

export const dynamic = 'force-dynamic';

/** First call publishes the week and emails everyone on it; later calls email only the people whose jobs changed. */
export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:write');
  const { week_start } = z.object({ week_start: z.string() }).parse(await readJson(req));
  return json(await publishWeek(week_start, session.sub));
});
