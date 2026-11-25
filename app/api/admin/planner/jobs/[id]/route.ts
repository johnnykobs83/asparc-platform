import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { deleteJob, JobPatch, updateJob } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'planner:write');
  const { updated, ...job } = await updateJob((await params).id, JobPatch.parse(await readJson(req)));
  return json({ job, updated });
});

export const DELETE = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'planner:write');
  const scope = new URL(req.url).searchParams.get('scope') === 'following' ? 'following' : 'one';
  const deleted = await deleteJob((await params).id, scope);
  return json({ ok: true, deleted });
});
