import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { repeatJob, RepeatInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

/** Repeat an existing job on chosen weekdays every week until a date. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin(req, 'planner:write');
  return json(await repeatJob((await params).id, RepeatInput.parse(await readJson(req)), session.sub), 201);
});
