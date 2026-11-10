import type { ChatAction } from '../ai/types';
import type { Channel } from '../db/types';

/**
 * Every messaging channel plugs into the SAME receptionist
 * (lib/ai/receptionist.ts → same knowledge base, guardrails and tools).
 *
 * Identity separation: each channel uses its own visitor identifier
 * (website: random browser id; WhatsApp: hashed wa_id; Messenger/Instagram:
 * hashed page-scoped id). Conversations are never merged across channels
 * unless a customer is verified and has consented.
 */
export interface ChannelAdapter {
  channel: Channel;
  enabled(): boolean;
  /** Converts rich actions (forms, buttons) into something the channel supports. */
  renderActions(actions: ChatAction[]): string;
  send(recipient: string, text: string): Promise<{ ok: boolean; error?: string }>;
  /** Optional: send text with tappable choices (buttons / quick replies). Falls back to plain text when unsupported. */
  sendWithOptions?(recipient: string, text: string, options: string[]): Promise<{ ok: boolean; error?: string }>;
}
