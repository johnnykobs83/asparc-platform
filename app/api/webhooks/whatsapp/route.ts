import { handleInboundMessage } from '@/lib/channels/inbound';
import { verifyMetaSignature, whatsapp } from '@/lib/channels/whatsapp';
import { env } from '@/lib/config/env';
import { error, handler, json } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** PHASE 2 – Meta webhook verification handshake. Inactive until WHATSAPP_ENABLED=true. */
export const GET = handler(async (req) => {
  if (!whatsapp.enabled()) return error('WhatsApp channel is not enabled', 503);
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && env.whatsappVerifyToken && p.get('hub.verify_token') === env.whatsappVerifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return error('Verification failed', 403);
});

interface WaMessage {
  id?: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: { button_reply?: { id: string; title: string } };
}

/** PHASE 2 – inbound WhatsApp messages → central receptionist → reply. */
export const POST = handler(async (req) => {
  if (!whatsapp.enabled()) return error('WhatsApp channel is not enabled', 503);
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) return error('Invalid signature', 401);
  const payload = JSON.parse(raw) as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        // Text, or a tap on one of our reply buttons. Media, locations etc. are ignored.
        const text = m.type === 'text' ? m.text?.body : m.type === 'interactive' ? m.interactive?.button_reply?.title : undefined;
        if (!text) continue;
        await handleInboundMessage(whatsapp, { from: m.from, text, messageId: m.id });
      }
    }
  }
  return json({ ok: true });
});
