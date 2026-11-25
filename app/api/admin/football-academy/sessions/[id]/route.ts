import { updateSession } from '@/lib/academy/service';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Change a session's number of places, or take it off the timetable. Owners and managers. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'services:write');
  return json({ session: await updateSession((await params).id, await readJson(req, 2_000)) });
});
