import { env } from '../config/env';
import { fetchWithTimeout } from '../integrations/log';

export interface OaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export const isOpenAIConfigured = () => Boolean(env.openaiKey);

/** Chat Completions with function calling over fetch (no SDK). */
export async function chatCompletion(messages: OaMessage[], tools: readonly unknown[]): Promise<OaMessage> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    timeoutMs: 25_000,
    headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.openaiModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 500,
    }),
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
