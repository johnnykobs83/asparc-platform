import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { calendarUrl } from '@/lib/planner/notify';
import { createStaff, publicStaff, StaffInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

/** Planners get full staff records, each person's calendar link and the dashboard logins they can link. */
export const GET = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:view');
  const staff = await db().list('staff_members', { orderBy: 'full_name', ascending: true, limit: 500 });
  if (!can(session.role, 'planner:write')) {
    return json({ staff: staff.map((s) => ({ id: s.id, full_name: s.full_name, role_title: s.role_title, employment_type: s.employment_type, active: s.active })) });
  }
  const logins = (await db().list('admin_users', { limit: 200 })).filter((u) => u.active).map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role }));
  return json({ staff: staff.map((s) => ({ ...publicStaff(s), calendar_url: calendarUrl(s.calendar_token) })), logins });
});

export const POST = handler(async (req) => {
  await requireAdmin(req, 'planner:write');
  const s = await createStaff(StaffInput.parse(await readJson(req)));
  return json({ staff: { ...publicStaff(s), calendar_url: calendarUrl(s.calendar_token) } }, 201);
});
