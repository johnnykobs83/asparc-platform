import { z } from 'zod';
import { env } from '@/lib/config/env';
import { isOpenAIConfigured } from '@/lib/ai/openai';
import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { testHubSpotConnection } from '@/lib/integrations/hubspot';
import { fetchWithTimeout, logIntegration } from '@/lib/integrations/log';
import { emailLayout, sendEmail } from '@/lib/integrations/resend';

export const dynamic = 'force-dynamic';

/** Live connection tests – results reflect real API responses, never assumed. */
export const POST = handler(async (req) => {
  const s = await requireAdmin(req, 'integrations:run');
  const { integration } = z.object({ integration: z.enum(['supabase', 'openai', 'hubspot', 'resend']) }).parse(await readJson(req));
  let result: { ok: boolean; message: string };
  switch (integration) {
    case 'supabase': {
      try {
        const n = await db().count('services');
        result = { ok: db().kind === 'supabase', message: db().kind === 'supabase' ? `Connected – ${n} services in database.` : `Local development store in use (${n} services). Supabase not configured.` };
      } catch (e) {
        result = { ok: false, message: String(e) };
      }
      break;
    }
    case 'openai': {
      if (!isOpenAIConfigured()) { result = { ok: false, message: 'OPENAI_API_KEY is not set – guided mode is active.' }; break; }
      const r = await fetchWithTimeout('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.openaiKey}` } }).catch((e) => e as Error);
      result = r instanceof Response && r.ok ? { ok: true, message: `Key accepted. Model in use: ${env.openaiModel}` } : { ok: false, message: r instanceof Response ? `OpenAI responded ${r.status}` : String(r) };
      await logIntegration({ integration: 'openai', action: 'connection_test', status: result.ok ? 'success' : 'error', error: result.ok ? null : result.message });
      break;
    }
    case 'hubspot':
      result = await testHubSpotConnection();
      await logIntegration({ integration: 'hubspot', action: 'connection_test', status: result.ok ? 'success' : 'error', error: result.ok ? null : result.message });
      break;
    case 'resend': {
      const r = await sendEmail({ to: [s.email], subject: '[ASPARC] Test notification', html: emailLayout('Email notifications are working', '<p>This is a test email from the ASPARC dashboard.</p>'), text: 'Email notifications are working.' });
      result = r.status === 'sent' ? { ok: true, message: `Test email sent to ${s.email}.` } : { ok: false, message: r.error ?? 'RESEND_API_KEY / RESEND_FROM not set.' };
      break;
    }
  }
  return json(result);
});
