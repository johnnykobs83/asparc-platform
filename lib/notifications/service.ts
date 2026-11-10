import { env } from '../config/env';
import { db } from '../db';
import type { Notification, NotificationType } from '../db/types';
import { emailLayout, escapeHtml, sendEmail } from '../integrations/resend';
import { listKnowledge } from '../kb/service';

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  qualified_lead: 'New qualified lead',
  academy_enquiry: 'Academy enquiry',
  club_partnership: 'Club partnership enquiry',
  complaint: 'Complaint',
  unresolved_question: 'Unresolved AI question',
  booking_request: 'Booking request',
  payment_confirmation: 'Payment confirmation',
  escalation: 'Escalated conversation',
  daily_summary: 'Daily summary',
  integration_error: 'Integration error',
};

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  severity?: Notification['severity'];
  linkPath?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  /** Override the settings-based decision */
  email?: boolean;
}

async function emailTypes(): Promise<Set<string>> {
  const items = await listKnowledge();
  const s = items.find((i) => i.key === 'settings.notifications');
  return new Set(((s?.data as { email_types?: string[] })?.email_types ?? []) as string[]);
}

/**
 * Creates a dashboard notification and, where enabled, emails management.
 * Dashboard notification always succeeds even if email fails.
 */
export async function notify(input: NotifyInput): Promise<Notification> {
  const repo = db();
  const wantsEmail = input.email ?? (await emailTypes()).has(input.type);
  const n = await repo.insert('notifications', {
    type: input.type,
    title: input.title.slice(0, 200),
    body: input.body.slice(0, 4000),
    severity: input.severity ?? 'info',
    link_path: input.linkPath ?? null,
    lead_id: input.leadId ?? null,
    conversation_id: input.conversationId ?? null,
    email_status: wantsEmail ? 'pending' : 'not_required',
  });
  if (!wantsEmail) return n;

  const link = input.linkPath ? `${env.siteUrl}${input.linkPath}` : `${env.siteUrl}/admin/notifications`;
  const result = await sendEmail({
    to: env.notifyEmailTo,
    subject: `[ASPARC] ${NOTIFICATION_LABELS[input.type]}: ${input.title}`.slice(0, 180),
    html: emailLayout(input.title, `<p>${escapeHtml(input.body).replace(/\n/g, '<br/>')}</p>`, { label: 'Open in dashboard', url: link }),
    text: `${input.title}\n\n${input.body}\n\n${link}`,
    entityType: 'notification',
    entityId: n.id,
  });
  const updated = await repo.update('notifications', n.id, {
    email_status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'not_configured',
    email_error: result.error ?? null,
  });
  return updated ?? n;
}
