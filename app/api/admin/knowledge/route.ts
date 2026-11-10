import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { listKnowledge } from '@/lib/kb/service';
import { KbBody } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';


export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json({ items: await listKnowledge() });
});

export const POST = handler(async (req) => {
  const s = await requireAdmin(req, 'kb:write');
  const body = KbBody.parse(await readJson(req));
  if (await db().findOne('knowledge_base', { key: body.key })) return json({ error: 'That key already exists' }, 409);
  const item = await db().insert('knowledge_base', { ...body, updated_by: s.email });
  return json({ item }, 201);
});
