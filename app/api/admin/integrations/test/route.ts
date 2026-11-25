import { z } from 'zod';
import { env } from '@/lib/config/env';
import { chatCompletion, isOpenAIConfigured } from '@/lib/ai/openai';
import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { testHubSpotConnection } from '@/lib/integrations/hubspot';
import { logIntegration } from '@/lib/integrations/log';
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
      // A real request with the configured model and a tool, the same shape the receptionist sends.
      try {
        const msg = await chatCompletion(
          [{ role: 'system', content: 'Connection test. Reply with the single word OK.' }, { role: 'user', content: 'Test' }],
          [{ type: 'function', function: { name: 'noop', description: 'Not used.', parameters: { type: 'object', properties: {} } } }],
        );
        result = { ok: true, message: `Working. Model in use: ${env.openaiModel} (replied “${(msg.content ?? '').trim().slice(0, 40) || 'tool call'}”).` };
      } catch (e) {
        result = { ok: false, message: `Model ${env.openaiModel}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400) };
      }
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
