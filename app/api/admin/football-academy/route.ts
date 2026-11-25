import { staffAcademy } from '@/lib/academy/service';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Timetable with places taken and every enrolment, for the dashboard. */
export const GET = handler(async (req) => {
  await requireAdmin(req, 'academy:write');
  try {
    return json({ ready: true, ...(await staffAcademy()) });
  } catch (e) {
    if (/academy_sessions|academy_enrolments|PGRST205|does not exist/i.test(String(e))) return json({ ready: false });
    throw e;
  }
});
