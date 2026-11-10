import { getLeadDetail, patchLead } from '@/lib/admin/service';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const d = await getLeadDetail((await params).id);
  return d ? json(d) : error('Lead not found', 404);
});

export const PATCH = handler(async (req, { params }: Ctx) => {
  const s = await requireAdmin(req, 'leads:write');
  const lead = await patchLead((await params).id, await readJson(req), s.email);
  return lead ? json({ lead }) : error('Lead not found', 404);
});
