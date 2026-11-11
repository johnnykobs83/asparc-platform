'use client';

import { useMemo } from 'react';
import { label, useApi } from '../api';
import { Badge, Panel } from '../ui';
import { melbourneLocal, money } from './WeekCalendar';

interface Row {
  id: string;
  service_name: string;
  practitioner_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  charge_cents: number | null;
  customer: { full_name: string; phone: string | null } | null;
}

const timeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' });
const TONE: Record<string, 'green' | 'neutral' | 'amber'> = { confirmed: 'green', completed: 'neutral', no_show: 'amber' };

/** Today's online bookings (Melbourne time), in time order, for the Overview page. */
export function TodayBookings() {
  const { data, error, loading } = useApi<{ ready: boolean; appointments: Row[] }>('/api/admin/appointments');
  const today = melbourneLocal(new Date()).ymd;
  const rows = useMemo(
    () => (data?.appointments ?? []).filter((a) => a.status !== 'cancelled' && melbourneLocal(a.starts_at).ymd === today).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [data, today],
  );
  const now = new Date().toISOString();
  const total = rows.filter((a) => a.status !== 'no_show').reduce((sum, a) => sum + (a.charge_cents ?? 0), 0);

  if (data && !data.ready) return null; // online booking has not been set up in the database
  return (
    <Panel
      title={`Today's bookings · ${dateFmt.format(new Date())}`}
      actions={
        <a className="text-sm font-medium text-royal hover:underline" href="/admin/bookings">
          Open week calendar →
        </a>
      }
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && !data && <p className="text-sm text-muted">Loading…</p>}
      {data && rows.length === 0 && <p className="text-sm text-muted">No bookings today.</p>}
      {rows.length > 0 && (
        <>
          <ul className="divide-y divide-line">
            {rows.map((a) => {
              const isNow = a.status === 'confirmed' && a.starts_at <= now && a.ends_at > now;
              return (
                <li key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm ${a.status === 'confirmed' && a.ends_at <= now ? 'opacity-60' : ''}`}>
                  <span className="w-36 shrink-0 whitespace-nowrap font-semibold tabular-nums">
                    {timeFmt.format(new Date(a.starts_at))} – {timeFmt.format(new Date(a.ends_at))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.customer?.full_name ?? 'Customer'}</span>
                    <span className="text-muted"> · {a.service_name} · {a.practitioner_name}</span>
                    {a.customer?.phone && (
                      <a className="ml-2 whitespace-nowrap text-royal hover:underline" href={`tel:${a.customer.phone.replace(/\s/g, '')}`}>
                        {a.customer.phone}
                      </a>
                    )}
                  </span>
                  <span className="tabular-nums">{money(a.charge_cents) ?? <span className="text-muted">On enquiry</span>}</span>
                  {isNow ? <Badge tone="blue">Now</Badge> : <Badge tone={TONE[a.status] ?? 'neutral'}>{label(a.status)}</Badge>}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            {rows.length} booking{rows.length === 1 ? '' : 's'} today{total > 0 ? ` · ${money(total)} booked` : ''}
          </p>
        </>
      )}
    </Panel>
  );
}
