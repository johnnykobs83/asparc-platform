import { createHash } from 'node:crypto';
import { handleChatMessage } from '../ai/receptionist';
import { checkInbound } from '../ai/guardrails';
import type { ChatAction } from '../ai/types';
import { env } from '../config/env';
import { db } from '../db';
import type { ChannelAdapter } from './types';

/**
 * Shared inbound flow for every messaging channel (WhatsApp, Messenger,
 * Instagram). Each message goes to the SAME receptionist as the website chat,
 * so the knowledge base, guardrails and tools are identical everywhere.
 *
 * Adds the two things messaging apps need that a website widget does not:
 *  - opt-out: "STOP" silences the assistant for that person until "START"
 *  - de-duplication: platforms redeliver webhooks, so a message id is only
 *    ever processed once
 */

const STOP_WORDS = /^(stop|unsubscribe|opt ?out|cancel|end|quit)[.!]?$/i;
const START_WORDS = /^(start|unstop|subscribe|opt ?in)[.!]?$/i;

export const OPT_OUT_REPLY =
  "You've been opted out and ASPARC AI won't reply to further messages here. Send START at any time to turn replies back on. In an emergency call 000.";
export const OPT_IN_REPLY = 'Replies are back on. How can ASPARC AI help?';

/** Pseudonymous visitor id so phone numbers / platform ids are never used as conversation keys. */
export function channelVisitorId(channel: string, externalId: string): string {
  return `${channel}_${createHash('sha256').update(`${channel}:${externalId}:${env.sessionSecret}`).digest('base64url').slice(0, 40)}`;
}

/** Pulls the quick-reply options out of the receptionist's actions so a channel can show them as buttons. */
export function splitActions(actions: ChatAction[]): { options: string[]; rest: ChatAction[] } {
  const options: string[] = [];
  const rest: ChatAction[] = [];
  for (const a of actions) {
    if (a.type === 'quick_replies') options.push(...a.options);
    else rest.push(a);
  }
  return { options, rest };
}

export interface InboundMessage {
  /** Platform id of the sender (phone number / page-scoped id). Used only to reply and to derive the visitor id. */
  from: string;
  text: string;
  /** Platform message id, for de-duplication. */
  messageId?: string;
}

export type InboundOutcome = 'replied' | 'opted_out' | 'opted_in' | 'silent' | 'duplicate' | 'handed_to_staff';

export const STAFF_WAITING_REASON = 'Customer replied – a staff member is handling this conversation';

export async function handleInboundMessage(adapter: ChannelAdapter, msg: InboundMessage): Promise<InboundOutcome> {
  const repo = db();
  const channel = adapter.channel;
  const visitorId = channelVisitorId(channel, msg.from);
  const text = msg.text.trim();
  if (!text) return 'silent';

  // Most recent conversation for this person on this channel (open or escalated).
  const recent = (await repo.list('conversations', { eq: { channel, visitor_id: visitorId }, limit: 1 }))[0] ?? null;
  const state = (recent?.state ?? {}) as { opted_out?: boolean; last_message_id?: string; human_takeover?: boolean };

  if (msg.messageId && state.last_message_id === msg.messageId) return 'duplicate';
  // reply_to + last_inbound_at let staff reply from the dashboard inside the platform's 24-hour window.
  const stamp = { ...(msg.messageId ? { last_message_id: msg.messageId } : {}), reply_to: msg.from, last_inbound_at: new Date().toISOString() };

  if (STOP_WORDS.test(text)) {
    const conversation = recent ?? (await repo.insert('conversations', { channel, visitor_id: visitorId, status: 'open', state: {} }));
    await repo.update('conversations', conversation.id, { state: { ...state, ...stamp, opted_out: true } });
    if (!state.opted_out) await adapter.send(msg.from, OPT_OUT_REPLY);
    return 'opted_out';
  }

  if (state.opted_out) {
    if (!START_WORDS.test(text)) {
      if (recent && msg.messageId) await repo.update('conversations', recent.id, { state: { ...state, last_message_id: msg.messageId } });
      return 'silent';
    }
    if (recent) await repo.update('conversations', recent.id, { state: { ...state, ...stamp, opted_out: false } });
    await adapter.send(msg.from, OPT_IN_REPLY);
    return 'opted_in';
  }

  // A staff member has taken over: record the message for them and keep the AI out of it.
  // Safety exception: emergencies and self-harm messages always get the immediate 000 / Lifeline reply.
  const urgent = checkInbound(text);
  if (recent && state.human_takeover && recent.status !== 'closed' && !urgent.emergency && !urgent.selfHarm) {
    await repo.insert('messages', { conversation_id: recent.id, role: 'user', content: checkInbound(text).sanitized.slice(0, 8000), tool_name: null, metadata: {} });
    await repo.update('conversations', recent.id, {
      state: { ...state, ...stamp },
      message_count: recent.message_count + 1,
      last_message_at: stamp.last_inbound_at,
      needs_attention: true,
      attention_reason: STAFF_WAITING_REASON,
    });
    return 'handed_to_staff';
  }

  const open = recent && recent.status === 'open' ? recent : null;
  const reply = await handleChatMessage({ channel, visitorId, conversationId: open?.id, message: text });

  const current = await repo.get('conversations', reply.conversationId);
  if (current) await repo.update('conversations', current.id, { state: { ...(current.state ?? {}), ...stamp } });

  const { options, rest } = splitActions(reply.actions);
  const extra = adapter.renderActions(rest);
  const body = extra ? `${reply.reply}\n\n${extra}` : reply.reply;
  if (options.length && adapter.sendWithOptions) await adapter.sendWithOptions(msg.from, body, options);
  else {
    const hint = options.length ? adapter.renderActions([{ type: 'quick_replies', options }]) : '';
    await adapter.send(msg.from, hint ? `${body}\n\n${hint}` : body);
  }
  return 'replied';
}
