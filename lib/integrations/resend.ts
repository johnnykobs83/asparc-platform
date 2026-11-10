import { env } from '../config/env';
import { fetchWithTimeout, logIntegration } from './log';

export const isResendConfigured = () => Boolean(env.resendKey && env.resendFrom);

export interface EmailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
  entityType?: string;
  entityId?: string | null;
}

export type EmailResult = { status: 'sent' | 'not_configured' | 'failed'; id?: string; error?: string };

/** Sends via Resend's REST API. Never throws. */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isResendConfigured() || input.to.length === 0) {
    await logIntegration({
      integration: 'resend',
      action: 'send_email',
      status: 'skipped',
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      detail: { reason: input.to.length ? 'RESEND_API_KEY / RESEND_FROM not set' : 'No recipients' , subject: input.subject },
    });
    return { status: 'not_configured' };
  }
  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.resendFrom, to: input.to, subject: input.subject, html: input.html, text: input.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? 'error'}`);
    await logIntegration({ integration: 'resend', action: 'send_email', status: 'success', entity_type: input.entityType ?? null, entity_id: input.entityId ?? null, detail: { id: body.id, subject: input.subject, recipients: input.to.length } });
    return { status: 'sent', id: body.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await logIntegration({ integration: 'resend', action: 'send_email', status: 'error', entity_type: input.entityType ?? null, entity_id: input.entityId ?? null, error });
    return { status: 'failed', error };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Branded, email-client-safe HTML wrapper. */
export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F2F5F8;font-family:Arial,Helvetica,sans-serif;color:#101820">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden">
<tr><td align="center" style="background:#FFFFFF;padding:20px 28px 12px"><img src="${env.siteUrl}/brand/asparc-logo.jpg" width="110" height="102" alt="ASPARC – Australian Sports Performance and Rehabilitation Centre" style="display:block;border:0;width:110px;height:auto;color:#14519C;font-size:20px;font-weight:bold"></td></tr>
<tr><td style="height:4px;background:#14519C"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#14519C">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.55">${bodyHtml}</div>
${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="background:#14519C;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:bold">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#F2F5F8;font-size:12px;color:#5b6670">HIGH PERFORMANCE STARTS HERE. · ${esc(env.siteUrl.replace(/^https?:\/\//, ''))}</td></tr>
</table></td></tr></table></body></html>`;
}

export { esc as escapeHtml };
