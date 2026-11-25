import { z } from 'zod';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { error, handler, HttpError, json, readJson, requireAdmin } from '@/lib/http/respond';
import { calendarUrl } from '@/lib/planner/notify';
import { acknowledge, getMyWeek, staffForSession } from '@/lib/planner/service';
import { shareUrl } from '@/lib/planner/share';
import { isYmd, mondayOf } from '@/lib/planner/time';
import { melbourneDate } from '@/lib/time/melbourne';

export const dynamic = 'force-dynamic';

/** The signed-in person's own jobs. Planners can also look at anyone's week with ?staff=<id>. */
export const GET = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:view');
  const url = new URL(req.url);
  const week = url.searchParams.get('week') ?? mondayOf(melbourneDate());
  if (!isYmd(week)) return error('Invalid week', 400);
  const planner = can(session.role, 'planner:write');
  try {
    const own = await staffForSession(session);
    const other = url.searchParams.get('staff');
    const staff = other && planner ? await db().get('staff_members', other) : own;
    const options = planner ? (await db().list('staff_members', { orderBy: 'full_name', ascending: true, limit: 500 })).filter((s) => s.active).map((s) => ({ id: s.id, full_name: s.full_name })) : [];
    if (!staff) return json({ ready: true, linked: false, staff_options: options, can_plan: planner });
    const mine = staff.id === own?.id;
    return json({
      ready: true,
      linked: true,
      is_me: mine,
      can_plan: planner,
      staff_options: options,
      me: { id: staff.id, full_name: staff.full_name, role_title: staff.role_title },
      calendar_url: mine || planner ? calendarUrl(staff.calendar_token) : null,
      /** Read-only weekly schedule link to share (published weeks only; no access notes). */
      share_url: mine || planner ? shareUrl(staff, mondayOf(week)) : null,
      ...(await getMyWeek(staff.id, week)),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[my-week]', e);
    return json({ ready: false });
  }
});

/** "Got it": confirm one job or the whole week. Only for your own jobs. */
export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:view');
  const body = z.object({ job_id: z.string().uuid().optional(), week_start: z.string().optional() }).parse(await readJson(req));
  const own = await staffForSession(session);
  if (!own) return error('Your login isn’t linked to a staff member yet. Ask Johnny to link it in Staff Planner › Staff.', 409);
  const confirmed = await acknowledge(own.id, { jobId: body.job_id, weekStart: body.week_start });
  return json({ confirmed });
});
