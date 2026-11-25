import { z } from 'zod';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { copyWeek } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:write');
  const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(await readJson(req));
  return json(await copyWeek(from, to, session.sub), 201);
});
