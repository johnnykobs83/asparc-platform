import { db } from '../db';
import type { Channel, Conversation, Message } from '../db/types';
import { facebookMessenger, instagramMessaging } from './messenger';
import type { ChannelAdapter } from './types';
import { whatsapp } from './whatsapp';

/**
 * Hand-over from ASPARC AI to a person, for messaging channels.
 *
 * A staff member can reply to a WhatsApp / Messenger / Instagram conversation
 * from the dashboard. Doing so pauses the AI for that conversation (so the
 * customer is never answered by both) until staff hand it back.
 *
 * Staff can only reply inside the platform's 24-hour window after the
 * customer's last message – outside it, Meta requires pre-approved templates,
 * which are deliberately not built.
 */

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ChannelState {
  opted_out?: boolean;
  last_message_id?: string;
  /** Platform address needed to reply (phone number / page-scoped id). Kept only on messaging-channel conversations. */
  reply_to?: string;
  last_inbound_at?: string;
  human_takeover?: boolean;
}

const ADAPTERS: Partial<Record<Channel, ChannelAdapter>> = {
  whatsapp,
  facebook: facebookMessenger,
  instagram: instagramMessaging,
};

export const adapterFor = (channel: Channel): ChannelAdapter | null => ADAPTERS[channel] ?? null;

export type StaffReplyResult = { ok: true; message: Message; conversation: Conversation } | { ok: false; status: number; error: string };

export async function sendStaffReply(conversationId: string, text: string, staffEmail: string, nowMs = Date.now()): Promise<StaffReplyResult> {
  const repo = db();
  const conversation = await repo.get('conversations', conversationId);
  if (!conversation) return { ok: false, status: 404, error: 'Conversation not found' };

  const adapter = adapterFor(conversation.channel);
  if (!adapter) {
    return { ok: false, status: 422, error: 'Website chat visitors cannot be messaged from here. Use the contact details on their lead instead.' };
  }
  if (!adapter.enabled()) return { ok: false, status: 422, error: 'This messaging channel is not switched on.' };

  const state = (conversation.state ?? {}) as ChannelState;
  if (state.opted_out) return { ok: false, status: 422, error: 'This person has opted out of messages (they sent STOP).' };
  if (!state.reply_to || !state.last_inbound_at) return { ok: false, status: 422, error: 'There is no message from this person to reply to.' };
  if (nowMs - Date.parse(state.last_inbound_at) > REPLY_WINDOW_MS) {
    return { ok: false, status: 422, error: 'The 24-hour reply window has closed. You can reply once they message again, or use the contact details on their lead.' };
  }

  const sent = await adapter.send(state.reply_to, text);
  if (!sent.ok) return { ok: false, status: 502, error: 'The message could not be sent. Check Integrations for the error and try again.' };

  const message = await repo.insert('messages', {
    conversation_id: conversation.id,
    role: 'assistant',
    content: text.slice(0, 8000),
    tool_name: null,
    metadata: { staff: staffEmail },
  });
  const updated = await repo.update('conversations', conversation.id, {
    state: { ...state, human_takeover: true },
    message_count: conversation.message_count + 1,
    last_message_at: new Date(nowMs).toISOString(),
    needs_attention: false,
    attention_reason: null,
  });
  return { ok: true, message, conversation: updated ?? conversation };
}

/** Pauses or resumes the AI for a conversation without sending anything. */
export async function setHumanTakeover(conversationId: string, on: boolean): Promise<Conversation | null> {
  const repo = db();
  const conversation = await repo.get('conversations', conversationId);
  if (!conversation) return null;
  return repo.update('conversations', conversationId, { state: { ...(conversation.state ?? {}), human_takeover: on } });
}
