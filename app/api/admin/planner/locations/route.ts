import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { handler, HttpError, json, readJson, requireAdmin } from '@/lib/http/respond';
import { LocationInput } from '@/lib/planner/service';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const session = await requireAdmin(req, 'planner:view');
  const locations = await db().list('work_locations', { orderBy: 'name', ascending: true, limit: 500 });
  return json({ locations: can(session.role, 'planner:write') ? locations : locations.map((l) => ({ ...l, client_id: null })) });
});

export const POST = handler(async (req) => {
  await requireAdmin(req, 'planner:write');
  const body = LocationInput.parse(await readJson(req));
  if (body.client_id && !(await db().get('clients', body.client_id))) throw new HttpError(422, 'That client no longer exists');
  return json({ location: await db().insert('work_locations', body) }, 201);
});
