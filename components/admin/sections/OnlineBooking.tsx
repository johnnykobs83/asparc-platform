'use client';

import { useMemo, useState } from 'react';
import { api, fmtDate, label, useApi } from '../api';
import { Badge, Button, DataTable, Drawer, ErrorNote, Loading, Notice, Panel, useToast } from '../ui';

type Can = (p: string) => boolean;
type Hours = Record<string, { start: number; end: number }[]>;

interface PractitionerRow {
  id: string;
  name: string;
  title: string | null;
  service_ids: string[];
  weekly_hours: Hours;
  buffer_minutes: number;
  active: boolean;
}
interface ServiceRow {
  id: string;
  name: string;
  category: string;
  duration_minutes: number | null;
  availability: string;
  is_public: boolean;
}
interface AppointmentRow {
  id: string;
  service_name: string;
  practitioner_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  customer: { full_name: string; email: string | null; phone: string | null } | null;
}

// Monday first, as people read a working week. Keys match JavaScript's getDay().
const DAYS: [key: string, name: string][] = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const hoursSummary = (h: Hours) =>
  DAYS.filter(([k]) => h[k]?.length)
    .map(([k, n]) => `${n.slice(0, 3)} ${h[k].map((w) => `${toTime(w.start)}–${toTime(w.end)}`).join(', ')}`)
    .join(' · ') || 'No hours set';

const blank: Omit<PractitionerRow, 'id'> = { name: '', title: '', service_ids: [], weekly_hours: {}, buffer_minutes: 0, active: true };
const STATUS_TONE: Record<string, 'green' | 'neutral' | 'red' | 'amber'> = { confirmed: 'green', completed: 'neutral', cancelled: 'red', no_show: 'amber' };

