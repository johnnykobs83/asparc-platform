import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { createJob, JobInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:write');
  const { created, ...job } = await createJob(JobInput.parse(await readJson(req)), session.sub);
  return json({ job, created }, 201);
});
