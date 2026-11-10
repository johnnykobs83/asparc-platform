import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChatAction } from '../ai/types';
import { env } from '../config/env';
import { fetchWithTimeout, logIntegration } from '../integrations/log';
import { channelVisitorId } from './inbound';
import type { ChannelAdapter } from './types';

export { channelVisitorId };

/**
 * PHASE 2 – WhatsApp Business Platform (Cloud API) adapter.
 * Prepared but NOT active: WHATSAPP_ENABLED must be "true" and Meta
 * credentials configured, then tested end-to-end (see docs/PHASE-2-WHATSAPP.md).
 *
 * Messaging window: the adapter only ever REPLIES to an inbound message
 * (inside WhatsApp's 24-hour customer-service window). Business-initiated
 * messages need pre-approved templates and are deliberately not implemented.
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
export const FORM_PAGES: Record<string, string> = {
  academy: '/performance-academy#register',
  booking: '/contact?form=booking',
  club: '/contact?form=club',
  massage: '/recovery-remedial-massage#enquire',
  contact: '/contact',
};

/** Plain-text rendering of receptionist actions, shared by every messaging channel. */
export function renderActionsAsText(actions: ChatAction[]): string {
  const out: string[] = [];
  for (const a of actions) {
    if (a.type === 'enquiry_form') out.push(`You can send your details securely here: ${env.siteUrl}${FORM_PAGES[a.form] ?? '/contact'}`);
    if (a.type === 'payment_link') out.push(`${a.label}: ${a.url}`);
    if (a.type === 'quick_replies') out.push(`You can ask about: ${a.options.join(' · ')}`);
  }
  return out.join('\n');
}

const clean = (text: string, max: number) => text.replace(/\*\*/g, '*').slice(0, max);
const enabled = () => env.whatsappEnabled && Boolean(env.whatsappToken && env.whatsappPhoneNumberId && env.metaAppSecret);

async function post(message: Record<string, unknown>, action: string): Promise<{ ok: boolean; error?: string }> {
  if (!enabled()) return { ok: false, error: 'WhatsApp not enabled' };
  try {
    const r = await fetchWithTimeout(`${GRAPH}/${env.whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...message }),
    });
    if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await logIntegration({ integration: 'whatsapp', action, status: 'success' });
    return { ok: true };
  } catch (e) {
    await logIntegration({ integration: 'whatsapp', action, status: 'error', error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export const whatsapp: ChannelAdapter = {
  channel: 'whatsapp',
  enabled,
  renderActions: renderActionsAsText,
  send(to: string, text: string) {
    return post({ to, type: 'text', text: { body: clean(text, 4000) } }, 'send');
  },
  /**
   * WhatsApp reply buttons: at most 3, each title at most 20 characters.
   * Anything that does not fit is sent as plain text instead.
   */
  sendWithOptions(to: string, text: string, options: string[]) {
    const fits = options.length > 0 && options.length <= 3 && options.every((o) => o.length <= 20);
    if (!fits) return post({ to, type: 'text', text: { body: clean(`${text}\n\n${renderActionsAsText([{ type: 'quick_replies', options }])}`, 4000) } }, 'send');
    return post(
      {
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: clean(text, 1024) },
          action: { buttons: options.map((title, i) => ({ type: 'reply', reply: { id: `opt_${i}`, title } })) },
        },
      },
      'send_buttons',
    );
  },
};

/** Verifies Meta's X-Hub-Signature-256 header (used by WhatsApp, Messenger and Instagram webhooks). */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=') || !env.metaAppSecret) return false;
  const expected = createHmac('sha256', env.metaAppSecret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
