'use client';

import { useMemo, useState } from 'react';
import { ACADEMY_GROUPS, WEEKDAYS, WEEKDAYS_SHORT, ageOn, groupOf, packageOf, timeText } from '@/lib/academy/config';
import { api, fmtDate, fmtMoney, useApi } from '../api';
import { Badge, Button, DataTable, ErrorNote, Loading, Notice, Panel, Select, StatCard, useToast, type Column } from '../ui';

interface Session {
  id: string;
  group_key: string;
  weekday: number;
  start_minutes: number;
  end_minutes: number;
  capacity: number;
  active: boolean;
  taken: number;
  waitlist: number;
}
interface Enrolment {
  id: string;
  customer_id: string;
  athlete_name: string;
  athlete_dob: string;
  group_key: string;
  package: string;
  session_ids: string[];
  casual_date: string | null;
  status: 'awaiting_payment' | 'confirmed' | 'waitlist' | 'cancelled';
  price_cents: number | null;
  paid_at: string | null;
  payment_ref: string | null;
  club: string | null;
  parent_note: string | null;
  staff_note: string | null;
  created_at: string;
  parent: { id: string; full_name: string; email: string | null; phone: string | null } | null;
}
interface Data {
  ready: boolean;
  term?: string;
  sessions?: Session[];
  enrolments?: Enrolment[];
}

const STATUS: Record<Enrolment['status'], [string, 'amber' | 'green' | 'blue' | 'neutral']> = {
  awaiting_payment: ['Awaiting payment', 'amber'],
  confirmed: ['Confirmed', 'green'],
  waitlist: ['Waitlist', 'blue'],
  cancelled: ['Cancelled', 'neutral'],
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());

