import { getConversationTranscript } from '@/lib/ai/receptionist';
import { error, handler, json } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Lets the widget restore a visitor's own conversation after a page change. */
export const GET = handler(async (req) => {
  const u = new URL(req.url);
  const conversationId = u.searchParams.get('conversationId') ?? '';
  const visitorId = u.searchParams.get('visitorId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !/^[A-Za-z0-9_-]{16,64}$/.test(visitorId)) return error('Invalid request', 400);
  const messages = await getConversationTranscript(conversationId, visitorId);
  if (!messages) return error('Not found', 404);
  return json({ messages });
});
