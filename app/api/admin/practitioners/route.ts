import { PractitionerCreate } from '@/lib/bookings/admin';
import { db } from '@/lib/db';
import { refreshPublicSiteData } from '@/lib/kb/cached';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin(req);
  try {
    return json({ ready: true, practitioners: await db().list('practitioners', { orderBy: 'name', ascending: true, limit: 200 }) });
  } catch {
    // The bookings tables have not been created in the database yet.
    return json({ ready: false, practitioners: [] });
  }
});

export const POST = handler(async (req) => {
  await requireAdmin(req, 'services:write');
  const body = PractitionerCreate.parse(await readJson(req));
  const practitioner = await db().insert('practitioners', body);
  refreshPublicSiteData(); // the site shows "Book online" as soon as booking is possible
  return json({ practitioner }, 201);
});