/** The Football Performance Academy: timetable with places taken, and every enrolment. */
export function FootballAcademySection({ can }: { can: (p: string) => boolean }) {
  const data = useApi<Data>('/api/admin/football-academy');
  const [slot, setSlot] = useState<string | null>(null);
  const [show, setShow] = useState('current');
  const { toast, toastNode } = useToast();

  const sessions = data.data?.sessions ?? [];
  const all = data.data?.enrolments ?? [];
  const rows = useMemo(
    () =>
      all
        .filter((e) => (show === 'current' ? e.status !== 'cancelled' : show === 'all' ? true : e.status === show))
        .filter((e) => !slot || e.session_ids.includes(slot)),
    [all, show, slot],
  );

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  if (!data.data?.ready) return <Notice tone="warn">The Academy timetable isn&apos;t in the database yet. Apply <code>supabase/migrations/20261125000012_football_academy.sql</code> in Supabase, then reload.</Notice>;

  const slotOf = (id: string) => sessions.find((s) => s.id === id);
  const slotText = (s: Session | undefined) => (s ? `${WEEKDAYS_SHORT[s.weekday]} ${timeText(s.start_minutes)}` : '–');
  const count = (st: Enrolment['status']) => all.filter((e) => e.status === st).length;
  const paidTotal = all.filter((e) => e.paid_at && e.status !== 'cancelled').reduce((sum, e) => sum + (e.price_cents ?? 0), 0);

  async function patch(e: Enrolment, body: Record<string, unknown>, done: string) {
    try {
      await api(`/api/admin/football-academy/enrolments/${e.id}`, { method: 'PATCH', body });
      toast(done);
      await data.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err');
    }
  }
  async function markPaid(e: Enrolment) {
    const ref = window.prompt(`Mark ${e.athlete_name}'s enrolment as paid (${fmtMoney(e.price_cents)}).\n\nHow was it paid? (e.g. "Bank transfer 26 Nov" – optional)`, e.payment_ref ?? '');
    if (ref === null) return;
    await patch(e, { paid: true, payment_ref: ref || null }, `${e.athlete_name} marked paid and confirmed`);
  }
  async function setCapacity(s: Session) {
    const v = window.prompt(`Places for ${groupOf(s.group_key)?.name}, ${WEEKDAYS[s.weekday]} ${timeText(s.start_minutes)}:`, String(s.capacity));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 100) return toast('Enter a number from 1 to 100', 'err');
    try {
      await api(`/api/admin/football-academy/sessions/${s.id}`, { method: 'PATCH', body: { capacity: n } });
      toast('Places updated');
      await data.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err');
    }
  }

  const cols: Column<Enrolment>[] = [
    {
      key: 'athlete',
      header: 'Athlete',
      render: (e) => (
        <span>
          <span className="font-medium">{e.athlete_name}</span>
          <span className="block text-xs text-muted">Age {ageOn(e.athlete_dob, today())}{e.club ? ` · ${e.club}` : ''}</span>
        </span>
      ),
      sortValue: (e) => e.athlete_name.toLowerCase(),
    },
    {
      key: 'group',
      header: 'Group',
      render: (e) => {
        const g = groupOf(e.group_key);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: g?.colour }} aria-hidden="true" />
            {g?.name}
          </span>
        );
      },
      sortValue: (e) => e.group_key,
    },
    {
      key: 'package',
      header: 'Package · sessions',
      render: (e) => (
        <span>
          {packageOf(e.package)?.label}
          <span className="block text-xs text-muted">
            {e.session_ids.map((id) => slotText(slotOf(id))).join(' & ')}
            {e.casual_date ? ` · ${fmtDate(`${e.casual_date}T12:00:00Z`, false)}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'parent',
      header: 'Parent',
      render: (e) =>
        e.parent ? (
          <span>
            <a className="font-medium text-royal underline" href={`/admin/clients?id=${e.parent.id}`}>{e.parent.full_name}</a>
            <span className="block text-xs text-muted">{[e.parent.phone, e.parent.email].filter(Boolean).join(' · ')}</span>
          </span>
        ) : (
          '–'
        ),
    },
    { key: 'price', header: 'Price', className: 'text-right', render: (e) => (<span>{fmtMoney(e.price_cents)}<span className="block text-xs text-muted">{e.paid_at ? `Paid ${fmtDate(e.paid_at, false)}` : 'Not paid'}</span></span>), sortValue: (e) => e.price_cents ?? 0 },
    { key: 'status', header: 'Status', render: (e) => <Badge tone={STATUS[e.status][1]}>{STATUS[e.status][0]}</Badge>, sortValue: (e) => ['waitlist', 'awaiting_payment', 'confirmed', 'cancelled'].indexOf(e.status) },
    { key: 'added', header: 'Enrolled', render: (e) => fmtDate(e.created_at, false), sortValue: (e) => e.created_at },
    {
      key: 'actions',
      header: '',
      render: (e) =>
        can('academy:write') ? (
          <span className="flex flex-wrap gap-1.5">
            {!e.paid_at && e.status !== 'cancelled' && <Button size="sm" onClick={() => markPaid(e)}>Mark paid</Button>}
            {e.status === 'waitlist' && <Button size="sm" variant="secondary" onClick={() => patch(e, { status: 'awaiting_payment' }, `${e.athlete_name} given a place`)}>Give place</Button>}
            {e.status !== 'cancelled' && (
              <Button size="sm" variant="danger" onClick={() => window.confirm(`Cancel ${e.athlete_name}'s enrolment? Their place is freed for someone else.${e.paid_at ? '\n\nThey have paid – refund them in Stripe if needed.' : ''}`) && patch(e, { status: 'cancelled' }, 'Enrolment cancelled')}>
                Cancel
              </Button>
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="mb-10 space-y-5">
      <div>
        <h2 className="font-display text-3xl font-bold uppercase">Football Performance Academy</h2>
        <p className="text-sm text-muted">{data.data.term} · Parents enrol and choose session days on <a className="text-royal underline" href="/performance-academy#enrol" target="_blank" rel="noreferrer">the Academy page</a>. Places are held while awaiting payment; paying online confirms them automatically.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Enrolled" value={all.filter((e) => e.status !== 'cancelled' && e.status !== 'waitlist').length} />
        <StatCard label="Awaiting payment" value={count('awaiting_payment')} tone={count('awaiting_payment') ? 'attention' : 'default'} />
        <StatCard label="Confirmed" value={count('confirmed')} />
        <StatCard label="Waitlist" value={count('waitlist')} tone={count('waitlist') ? 'attention' : 'default'} />
        <StatCard label="Paid so far" value={fmtMoney(paidTotal)} />
      </div>

      <Panel title="Timetable – places taken" actions={slot ? <Button size="sm" variant="ghost" onClick={() => setSlot(null)}>Show every session</Button> : undefined}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {ACADEMY_GROUPS.map((g) => (
            <span key={g.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.colour }} aria-hidden="true" />{g.name} ({g.ages})</span>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((wd) => (
            <div key={wd}>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted">{WEEKDAYS[wd]}</p>
              <div className="space-y-1.5">
                {sessions
                  .filter((s) => s.weekday === wd)
                  .map((s) => {
                    const g = groupOf(s.group_key)!;
                    const full = s.taken >= s.capacity;
                    return (
                      <div key={s.id} className={`rounded-md border-l-4 px-2 py-1.5 text-xs ${slot === s.id ? 'ring-2 ring-charcoal' : ''} ${s.active ? '' : 'opacity-40'}`} style={{ borderLeftColor: g.colour, background: `${g.colour}1f` }}>
                        <button type="button" className="block w-full text-left" onClick={() => setSlot(slot === s.id ? null : s.id)} title="Show the athletes in this session">
                          <span className="block font-semibold">{timeText(s.start_minutes)}–{timeText(s.end_minutes)}</span>
                          <span className="block">{g.name}</span>
                          <span className={`block font-semibold ${full ? 'text-danger' : ''}`}>
                            {s.taken}/{s.capacity}{full ? ' full' : ''}{s.waitlist ? ` · ${s.waitlist} waiting` : ''}
                          </span>
                        </button>
                        {can('services:write') && (
                          <button type="button" className="mt-0.5 text-[11px] text-royal underline" onClick={() => setCapacity(s)}>
                            Change places
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <DataTable
        rows={rows}
        columns={cols}
        search={(e) => `${e.athlete_name} ${e.parent?.full_name ?? ''} ${e.parent?.email ?? ''} ${e.parent?.phone ?? ''} ${e.club ?? ''}`}
        initialSort={{ key: 'added', dir: 'desc' }}
        filters={
          <Select
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              ['current', 'Current (not cancelled)'],
              ['awaiting_payment', 'Awaiting payment'],
              ['confirmed', 'Confirmed'],
              ['waitlist', 'Waitlist'],
              ['cancelled', 'Cancelled'],
              ['all', 'All'],
            ]}
          />
        }
        empty={slot ? 'No athletes in this session yet.' : 'No enrolments yet – share the Academy page to get started.'}
      />
      {toastNode}
    </div>
  );
}
