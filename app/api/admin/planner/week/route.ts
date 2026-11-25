import { can } from '@/lib/auth/rbac';
import { error, handler, HttpError, json, requireAdmin } from '@/lib/http/respond';
import { getWeek } from '@/lib/planner/service';
import { isYmd, mondayOf } from '@/lib/planner/time';
import { melbourneDate } from '@/lib/time/melbourne';

export const dynamic = 'force-dynamic';

/** One week of the staff planner. Planners also get contact details and clients. */
export const GET = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:view');
  const week = new URL(req.url).searchParams.get('week') ?? mondayOf(melbourneDate());
  if (!isYmd(week)) return error('Invalid week', 400);
  try {
    return json({ ready: true, can_plan: can(session.role, 'planner:write'), ...(await getWeek(week, { planner: can(session.role, 'planner:write') })) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // The planner tables have not been created in the database yet (migration 000007).
    console.error('[planner]', e);
    return json({ ready: false });
  }
});
