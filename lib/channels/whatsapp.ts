import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ChatAction } from '../ai/types';
import { env } from '../config/env';
import { fetchWithTimeout, logIntegration } from '../integrations/log';
import type { ChannelAdapter } from './types';

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
const FORM_PAGES: Record<string, string> = {
  academy: '/performance-academy#register',
  booking: '/contact?form=booking',
  club: '/contact?form=club',
  massage: '/recovery-remedial-massage#enquire',
  contact: '/contact',
};

export const whatsapp: ChannelAdapter = {
  channel: 'whatsapp',
  enabled: () => env.whatsappEnabled && Boolean(env.whatsappToken && env.whatsappPhoneNumberId && env.metaAppSecret),
  renderActions(actions: ChatAction[]) {
    const out: string[] = [];
    for (const a of actions) {
      if (a.type === 'enquiry_form') out.push(`You can send your details securely here: ${env.siteUrl}${FORM_PAGES[a.form] ?? '/contact'}`);
      if (a.type === 'payment_link') out.push(`${a.label}: ${a.url}`);
      if (a.type === 'quick_replies') out.push(`You can ask about: ${a.options.join(' · ')}`);
    }
    return out.join('\n');
  },
  async send(to: string, text: string) {
    if (!this.enabled()) return { ok: false, error: 'WhatsApp not enabled' };
    try {
      const r = await fetchWithTimeout(`${GRAPH}/${env.whatsappPhoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.replace(/\*\*/g, '*').slice(0, 4000) } }),
      });
      if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
      await logIntegration({ integration: 'whatsapp', action: 'send', status: 'success' });
      return { ok: true };
    } catch (e) {
      await logIntegration({ integration: 'whatsapp', action: 'send', status: 'error', error: String(e) });
      return { ok: false, error: String(e) };
    }
  },
};

/** Verifies Meta's X-Hub-Signature-256 header. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=') || !env.metaAppSecret) return false;
  const expected = createHmac('sha256', env.metaAppSecret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Pseudonymous visitor id so phone numbers are not used as conversation keys. */
export function channelVisitorId(channel: string, externalId: string): string {
  return `${channel}_${createHash('sha256').update(`${channel}:${externalId}:${env.sessionSecret}`).digest('base64url').slice(0, 40)}`;
}
