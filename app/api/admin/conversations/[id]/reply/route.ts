import { z } from 'zod';
import { sendStaffReply } from '@/lib/channels/handover';
import { assertSameOrigin, error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
const Body = z.object({ message: z.string().trim().min(1, 'Write a message first').max(2000) }).strict();

/** Staff reply to a WhatsApp / Messenger / Instagram conversation. Pauses ASPARC AI for that conversation. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const session = await requireAdmin(req, 'conversations:write');
  const { message } = Body.parse(await readJson(req, 8000));
  const result = await sendStaffReply((await params).id, message, session.email);
  if (!result.ok) return error(result.error, result.status);
  return json({ message: result.message, conversation: result.conversation }, 201);
});
