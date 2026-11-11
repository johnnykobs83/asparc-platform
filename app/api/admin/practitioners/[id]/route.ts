import { PractitionerPatch } from '@/lib/bookings/admin';
import { db } from '@/lib/db';
import { refreshPublicSiteData } from '@/lib/kb/cached';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'services:write');
  const patch = PractitionerPatch.parse(await readJson(req));
  const updated = await db().update('practitioners', (await params).id, patch);
  if (updated) refreshPublicSiteData();
  return updated ? json({ practitioner: updated }) : error('Practitioner not found', 404);
});
