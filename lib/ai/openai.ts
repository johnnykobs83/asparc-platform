import { env } from '../config/env';
import { fetchWithTimeout } from '../integrations/log';

export interface OaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export const isOpenAIConfigured = () => Boolean(env.openaiKey);

/**
 * GPT-5/GPT-6 and o-series models are reasoning models. On Chat Completions they take
 * max_completion_tokens (not max_tokens) and reject temperature unless reasoning is off,
 * and GPT-6 Luna/Sol only allow function calling with reasoning_effort "none".
 */
export const isReasoningModel = (model: string) => /^(gpt-5|gpt-6|o\d)/i.test(model);

/** The request body for a model: older chat models and the newer reasoning models differ. */
export function chatRequestBody(model: string, messages: OaMessage[], tools: readonly unknown[]) {
  const base = { model, messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) };
  return isReasoningModel(model)
    ? { ...base, reasoning_effort: 'none', max_completion_tokens: 1000 }
    : { ...base, temperature: 0.3, max_tokens: 500 };
}

/** Chat Completions with function calling over fetch (no SDK). */
export async function chatCompletion(messages: OaMessage[], tools: readonly unknown[]): Promise<OaMessage> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    timeoutMs: 25_000,
    headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(chatRequestBody(env.openaiModel, messages, tools)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices: { message: OaMessage }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error('OpenAI returned no message');
  return msg;
}
