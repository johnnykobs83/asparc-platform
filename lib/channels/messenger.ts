import { env } from '../config/env';
import { fetchWithTimeout, logIntegration } from '../integrations/log';
import type { ChannelAdapter } from './types';
import { renderActionsAsText } from './whatsapp';

/**
 * PHASE 3 – Facebook Messenger and Instagram messaging (Messenger Platform).
 * Prepared but NOT active: META_MESSENGER_ENABLED must be "true", the Page
 * access token and app secret configured, and Meta app review completed for
 * `pages_messaging` and `instagram_manage_messages`.
 *
 * Like WhatsApp, the adapter only ever REPLIES to an inbound message (inside
 * the platform's 24-hour window). It never messages anyone first.
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
/** Per-message text limits set by the platforms. */
const TEXT_LIMIT = { facebook: 2000, instagram: 1000 } as const;
const MAX_QUICK_REPLIES = 13;
const QUICK_REPLY_TITLE_LIMIT = 20;

export const messengerEnabled = () => env.messengerEnabled && Boolean(env.metaPageToken && env.metaAppSecret && env.metaVerifyToken);

/** Splits long text on paragraph/sentence boundaries so each part fits the platform limit. */
export function chunkText(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1, window.lastIndexOf(' '));
    const at = cut > limit * 0.4 ? cut : limit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function post(integrationAction: string, recipient: string, message: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetchWithTimeout(`${GRAPH}/me/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.metaPageToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipient }, messaging_type: 'RESPONSE', message }),
    });
    if (!r.ok) throw new Error(`Messenger ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await logIntegration({ integration: 'messenger', action: integrationAction, status: 'success' });
    return { ok: true };
  } catch (e) {
    await logIntegration({ integration: 'messenger', action: integrationAction, status: 'error', error: String(e) });
    return { ok: false, error: String(e) };
  }
}

function makeAdapter(channel: 'facebook' | 'instagram'): ChannelAdapter {
  const limit = TEXT_LIMIT[channel];
  const plain = (s: string) => s.replace(/\*\*/g, '');

  async function sendParts(recipient: string, text: string, options: string[] = []) {
    if (!messengerEnabled()) return { ok: false, error: 'Messenger not enabled' };
    const parts = chunkText(plain(text), limit);
    let last: { ok: boolean; error?: string } = { ok: true };
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const message: Record<string, unknown> = { text: parts[i] };
      if (isLast && options.length) {
        message.quick_replies = options.map((title) => ({ content_type: 'text', title, payload: title }));
      }
      last = await post(`send_${channel}`, recipient, message);
      if (!last.ok) return last;
    }
    return last;
  }

  return {
    channel,
    enabled: messengerEnabled,
    renderActions: renderActionsAsText,
    send: (recipient, text) => sendParts(recipient, text),
    /** Quick replies: at most 13, each title at most 20 characters; otherwise plain text. */
    sendWithOptions(recipient, text, options) {
      const fits = options.length > 0 && options.length <= MAX_QUICK_REPLIES && options.every((o) => o.length <= QUICK_REPLY_TITLE_LIMIT);
      if (!fits) return sendParts(recipient, `${text}\n\n${renderActionsAsText([{ type: 'quick_replies', options }])}`);
      return sendParts(recipient, text, options);
    },
  };
}

export const facebookMessenger = makeAdapter('facebook');
export const instagramMessaging = makeAdapter('instagram');
