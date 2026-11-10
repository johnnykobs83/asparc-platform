import { z } from 'zod';
import { getConversationDetail } from '@/lib/admin/service';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({ status: z.enum(['open', 'escalated', 'closed']).optional(), needs_attention: z.boolean().optional(), summary: z.string().max(1000).nullable().optional() }).strict();

export const GET = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const d = await getConversationDetail((await params).id);
  return d ? json(d) : error('Conversation not found', 404);
});

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'conversations:write');
  const p = Patch.parse(await readJson(req));
  const updated = await db().update('conversations', (await params).id, { ...p, ...(p.needs_attention === false ? { attention_reason: null } : {}) });
  return updated ? json({ conversation: updated }) : error('Conversation not found', 404);
});
