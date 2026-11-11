'use client';

import { useState } from 'react';
import { fmtMoney, useApi } from '../api';
import { BarList, ColumnChart } from '../charts';
import { ErrorNote, Loading, PageHeader, Panel, Select, StatCard } from '../ui';
import { TodayBookings } from './TodayBookings';

interface OverviewData {
  periodDays: number;
  kpis: {
    totalEnquiries: number;
    newLeads: number;
    qualifiedLeads: number;
    bookingRequests: number;
    academyRegistrations: number;
    conversations: number;
    unreadNotifications: number;
    revenue: { connected: boolean; cents: number; count: number };
  };
  attention: { leads: number; conversations: number; overdueFollowUps: number };
  daily: { date: string; count: number }[];
  sources: { key: string; label: string; count: number }[];
  types: { key: string; label: string; count: number }[];
  funnel: { key: string; label: string; count: number }[];
}

export function Overview() {
  const [days, setDays] = useState('30');
  const { data, error, loading } = useApi<OverviewData>(`/api/admin/overview?days=${days}`);
  const attentionTotal = data ? data.attention.leads + data.attention.conversations + data.attention.overdueFollowUps : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Live figures from website enquiries, ASPARC AI conversations and staff updates. Nothing here is estimated or sample data."
        actions={<Select label="Period" value={days} onChange={setDays} options={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]} />}
      />
      <div className="mb-6">
        <TodayBookings />
      </div>
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total enquiries" value={data.kpis.totalEnquiries} hint={`Last ${data.periodDays} days`} href="/admin/leads" />
            <StatCard label="New leads" value={data.kpis.newLeads} hint="Stage: New Enquiry" href="/admin/leads?stage=new_enquiry" />
            <StatCard label="Qualified leads" value={data.kpis.qualifiedLeads} hint={`Last ${data.periodDays} days`} href="/admin/leads" />
            <StatCard label="Booking requests" value={data.kpis.bookingRequests} hint="Awaiting staff confirmation" href="/admin/bookings" />
            <StatCard label="Academy registrations" value={data.kpis.academyRegistrations} href="/admin/academy" />
            <StatCard
              label="Revenue"
              value={data.kpis.revenue.connected ? fmtMoney(data.kpis.revenue.cents) : '—'}
              hint={data.kpis.revenue.connected ? `${data.kpis.revenue.count} payments` : 'Connect Stripe (Phase 4)'}
              tone={data.kpis.revenue.connected ? 'default' : 'muted'}
              href="/admin/revenue"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Requires attention" className="xl:col-span-1">
              {attentionTotal === 0 ? (
                <p className="py-4 text-sm text-muted">All clear – nothing is waiting on management.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {[
                    ['Leads flagged (complaints, club partnerships)', data.attention.leads, '/admin/leads?attention=1'],
                    ['Conversations needing review', data.attention.conversations, '/admin/conversations?attention=1'],
                    ['Overdue follow-ups', data.attention.overdueFollowUps, '/admin/leads'],
                  ].map(([l, n, href]) => (
                    <li key={l as string}>
                      <a href={href as string} className="flex items-center justify-between gap-3 py-3 hover:text-royal">
                        <span>{l}</span>
                        <span className={`min-w-8 rounded-full px-2 py-0.5 text-center font-semibold ${Number(n) > 0 ? 'bg-[#fff4e0] text-warn' : 'bg-mist text-muted'}`}>{n}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={`Enquiries per day · last ${data.periodDays} days`} className="xl:col-span-2">
              <div className="pl-6">
                <ColumnChart
                  data={data.daily.map((d) => ({
                    label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                    value: d.count,
                    sub: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
                  }))}
                />
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Lead sources">
              <BarList data={data.sources.map((s) => ({ label: s.label, value: s.count }))} />
            </Panel>
            <Panel title="Enquiry types">
              <BarList data={data.types.map((s) => ({ label: s.label, value: s.count }))} />
            </Panel>
            <Panel title="Pipeline (all open & closed leads)">
              <BarList data={data.funnel.map((s) => ({ label: s.label, value: s.count }))} />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
