import { addNote, requireHealthAccess } from '@/lib/clients/service';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Client notes can hold health detail, so they follow the same access rule as the health form. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin(req, 'clients:view');
  const id = (await params).id;
  await requireHealthAccess(session, id);
  return json({ note: await addNote(id, await readJson(req, 8_000), session) }, 201);
});
