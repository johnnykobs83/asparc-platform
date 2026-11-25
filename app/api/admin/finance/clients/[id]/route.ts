import { clientDetail, ClientPatch, updateClient } from '@/lib/finance/service';
import { handler, json, readJson, requireHidden } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req, { params }: Ctx) => {
  await requireHidden(req, 'finance:manage');
  return json(await clientDetail((await params).id));
});

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireHidden(req, 'finance:manage');
  return json({ client: await updateClient((await params).id, ClientPatch.parse(await readJson(req))) });
});
