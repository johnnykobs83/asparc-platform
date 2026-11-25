import { updateEnrolment } from '@/lib/academy/service';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Mark paid, confirm, waitlist, cancel, change session days or add a note. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'academy:write');
  return json({ enrolment: await updateEnrolment((await params).id, await readJson(req, 4_000)) });
});
