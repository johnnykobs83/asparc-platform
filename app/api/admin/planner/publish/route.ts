import { z } from 'zod';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { publishWeek } from '@/lib/planner/notify';

export const dynamic = 'force-dynamic';

/**
 * Sends the week by email. With no staff_ids: the first time everyone on it, later only the people
 * who still need telling. With staff_ids: just those people (one or several).
 */
export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:write');
  const { week_start, staff_ids } = z
    .object({ week_start: z.string(), staff_ids: z.array(z.string().uuid()).max(200).optional() })
    .strict()
    .parse(await readJson(req));
  return json(await publishWeek(week_start, session.sub, { staffIds: staff_ids }));
});
