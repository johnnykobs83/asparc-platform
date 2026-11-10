import { refreshPublicSiteData } from '@/lib/kb/cached';
import { z } from 'zod';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  content: z.string().max(6000).optional(),
  data: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'approved', 'archived']).optional(),
  is_public: z.boolean().optional(),
}).strict();

export const PATCH = handler(async (req, { params }: Ctx) => {
  const s = await requireAdmin(req, 'kb:write');
  const p = Patch.parse(await readJson(req));
  const item = await db().update('knowledge_base', (await params).id, { ...p, updated_by: s.email });
  if (item) refreshPublicSiteData();
  return item ? json({ item }) : error('Not found', 404);
});

/** Archive rather than delete, so changes stay auditable. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const s = await requireAdmin(req, 'kb:write');
  const item = await db().update('knowledge_base', (await params).id, { status: 'archived', updated_by: s.email });
  if (item) refreshPublicSiteData();
  return item ? json({ item }) : error('Not found', 404);
});
