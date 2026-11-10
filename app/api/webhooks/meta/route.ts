import { handleInboundMessage } from '@/lib/channels/inbound';
import { facebookMessenger, instagramMessaging, messengerEnabled } from '@/lib/channels/messenger';
import { verifyMetaSignature } from '@/lib/channels/whatsapp';
import { env } from '@/lib/config/env';
import { error, handler, json } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** PHASE 3 – Meta webhook verification handshake. Inactive until META_MESSENGER_ENABLED=true. */
export const GET = handler(async (req) => {
  if (!messengerEnabled()) return error('Messenger / Instagram channel is not enabled', 503);
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === env.metaVerifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return error('Verification failed', 403);
});

interface MessagingEvent {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

/** PHASE 3 – inbound Messenger (object "page") and Instagram (object "instagram") messages → central receptionist → reply. */
export const POST = handler(async (req) => {
  if (!messengerEnabled()) return error('Messenger / Instagram channel is not enabled', 503);
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) return error('Invalid signature', 401);
  const payload = JSON.parse(raw) as { object?: string; entry?: { messaging?: MessagingEvent[] }[] };
  const adapter = payload.object === 'instagram' ? instagramMessaging : payload.object === 'page' ? facebookMessenger : null;
  if (!adapter) return json({ ok: true, ignored: true });
  for (const entry of payload.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      // Skip our own outgoing messages (echoes) and anything that is not text.
      if (!ev.sender?.id || !ev.message?.text || ev.message.is_echo) continue;
      await handleInboundMessage(adapter, { from: ev.sender.id, text: ev.message.text, messageId: ev.message.mid });
    }
  }
  return json({ ok: true });
});
