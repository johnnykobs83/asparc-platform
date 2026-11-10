import { env } from '../config/env';
import { db } from '../db';
import { LEAD_SOURCE_LABELS, type DailySummary, type LeadSource } from '../db/types';
import { emailLayout, escapeHtml, sendEmail } from '../integrations/resend';
import { listKnowledge } from '../kb/service';
import { addDays, melbourneDate, melbourneDayRange, TZ } from '../time/melbourne';

export interface SummaryData {
  date: string;
  timezone: string;
  totalEnquiries: number;
  newLeadsByChannel: { source: LeadSource; label: string; count: number }[];
  academyEnquiries: number;
  bookingRequests: number;
  conversations: number;
  qualifiedLeads: number;
  payments: { connected: boolean; count: number; totalCents: number };
  outstandingFollowUps: { id: string; name: string; type: string; stage: string; due: string | null }[];
  attentionItems: { kind: 'lead' | 'conversation'; id: string; reason: string }[];
}

/** Builds the summary for a Melbourne calendar day from real records only. */
export async function buildDailySummary(ymd: string): Promise<SummaryData> {
  const repo = db();
  const { start, end } = melbourneDayRange(ymd);
  const [leads, bookings, regs, convos, payments, openLeads, attentionConvos, customers] = await Promise.all([
    repo.list('leads', { since: start, until: end }),
    repo.list('booking_requests', { since: start, until: end }),
    repo.list('academy_registrations', { since: start, until: end }),
    repo.list('conversations', { since: start, until: end }),
    repo.list('payments', { since: start, until: end }),
    repo.list('leads', { limit: 1000 }),
    repo.list('conversations', { eq: { needs_attention: true }, limit: 200 }),
    repo.list('customers', { limit: 2000 }),
  ]);
  const nameOf = new Map(customers.map((c) => [c.id, c.full_name]));

  const bySource = new Map<LeadSource, number>();
  for (const l of leads) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  const outstanding = openLeads
    .filter((l) => l.follow_up_status !== 'done' && !['converted', 'not_proceeding'].includes(l.stage))
    .filter((l) => !l.follow_up_due || l.follow_up_due < end)
    .sort((a, b) => (a.follow_up_due ?? '').localeCompare(b.follow_up_due ?? ''))
    .slice(0, 25);

  const attention = [
    ...openLeads.filter((l) => l.needs_attention && l.follow_up_status !== 'done').map((l) => ({ kind: 'lead' as const, id: l.id, reason: l.attention_reason ?? 'Needs attention' })),
    ...attentionConvos.filter((c) => c.status !== 'closed').map((c) => ({ kind: 'conversation' as const, id: c.id, reason: c.attention_reason ?? 'Needs attention' })),
  ].slice(0, 25);

  return {
    date: ymd,
    timezone: TZ,
    totalEnquiries: leads.length,
    newLeadsByChannel: [...bySource.entries()].map(([source, count]) => ({ source, label: LEAD_SOURCE_LABELS[source] ?? source, count })).sort((a, b) => b.count - a.count),
    academyEnquiries: leads.filter((l) => l.lead_type === 'academy').length + regs.filter((r) => !leads.some((l) => l.id === r.lead_id)).length,
    bookingRequests: bookings.length,
    conversations: convos.length,
    qualifiedLeads: leads.filter((l) => l.is_qualified).length,
    payments: { connected: Boolean(env.stripeKey), count: succeeded.length, totalCents: succeeded.reduce((s, p) => s + p.amount_cents, 0) },
    outstandingFollowUps: outstanding.map((l) => ({ id: l.id, name: nameOf.get(l.customer_id) ?? 'Unknown', type: l.lead_type, stage: l.stage, due: l.follow_up_due })),
    attentionItems: attention,
  };
}

