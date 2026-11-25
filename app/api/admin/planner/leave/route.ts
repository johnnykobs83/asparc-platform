import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { addLeave, LeaveInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  await requireAdmin(req, 'planner:write');
  return json({ leave: await addLeave(LeaveInput.parse(await readJson(req))) }, 201);
});
