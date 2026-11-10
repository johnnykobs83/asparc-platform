import { handleChatMessage } from '@/lib/ai/receptionist';
import { channelVisitorId, verifyMetaSignature, whatsapp } from '@/lib/channels/whatsapp';
import { env } from '@/lib/config/env';
import { db } from '@/lib/db';
import { error, handler, json } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** PHASE 2 – Meta webhook verification handshake. Inactive until WHATSAPP_ENABLED=true. */
export const GET = handler(async (req) => {
  if (!whatsapp.enabled()) return error('WhatsApp channel is not enabled', 503);
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === env.whatsappVerifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return error('Verification failed', 403);
});

/** PHASE 2 – inbound WhatsApp messages → central receptionist → reply. */
export const POST = handler(async (req) => {
  if (!whatsapp.enabled()) return error('WhatsApp channel is not enabled', 503);
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) return error('Invalid signature', 401);
  const payload = JSON.parse(raw) as {
    entry?: { changes?: { value?: { messages?: { from: string; type: string; text?: { body: string } }[] } }[] }[];
  };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (m.type !== 'text' || !m.text?.body) continue;
        const visitorId = channelVisitorId('whatsapp', m.from);
        const existing = await db().findOne('conversations', { channel: 'whatsapp', visitor_id: visitorId, status: 'open' });
        const reply = await handleChatMessage({ channel: 'whatsapp', visitorId, conversationId: existing?.id, message: m.text.body });
        const extra = whatsapp.renderActions(reply.actions);
        await whatsapp.send(m.from, extra ? `${reply.reply}\n\n${extra}` : reply.reply);
      }
    }
  }
  return json({ ok: true });
});
