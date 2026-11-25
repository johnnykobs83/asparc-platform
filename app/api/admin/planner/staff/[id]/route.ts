import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { calendarUrl } from '@/lib/planner/notify';
import { publicStaff, StaffPatch, updateStaff } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'planner:write');
  const s = await updateStaff((await params).id, StaffPatch.parse(await readJson(req)));
  return json({ staff: { ...publicStaff(s), calendar_url: calendarUrl(s.calendar_token) } });
});
