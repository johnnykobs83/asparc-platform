import { db } from '@/lib/db';
import { error, handler, HttpError, json, readJson, requireAdmin } from '@/lib/http/respond';
import { deleteLocation, LocationPatch } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'planner:write');
  const patch = LocationPatch.parse(await readJson(req));
  if (patch.client_id && !(await db().get('clients', patch.client_id))) throw new HttpError(422, 'That client no longer exists');
  const location = await db().update('work_locations', (await params).id, patch);
  return location ? json({ location }) : error('Location not found', 404);
});

/** Delete a place that no job uses (owners and managers). */
export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'planner:write');
  return json(await deleteLocation((await params).id));
});
