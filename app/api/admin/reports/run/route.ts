import { z } from 'zod';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { runDailySummary } from '@/lib/reports/daily-summary';

export const dynamic = 'force-dynamic';
export const POST = handler(async (req) => {
  await requireAdmin(req, 'reports:run');
  const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), email: z.boolean().optional() }).parse(await readJson(req));
  return json({ summary: await runDailySummary(b) });
});