/** Online self-service bookings: who can be booked and when, plus the appointments customers have made. */
export function OnlineBookingPanel({ can }: { can: Can }) {
  const practitioners = useApi<{ ready: boolean; practitioners: PractitionerRow[] }>('/api/admin/practitioners');
  const appointments = useApi<{ ready: boolean; appointments: AppointmentRow[] }>('/api/admin/appointments');
  const services = useApi<{ services: ServiceRow[] }>('/api/admin/services');
  const [editing, setEditing] = useState<{ id: string | null; draft: Omit<PractitionerRow, 'id'> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [show, setShow] = useState('upcoming');
  const { toast, toastNode } = useToast();

  const bookable = useMemo(() => (services.data?.services ?? []).filter((s) => s.duration_minutes && s.category !== 'academy'), [services.data]);
  const serviceName = useMemo(() => new Map((services.data?.services ?? []).map((s) => [s.id, s.name])), [services.data]);
  const rows = useMemo(() => {
    const all = appointments.data?.appointments ?? [];
    const now = new Date().toISOString();
    if (show === 'upcoming') return all.filter((a) => a.status === 'confirmed' && a.ends_at >= now);
    if (show === 'past') return all.filter((a) => a.ends_at < now || a.status !== 'confirmed');
    return all;
  }, [appointments.data, show]);

  async function setStatus(a: AppointmentRow, status: string) {
    if (status === 'cancelled' && !window.confirm(`Cancel ${a.customer?.full_name ?? 'this'} booking for ${fmtDate(a.starts_at)}? The time becomes available to other customers. You will need to let the customer know.`)) return;
    try {
      await api(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast(`Booking marked ${label(status).toLowerCase()}`);
      await appointments.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing.draft, title: editing.draft.title || null };
      if (editing.id) await api(`/api/admin/practitioners/${editing.id}`, { method: 'PATCH', body });
      else await api('/api/admin/practitioners', { body });
      setEditing(null);
      toast('Practitioner saved');
      await practitioners.reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const patch = (p: Partial<Omit<PractitionerRow, 'id'>>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e));
  const setDay = (key: string, on: boolean, start = 360, end = 1200) => {
    if (!editing) return;
    const next = { ...editing.draft.weekly_hours };
    if (on) next[key] = [{ start, end }];
    else delete next[key];
    patch({ weekly_hours: next });
  };

  if (practitioners.loading && !practitioners.data) return <Loading />;
  if (practitioners.data && !practitioners.data.ready) {
    return (
      <Notice tone="warn">
        <strong>Online booking needs one database step.</strong> The booking tables have not been created yet. Run the file <code>supabase/migrations/20261111000003_bookings.sql</code> in the Supabase SQL Editor, then reload this page. Until then customers see the booking-request form.
      </Notice>
    );
  }

  const list = practitioners.data?.practitioners ?? [];
  const live = list.some((p) => p.active && Object.keys(p.weekly_hours ?? {}).length && p.service_ids.some((id) => bookable.some((s) => s.id === id && s.availability === 'available' && s.is_public)));

  return (
    <div className="mb-8 space-y-4">
      {toastNode}
      <Notice tone={live ? 'info' : 'warn'}>
        {live ? (
          <><strong>Online booking is live.</strong> Customers choose a service and a time at <a className="underline" href="/book" target="_blank" rel="noreferrer">/book</a> and the appointment is confirmed immediately – no action is needed from you.</>
        ) : (
          <><strong>Online booking is not live yet.</strong> Add at least one active practitioner with working hours and a service. A service can be booked online once it has a duration (set in Pricing &amp; Services) and is marked available.</>
        )}
      </Notice>

      {practitioners.error && <ErrorNote message={practitioners.error} />}
      <Panel title="Practitioners" actions={can('services:write') ? <Button size="sm" onClick={() => { setFormError(null); setEditing({ id: null, draft: { ...blank } }); }}>Add practitioner</Button> : undefined}>
        {list.length === 0 ? (
          <p className="text-sm text-muted">No practitioners yet. Add the people customers can book with, the services they deliver and the hours they work.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{p.name} {p.title && <span className="font-normal text-muted">· {p.title}</span>} {!p.active && <Badge tone="neutral">Inactive</Badge>}</p>
                  <p className="mt-0.5 text-xs text-muted">{hoursSummary(p.weekly_hours ?? {})}</p>
                  <p className="mt-0.5 text-xs text-muted">{p.service_ids.length ? p.service_ids.map((id) => serviceName.get(id) ?? 'Removed service').join(', ') : 'No services assigned'}</p>
                </div>
                {can('services:write') && <Button size="sm" variant="secondary" onClick={() => { setFormError(null); setEditing({ id: p.id, draft: { name: p.name, title: p.title ?? '', service_ids: p.service_ids ?? [], weekly_hours: p.weekly_hours ?? {}, buffer_minutes: p.buffer_minutes, active: p.active } }); }}>Edit</Button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {appointments.error && <ErrorNote message={appointments.error} />}
      <DataTable
        rows={rows}
        initialSort={{ key: 'when', dir: show === 'upcoming' ? 'asc' : 'desc' }}
        search={(a) => `${a.customer?.full_name ?? ''} ${a.customer?.email ?? ''} ${a.customer?.phone ?? ''} ${a.service_name} ${a.practitioner_name}`}
        empty="No online bookings to show."
        filters={
          <select aria-label="Show" className="rounded-md border border-line bg-white px-3 py-2 text-sm" value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past and cancelled</option>
            <option value="all">All</option>
          </select>
        }
        columns={[
          { key: 'when', header: 'When', sortValue: (a) => a.starts_at, render: (a) => <span className="whitespace-nowrap font-medium">{fmtDate(a.starts_at)}</span> },
          { key: 'service', header: 'Service', render: (a) => a.service_name },
          { key: 'with', header: 'With', render: (a) => a.practitioner_name },
          { key: 'customer', header: 'Customer', render: (a) => (a.customer ? <span><span className="font-medium">{a.customer.full_name}</span><span className="block text-xs text-muted">{[a.customer.phone, a.customer.email].filter(Boolean).join(' · ')}</span>{a.notes && <span className="block max-w-xs text-xs text-muted">Note: {a.notes}</span>}</span> : '–') },
          { key: 'status', header: 'Status', render: (a) => <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>{label(a.status)}</Badge> },
          {
            key: 'actions',
            header: '',
            render: (a) =>
              can('bookings:write') && a.status === 'confirmed' ? (
                <span className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setStatus(a, 'completed')}>Completed</Button>
                  <Button size="sm" variant="secondary" onClick={() => setStatus(a, 'no_show')}>No-show</Button>
                  <Button size="sm" variant="danger" onClick={() => setStatus(a, 'cancelled')}>Cancel</Button>
                </span>
              ) : null,
          },
        ]}
      />

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit practitioner' : 'Add practitioner'}>
        {editing && (
          <div className="space-y-5 text-sm">
            <label className="block">
              <span className="font-medium">Name</span>
              <input className="mt-1 w-full rounded-md border border-line px-3 py-2" value={editing.draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            <label className="block">
              <span className="font-medium">Title shown to customers (optional)</span>
              <input className="mt-1 w-full rounded-md border border-line px-3 py-2" placeholder="e.g. Remedial massage therapist" value={editing.draft.title ?? ''} onChange={(e) => patch({ title: e.target.value })} />
            </label>

            <fieldset>
              <legend className="font-medium">Working hours (Melbourne time)</legend>
              <p className="mt-0.5 text-xs text-muted">Customers can only book inside these hours.</p>
              <div className="mt-2 space-y-2">
                {DAYS.map(([key, name]) => {
                  const w = editing.draft.weekly_hours[key]?.[0];
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-2">
                      <label className="flex w-32 items-center gap-2">
                        <input type="checkbox" className="accent-royal" checked={Boolean(w)} onChange={(e) => setDay(key, e.target.checked)} /> {name}
                      </label>
                      {w && (
                        <>
                          <input type="time" aria-label={`${name} start`} step={1800} className="rounded-md border border-line px-2 py-1" value={toTime(w.start)} onChange={(e) => e.target.value && setDay(key, true, toMinutes(e.target.value), w.end)} />
                          <span>to</span>
                          <input type="time" aria-label={`${name} finish`} step={1800} className="rounded-md border border-line px-2 py-1" value={toTime(w.end)} onChange={(e) => e.target.value && setDay(key, true, w.start, toMinutes(e.target.value))} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-medium">Services this person can be booked for</legend>
              <p className="mt-0.5 text-xs text-muted">Only services with a duration are listed. Set durations in Pricing &amp; Services.</p>
              <div className="mt-2 space-y-1.5">
                {bookable.length === 0 && <p className="text-xs text-muted">No services have a duration yet.</p>}
                {bookable.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-royal"
                      checked={editing.draft.service_ids.includes(s.id)}
                      onChange={(e) => patch({ service_ids: e.target.checked ? [...editing.draft.service_ids, s.id] : editing.draft.service_ids.filter((id) => id !== s.id) })}
                    />
                    {s.name} <span className="text-xs text-muted">({s.duration_minutes} min)</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="font-medium">Gap kept free after each appointment (minutes)</span>
              <input type="number" min={0} max={120} step={5} className="mt-1 w-28 rounded-md border border-line px-3 py-2" value={editing.draft.buffer_minutes} onChange={(e) => patch({ buffer_minutes: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-royal" checked={editing.draft.active} onChange={(e) => patch({ active: e.target.checked })} /> Available for online booking
            </label>

            {formError && <p className="text-danger" role="alert">{formError}</p>}
            <div className="flex gap-2">
              <Button disabled={saving || editing.draft.name.trim().length < 2} onClick={save}>{saving ? 'Saving…' : 'Save practitioner'}</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
