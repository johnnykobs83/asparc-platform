import { integrationStatuses } from '@/lib/config/env';
import { db } from '@/lib/db';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req, 'integrations:view');
  const logs = await db().list('integration_logs', { limit: 100 });
  return json({ integrations: integrationStatuses(), logs });
});
