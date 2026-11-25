import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { createJob, JobInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:write');
  const job = await createJob(JobInput.parse(await readJson(req)), session.sub);
  return json({ job }, 201);
});
