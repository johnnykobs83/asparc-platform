import { db } from '../db';
import type { Channel, Conversation } from '../db/types';
import { logIntegration } from '../integrations/log';
import { notify } from '../notifications/service';
import { loadAiContext, type AiContext } from './context';
import { guidedRespond } from './guided';
import {
  AI_DISCLOSURE,
  CARD_WARNING,
  EMERGENCY_RESPONSE,
  MEDICAL_REDIRECT,
  SELF_HARM_RESPONSE,
  checkInbound,
  checkOutbound,
} from './guardrails';
import { chatCompletion, isOpenAIConfigured, type OaMessage } from './openai';
import { buildSystemPrompt } from './prompt';
import { TOOL_DEFINITIONS, escalate, executeTool, flagConversation, logUnanswered } from './tools';
import type { ChatAction, ChatReply } from './types';

export const GREETING = `Hi, I'm ASPARC AI – your performance assistant. I'm an AI assistant (not a person). I can answer questions about our services, pricing and the Performance Academy, and pass your enquiry to the ASPARC team.`;

const MAX_HISTORY = 16;
const MAX_TOOL_ROUNDS = 4;
const MAX_MESSAGES_PER_CONVERSATION = 80;

interface HandleInput {
  conversationId?: string;
  visitorId: string;
  message: string;
  channel?: Channel;
}

async function getOrCreateConversation(input: HandleInput): Promise<Conversation> {
  const repo = db();
  if (input.conversationId) {
    const c = await repo.get('conversations', input.conversationId);
    // A conversation can only be continued by the visitor that started it.
    if (c && c.visitor_id === input.visitorId && c.channel === (input.channel ?? 'website')) return c;
  }
  return repo.insert('conversations', {
    channel: input.channel ?? 'website',
    visitor_id: input.visitorId,
    ai_mode: isOpenAIConfigured() ? 'openai' : 'guided',
  });
}

async function record(conversation: Conversation, role: 'user' | 'assistant' | 'tool', content: string, extra: { tool_name?: string; metadata?: Record<string, unknown> } = {}) {
  const repo = db();
  await repo.insert('messages', {
    conversation_id: conversation.id,
    role,
    content: content.slice(0, 8000),
    tool_name: extra.tool_name ?? null,
    metadata: extra.metadata ?? {},
  });
  conversation.message_count += 1;
  await repo.update('conversations', conversation.id, {
    message_count: conversation.message_count,
    last_message_at: new Date().toISOString(),
  });
}

async function runOpenAI(conversation: Conversation, userText: string, ctx: AiContext, actions: ChatAction[]) {
  const history = (await db().list('messages', { eq: { conversation_id: conversation.id }, orderBy: 'created_at', ascending: true }))
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY);

  const messages: OaMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];
  // history already contains the current user message (recorded before calling)
  if (!history.length || history[history.length - 1].content !== userText) messages.push({ role: 'user', content: userText });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const msg = await chatCompletion(messages, round === MAX_TOOL_ROUNDS ? [] : TOOL_DEFINITIONS);
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        const result = await executeTool(call.function.name, call.function.arguments, { ctx, conversation, actions });
        await record(conversation, 'tool', JSON.stringify(result).slice(0, 2000), {
          tool_name: call.function.name,
          metadata: { arguments: safeArgs(call.function.arguments) },
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return msg.content?.trim() || "Sorry, I didn't catch that – could you rephrase?";
  }
  return 'Let me pass this to the team so they can help you directly.';
}

/** Strip contact details from logged tool arguments (they live in the customers table). */
function safeArgs(raw: string): Record<string, unknown> {
  try {
    const a = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ['email', 'phone', 'full_name']) if (k in a) a[k] = '[recorded]';
    return a;
  } catch {
    return {};
  }
}

/**
 * Handles one inbound message on any channel. Order of operations:
 *  1. deterministic safety checks (emergency, self-harm, card data, medical, complaint)
 *  2. OpenAI with controlled tools, or guided mode when no key / on failure
 *  3. output validation (no false confirmations, no unknown prices)
 */
