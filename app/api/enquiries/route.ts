import { db } from '@/lib/db';
import { handler, clientIp, error, json, readJson } from '@/lib/http/respond';
import { submitEnquiry } from '@/lib/leads/service';
import { rateLimit } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';

/** All website forms (contact, academy, booking, club, massage) and the in-chat form. */
export const POST = handler(async (req) => {
  const rl = rateLimit(`enquiry:${clientIp(req)}`, 8, 10 * 60_000);
  if (!rl.ok) return error('Too many submissions. Please try again shortly.', 429);
  const body = await readJson<Record<string, unknown>>(req, 16_000);
  if (typeof body.website === 'string' && body.website.length > 0) return json({ ok: true }); // honeypot: silently accept
  const result = await submitEnquiry(body);
  if (typeof body.conversation_id === 'string') {
    await db().insert('messages', {
      conversation_id: body.conversation_id,
      role: 'assistant',
      content: 'Thanks – your details have been sent to the ASPARC team and someone will be in touch. Nothing has been booked, registered or charged yet; the team will confirm everything with you directly.',
      metadata: { event: 'enquiry_submitted', lead_id: result.leadId },
    });
  }
  return json({
    ok: true,
    reference: result.leadId.slice(0, 8).toUpperCase(),
    message:
      'Thanks – your enquiry has been received and the ASPARC team will be in touch. This is not a booking or payment confirmation.',
  }, 201);
});
