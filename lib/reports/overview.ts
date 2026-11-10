import { env } from '../config/env';
import { db } from '../db';
import { LEAD_SOURCE_LABELS, LEAD_STAGES, LEAD_STAGE_LABELS, LEAD_TYPE_LABELS } from '../db/types';
import { addDays, melbourneDate, melbourneDayRange } from '../time/melbourne';

export async function getOverview(days = 30) {
  const repo = db();
  const today = melbourneDate();
  const from = melbourneDayRange(addDays(today, -(days - 1))).start;
  const [leads, allLeads, bookings, regs, convos, payments, unread, attentionConvos] = await Promise.all([
    repo.list('leads', { since: from }),
    repo.list('leads', { limit: 2000 }),
    repo.list('booking_requests', { since: from }),
    repo.list('academy_registrations', { since: from }),
    repo.list('conversations', { since: from }),
    repo.list('payments', { since: from }),
    repo.count('notifications', { eq: { read_at: null } }),
    repo.list('conversations', { eq: { needs_attention: true }, limit: 100 }),
  ]);

  const daily: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const r = melbourneDayRange(d);
    daily.push({ date: d, count: leads.filter((l) => l.created_at >= r.start && l.created_at < r.end).length });
  }

  const tally = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  return {
    periodDays: days,
    kpis: {
      totalEnquiries: leads.length,
      newLeads: allLeads.filter((l) => l.stage === 'new_enquiry').length,
      qualifiedLeads: leads.filter((l) => l.is_qualified).length,
      bookingRequests: bookings.length,
      academyRegistrations: regs.length,
      conversations: convos.length,
      unreadNotifications: unread,
      revenue: env.stripeKey ? { connected: true, cents: succeeded.reduce((s, p) => s + p.amount_cents, 0), count: succeeded.length } : { connected: false, cents: 0, count: 0 },
    },
    attention: {
      leads: allLeads.filter((l) => l.needs_attention && l.follow_up_status !== 'done').length,
      conversations: attentionConvos.filter((c) => c.status !== 'closed').length,
      overdueFollowUps: allLeads.filter((l) => l.follow_up_status !== 'done' && l.follow_up_due && l.follow_up_due < new Date().toISOString() && !['converted', 'not_proceeding'].includes(l.stage)).length,
    },
    daily,
    sources: tally(leads.map((l) => l.source)).map(([k, v]) => ({ key: k, label: LEAD_SOURCE_LABELS[k] ?? k, count: v })),
    types: tally(leads.map((l) => l.lead_type)).map(([k, v]) => ({ key: k, label: LEAD_TYPE_LABELS[k] ?? k, count: v })),
    funnel: LEAD_STAGES.map((s) => ({ key: s, label: LEAD_STAGE_LABELS[s], count: allLeads.filter((l) => l.stage === s).length })),
  };
}