export async function handleChatMessage(input: HandleInput): Promise<ChatReply> {
  const conversation = await getOrCreateConversation(input);
  const ctx = await loadAiContext();
  const actions: ChatAction[] = [];
  const check = checkInbound(input.message);
  const firstMessage = conversation.message_count === 0;

  if (conversation.message_count >= MAX_MESSAGES_PER_CONVERSATION) {
    return {
      conversationId: conversation.id,
      reply: 'This conversation has reached its limit. Please leave your details and the team will continue with you directly.',
      actions: [{ type: 'enquiry_form', form: 'contact' }],
      mode: conversation.ai_mode,
    };
  }

  await record(conversation, 'user', check.sanitized, { metadata: check.containedCardNumber ? { redacted: 'payment_card' } : {} });

  const finish = async (reply: string, mode: ChatReply['mode'], meta: Record<string, unknown> = {}) => {
    await record(conversation, 'assistant', reply, { metadata: { mode, ...meta } });
    return { conversationId: conversation.id, reply, actions, mode } satisfies ChatReply;
  };

  // ---- 1. Safety first – these never reach the model ----
  if (check.selfHarm) {
    await escalate(conversation, 'urgent', 'Visitor mentioned self-harm or suicide – wellbeing check required');
    return finish(SELF_HARM_RESPONSE, 'guided', { rule: 'self_harm' });
  }
  if (check.emergency) {
    await flagConversation(conversation, 'Emergency language detected – directed to 000');
    await notify({
      type: 'escalation',
      title: 'Possible emergency mentioned in chat',
      body: `Visitor was directed to call 000.\n\n"${check.sanitized.slice(0, 300)}"`,
      severity: 'urgent',
      linkPath: `/admin/conversations?id=${conversation.id}`,
      conversationId: conversation.id,
    });
    return finish(EMERGENCY_RESPONSE, 'guided', { rule: 'emergency' });
  }
  const prefix: string[] = [];
  if (firstMessage) prefix.push(GREETING);
  if (check.containedCardNumber) prefix.push(CARD_WARNING);
  if (check.askingIfHuman) {
    actions.push({ type: 'quick_replies', options: ['Talk to the team', 'Sports performance', 'Performance Academy'] });
    return finish([...prefix.filter((p) => p !== GREETING), AI_DISCLOSURE].join('\n\n'), 'guided', { rule: 'disclosure' });
  }
  if (check.wantsHuman) {
    await escalate(conversation, 'human_requested', 'Visitor asked to speak with a person');
    actions.push({ type: 'enquiry_form', form: 'contact', leadType: 'general' });
    return finish(
      [...prefix, "I'm an AI assistant, so I've let the ASPARC team know you'd like to speak with someone. Leave your details and a team member will contact you."].join('\n\n'),
      'guided',
      { rule: 'human_requested' },
    );
  }
  if (check.complaint) {
    await escalate(conversation, 'complaint', check.sanitized.slice(0, 500));
    actions.push({ type: 'enquiry_form', form: 'contact', leadType: 'complaint', serviceInterest: 'Complaint / feedback' });
    return finish(
      [...prefix.filter((p) => p !== GREETING), "I'm sorry to hear that. I've passed this straight to ASPARC management. Please leave your contact details so they can respond to you personally."].join('\n\n'),
      'guided',
      { rule: 'complaint' },
    );
  }
  if (check.medical && !isOpenAIConfigured()) {
    actions.push({ type: 'enquiry_form', form: 'contact', leadType: 'rehabilitation', serviceInterest: 'Return-to-performance training' });
    return finish([...prefix, MEDICAL_REDIRECT].join('\n\n'), 'guided', { rule: 'medical' });
  }

  // ---- 2. Respond ----
  let reply: string;
  let mode: ChatReply['mode'] = 'guided';
  if (isOpenAIConfigured()) {
    try {
      reply = await runOpenAI(conversation, check.sanitized, ctx, actions);
      mode = 'openai';
      if (check.medical && !/doctor|physio|practitioner/i.test(reply)) reply = `${MEDICAL_REDIRECT}\n\n${reply}`;
    } catch (e) {
      await logIntegration({ integration: 'openai', action: 'chat_completion', status: 'error', entity_type: 'conversation', entity_id: conversation.id, error: e instanceof Error ? e.message : String(e) });
      const g = guidedRespond(check.sanitized, ctx, { firstMessage });
      reply = g.reply;
      actions.push(...g.actions);
      if (g.unanswered) await logUnanswered(conversation, g.unanswered);
    }
  } else {
    const g = guidedRespond(check.sanitized, ctx, { firstMessage });
    reply = g.reply;
    actions.push(...g.actions);
    if (g.unanswered) await logUnanswered(conversation, g.unanswered);
  }

  // ---- 3. Validate output ----
  const out = checkOutbound(reply, { knownPrices: ctx.knownPrices });
  if (out.violations.length) {
    await flagConversation(conversation, `Guardrail corrected AI reply: ${out.violations.join(', ')}`);
  }
  // The AI disclosure greeting is always prepended in code on the first reply.
  const final = [...prefix, out.reply].join('\n\n');
  return finish(final, mode, out.violations.length ? { violations: out.violations } : {});
}

export async function getConversationTranscript(conversationId: string, visitorId: string) {
  const c = await db().get('conversations', conversationId);
  if (!c || c.visitor_id !== visitorId) return null;
  const msgs = await db().list('messages', { eq: { conversation_id: conversationId }, orderBy: 'created_at', ascending: true });
  return msgs.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
}
