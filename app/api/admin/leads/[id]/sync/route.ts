import { handler, json, requireAdmin } from '@/lib/http/respond';
import { syncLeadToHubSpot } from '@/lib/integrations/hubspot';

export const dynamic = 'force-dynamic';
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'leads:write');
  return json(await syncLeadToHubSpot((await params).id));
});
