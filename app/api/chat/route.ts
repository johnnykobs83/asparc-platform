import { z } from 'zod';
import { handleChatMessage } from '@/lib/ai/receptionist';
import { clientIp, error, handler, json, readJson } from '@/lib/http/respond';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  message: z.string().trim().min(1).max(1000),
});

/** Website chat – public, rate limited, every message runs through guardrails. */
export const POST = handler(async (req) => {
  const ip = clientIp(req);
  const rl = rateLimit(`chat:${ip}`, 30, 5 * 60_000);
  if (!rl.ok) return error('You are sending messages too quickly. Please wait a moment.', 429);
  const body = Body.parse(await readJson(req, 4000));
  const reply = await handleChatMessage({ ...body, channel: 'website' });
  return json(reply);
});
