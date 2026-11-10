import { z } from 'zod';
import { getConversationDetail } from '@/lib/admin/service';
import { setHumanTakeover } from '@/lib/channels/handover';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({ status: z.enum(['open', 'escalated', 'closed']).optional(), needs_attention: z.boolean().optional(), summary: z.string().max(1000).nullable().optional(), human_takeover: z.boolean().optional() }).strict();

export const GET = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const d = await getConversationDetail((await params).id);
  return d ? json(d) : error('Conversation not found', 404);
});

export const PATCH = handler(async (req, { params }: Ctx) => {
  await requireAdmin(req, 'conversations:write');
  const { human_takeover, ...p } = Patch.parse(await readJson(req));
  const id = (await params).id;
  // human_takeover lives in conversation.state: true pauses ASPARC AI on messaging channels, false hands the conversation back.
  if (human_takeover !== undefined && !(await setHumanTakeover(id, human_takeover))) return error('Conversation not found', 404);
  const updated = await db().update('conversations', id, { ...p, ...(p.needs_attention === false ? { attention_reason: null } : {}) });
  return updated ? json({ conversation: updated }) : error('Conversation not found', 404);
});
