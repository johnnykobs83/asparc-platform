import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { deleteJob, JobPatch, updateJob } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'planner:write');
  const job = await updateJob((await params).id, JobPatch.parse(await readJson(req)));
  return json({ job });
});

export const DELETE = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'planner:write');
  await deleteJob((await params).id);
  return json({ ok: true });
});
