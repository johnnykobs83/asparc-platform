import { clientDetail, updateClient } from '@/lib/clients/service';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** One client: details and full history. Health forms and notes only for those allowed to see them. */
export const GET = handler(async (req, { params }: Ctx) => {
  const session = await requireAdmin(req, 'clients:view');
  return json(await clientDetail((await params).id, session));
});

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'clients:write');
  return json({ client: await updateClient((await params).id, await readJson(req, 8_000)) });
});