export function renderSummaryText(s: SummaryData): string {
  return [
    `ASPARC daily summary – ${s.date} (Melbourne time)`,
    `Total enquiries: ${s.totalEnquiries} (qualified: ${s.qualifiedLeads})`,
    `New leads by channel: ${s.newLeadsByChannel.length ? s.newLeadsByChannel.map((c) => `${c.label} ${c.count}`).join(', ') : 'none'}`,
    `Academy enquiries: ${s.academyEnquiries}`,
    `Booking requests: ${s.bookingRequests}`,
    `Website chats: ${s.conversations}`,
    `Payments: ${s.payments.connected ? `${s.payments.count} ($${(s.payments.totalCents / 100).toFixed(2)})` : 'not connected'}`,
    `Outstanding follow-ups: ${s.outstandingFollowUps.length}`,
    ...s.outstandingFollowUps.slice(0, 10).map((f) => `  - ${f.name} (${f.type.replace(/_/g, ' ')}, ${f.stage.replace(/_/g, ' ')})`),
    `Needs management attention: ${s.attentionItems.length}`,
    ...s.attentionItems.slice(0, 10).map((a) => `  - ${a.reason}`),
  ].join('\n');
}

function renderSummaryHtml(s: SummaryData): string {
  const row = (k: string, v: string | number) =>
    `<tr><td style="padding:6px 0;color:#5b6670">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${escapeHtml(String(v))}</td></tr>`;
  const list = (items: string[]) => (items.length ? `<ul style="padding-left:18px;margin:6px 0">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p style="color:#5b6670;margin:6px 0">None</p>');
  return `<table width="100%" style="border-collapse:collapse">${[
    row('Total enquiries', s.totalEnquiries),
    row('Qualified leads', s.qualifiedLeads),
    row('Academy enquiries', s.academyEnquiries),
    row('Booking requests', s.bookingRequests),
    row('Website chats', s.conversations),
    row('Payments', s.payments.connected ? `${s.payments.count} · $${(s.payments.totalCents / 100).toFixed(2)}` : 'Not connected'),
  ].join('')}</table>
<h3 style="color:#14519C;font-size:15px;margin:20px 0 4px">New leads by channel</h3>${list(s.newLeadsByChannel.map((c) => `${c.label}: ${c.count}`))}
<h3 style="color:#14519C;font-size:15px;margin:20px 0 4px">Outstanding follow-ups (${s.outstandingFollowUps.length})</h3>${list(s.outstandingFollowUps.slice(0, 15).map((f) => `${f.name} – ${f.type.replace(/_/g, ' ')} (${f.stage.replace(/_/g, ' ')})`))}
<h3 style="color:#14519C;font-size:15px;margin:20px 0 4px">Requires attention (${s.attentionItems.length})</h3>${list(s.attentionItems.slice(0, 15).map((a) => a.reason))}`;
}

/**
 * Generates (or regenerates) and stores the summary, creates a dashboard
 * notification and emails management if configured.
 * Default day = yesterday in Melbourne (the cron runs early morning).
 */
export async function runDailySummary(opts: { date?: string; email?: boolean } = {}): Promise<DailySummary> {
  const repo = db();
  const ymd = opts.date ?? addDays(melbourneDate(), -1);
  const data = await buildDailySummary(ymd);

  const settings = (await listKnowledge()).find((k) => k.key === 'settings.notifications');
  const wantEmail = opts.email ?? ((settings?.data as { daily_summary_email?: boolean })?.daily_summary_email ?? true);

  let emailStatus: DailySummary['email_status'] = 'not_required';
  if (wantEmail) {
    const r = await sendEmail({
      to: env.notifyEmailTo,
      subject: `[ASPARC] Daily summary – ${ymd}: ${data.totalEnquiries} enquiries, ${data.attentionItems.length} need attention`,
      html: emailLayout(`Daily summary – ${ymd}`, renderSummaryHtml(data), { label: 'Open dashboard', url: `${env.siteUrl}/admin/reports` }),
      text: renderSummaryText(data),
      entityType: 'daily_summary',
    });
    emailStatus = r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'not_configured';
  }

  const existing = await repo.findOne('daily_summaries', { summary_date: ymd });
  const row = existing
    ? (await repo.update('daily_summaries', existing.id, { data: data as unknown as Record<string, unknown>, email_status: emailStatus }))!
    : await repo.insert('daily_summaries', { summary_date: ymd, timezone: TZ, data: data as unknown as Record<string, unknown>, email_status: emailStatus });

  await repo.insert('notifications', {
    type: 'daily_summary',
    title: `Daily summary – ${ymd}`,
    body: renderSummaryText(data),
    severity: data.attentionItems.length ? 'important' : 'info',
    link_path: '/admin/reports',
    email_status: emailStatus,
  });
  return row;
}
