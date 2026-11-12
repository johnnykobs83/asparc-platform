'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, label, useApi } from '../api';
import { Badge, Button, DataTable, Drawer, ErrorNote, KV, Loading, Notice, Panel, useToast } from '../ui';
import { clockLabel, melbourneLocal, money, WeekCalendar } from './WeekCalendar';

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
  practitioner_id: string;
  practitioner_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  list_price_cents: number | null;
  final_price_cents: number | null;
  charge_cents: number | null;
  price_note: string | null;
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
  const appointments = useApi<{ ready: boolean; email_ready?: boolean; appointments: AppointmentRow[] }>('/api/admin/appointments');
  const services = useApi<{ services: ServiceRow[] }>('/api/admin/services');
  const [editing, setEditing] = useState<{ id: string | null; draft: Omit<PractitionerRow, 'id'> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [show, setShow] = useState('upcoming');
  const [view, setView] = useState<'week' | 'list'>('week');
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  type EmailStatus = 'sent' | 'not_configured' | 'no_email' | 'failed' | null | undefined;
  /** Tells staff what happened with the customer's email after a change. */
  const emailNote = (st: EmailStatus) =>
    st === 'sent' ? ' The customer has been emailed.' : st === 'no_email' ? ' No email on file – please let the customer know.' : st === 'not_configured' ? ' Email is not set up yet – please let the customer know.' : st === 'failed' ? ' The email could not be sent – please let the customer know.' : '';
  const emailReady = Boolean(appointments.data?.email_ready);
  /** What the confirmation prompt says about telling the customer. */
  const willTell = (a: { customer: AppointmentRow['customer'] }) => (emailReady && a.customer?.email ? 'The customer will be emailed.' : 'The customer will not be emailed – please let them know.');

  async function setStatus(a: AppointmentRow, status: string) {
    if (status === 'cancelled' && !window.confirm(`Cancel ${a.customer?.full_name ?? 'this'} booking for ${fmtDate(a.starts_at)}? The time becomes available to other customers.\n\n${willTell(a)}`)) return;
    try {
      const r = await api<{ customer_email?: EmailStatus }>(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast(`Booking marked ${label(status).toLowerCase()}.${emailNote(r.customer_email)}`, r.customer_email === 'failed' ? 'err' : 'ok');
      await appointments.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
  }

  const dayName = (ymd: string) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T00:00:00Z`));

  async function move(a: { id: string; customer: AppointmentRow['customer'] }, date: string, minutes: number) {
    if (!window.confirm(`Move ${a.customer?.full_name ?? 'this booking'} to ${dayName(date)} at ${clockLabel(minutes)}?\n\n${willTell(a)}`)) return;
    try {
      const r = await api<{ customer_email?: EmailStatus }>(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { move: { date, minutes } } });
      toast(`Moved to ${dayName(date)}, ${clockLabel(minutes)}.${emailNote(r.customer_email)}`, r.customer_email === 'failed' ? 'err' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
    await appointments.reload();
  }

  // Editable copies of the selected booking's day/time and price.
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const selectedRow = (appointments.data?.appointments ?? []).find((a) => a.id === selectedId) ?? null;
  const selectedKey = selectedRow ? `${selectedRow.id}|${selectedRow.starts_at}|${selectedRow.final_price_cents}|${selectedRow.price_note}` : '';
  useEffect(() => {
    if (!selectedRow) return;
    const at = melbourneLocal(selectedRow.starts_at);
    setMoveDate(at.ymd);
    setMoveTime(`${String(Math.floor(at.minutes / 60)).padStart(2, '0')}:${String(at.minutes % 60).padStart(2, '0')}`);
    setPriceInput(selectedRow.charge_cents != null ? (selectedRow.charge_cents / 100).toFixed(2) : '');
    setPriceNote(selectedRow.price_note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  async function savePrice(a: AppointmentRow, finalCents: number | null) {
    try {
      const r = await api<{ customer_email?: EmailStatus }>(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { price: { final_price_cents: finalCents, note: priceNote.trim() || null } } });
      toast(`${finalCents === null ? 'Price reset to the list price' : `Price set to ${money(finalCents)}`}.${emailNote(r.customer_email)}`, r.customer_email === 'failed' ? 'err' : 'ok');
      await appointments.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
  }
  const applyPercent = (a: AppointmentRow, pct: number) => {
    if (a.list_price_cents == null) return;
    setPriceInput(((a.list_price_cents * (100 - pct)) / 10000).toFixed(2));
    if (!priceNote.trim()) setPriceNote(`${pct}% discount`);
  };

  interface NewBooking { practitioner_id: string; service_id: string; service_name: string; date: string; time: string; duration: string; full_name: string; email: string; phone: string; notes: string; price: string }
  const [adding, setAdding] = useState<NewBooking | null>(null);
  const [addError, setAddError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const activePractitioners = (practitioners.data?.practitioners ?? []).filter((x) => x.active);
  const allServices = services.data?.services ?? [];

  function startAdd(date: string, minutes: number) {
    const first = activePractitioners[0];
    if (!first) {
      toast('Add a practitioner first.', 'err');
      return;
    }
    setAddError(null);
    setAdding({ practitioner_id: first.id, service_id: '', service_name: '', date, time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, duration: '', full_name: '', email: '', phone: '', notes: '', price: '' });
  }
  const patchAdd = (v: Partial<NewBooking>) => setAdding((a) => (a ? { ...a, ...v } : a));
  /** Choosing a service fills in its usual length and price; staff can change both. */
  function chooseService(id: string) {
    const svc = allServices.find((x) => x.id === id) as (ServiceRow & { price_cents?: number | null; price_status?: string }) | undefined;
    patchAdd({ service_id: id, duration: svc?.duration_minutes ? String(svc.duration_minutes) : '', price: svc && svc.price_status !== 'on_enquiry' && svc.price_cents != null ? (svc.price_cents / 100).toFixed(2) : '' });
  }

  async function submitAdd() {
    if (!adding || addSaving) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const r = await api<{ customer_email?: EmailStatus }>('/api/admin/appointments', {
        body: {
          practitioner_id: adding.practitioner_id,
          service_id: adding.service_id || null,
          service_name: adding.service_id ? undefined : adding.service_name.trim() || undefined,
          date: adding.date,
          minutes: Number(adding.time.slice(0, 2)) * 60 + Number(adding.time.slice(3, 5)),
          duration_minutes: adding.duration ? Number(adding.duration) : undefined,
          full_name: adding.full_name,
          email: adding.email.trim() || undefined,
          phone: adding.phone.trim() || undefined,
          notes: adding.notes.trim() || undefined,
          price_cents: adding.price === '' ? undefined : Math.round(Number(adding.price) * 100),
        },
      });
      setAdding(null);
      toast(`Booking added.${emailNote(r.customer_email)}`, r.customer_email === 'failed' ? 'err' : 'ok');
      await appointments.reload();
    } catch (e) {
      const fields = (e as { fields?: Record<string, string> }).fields ?? {};
      setAddError({ message: e instanceof Error ? e.message : String(e), fields });
    } finally {
      setAddSaving(false);
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
  const selected = selectedRow;
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

      {appointments.error && <ErrorNote message={appointments.error} />}
      <div className="flex items-center gap-2" role="group" aria-label="Bookings view">
        <Button size="sm" variant={view === 'week' ? 'primary' : 'secondary'} aria-pressed={view === 'week'} onClick={() => setView('week')}>Week calendar</Button>
        <Button size="sm" variant={view === 'list' ? 'primary' : 'secondary'} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</Button>
      </div>
      {view === 'week' && <WeekCalendar appointments={appointments.data?.appointments ?? []} practitioners={list} onSelect={(a) => setSelectedId(a.id)} onMove={can('bookings:write') ? move : undefined} onAdd={can('bookings:write') ? startAdd : undefined} />}
      {view === 'list' && <DataTable
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
          { key: 'price', header: 'Price', sortValue: (a) => a.charge_cents ?? -1, render: (a) => (a.charge_cents == null ? <span className="text-muted">On enquiry</span> : <span className="whitespace-nowrap tabular-nums">{money(a.charge_cents)}{a.final_price_cents != null && a.list_price_cents != null && a.final_price_cents !== a.list_price_cents && <span className="ml-1 text-xs text-muted line-through">{money(a.list_price_cents)}</span>}</span>) },
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
      />}

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

      <Drawer open={Boolean(adding)} onClose={() => setAdding(null)} title="Add a booking">
        {adding && (
          <div className="space-y-4 text-sm">
            <p className="text-xs text-muted">{emailReady ? 'The customer is emailed a confirmation if you enter their email address.' : 'Customer emails are not set up yet, so no confirmation will be sent – let the customer know yourself.'}</p>
            <label className="block">
              <span className="font-medium">Practitioner</span>
              <select className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" value={adding.practitioner_id} onChange={(e) => patchAdd({ practitioner_id: e.target.value })}>
                {activePractitioners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="font-medium">Service</span>
              <select className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" value={adding.service_id} onChange={(e) => chooseService(e.target.value)}>
                <option value="">Other (type below)</option>
                {allServices.filter((x) => x.category !== 'academy').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            {!adding.service_id && (
              <label className="block">
                <span className="font-medium">What is the booking for?</span>
                <input className="mt-1 w-full rounded-md border border-line px-3 py-2" maxLength={160} value={adding.service_name} onChange={(e) => patchAdd({ service_name: e.target.value })} />
                {addError?.fields.service_name && <span className="mt-1 block text-xs text-danger">{addError.fields.service_name}</span>}
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <label className="block"><span className="font-medium">Day</span><input type="date" className="mt-1 block rounded-md border border-line px-2 py-2" value={adding.date} onChange={(e) => patchAdd({ date: e.target.value })} /></label>
              <label className="block"><span className="font-medium">Start</span><input type="time" step={900} className="mt-1 block rounded-md border border-line px-2 py-2" value={adding.time} onChange={(e) => patchAdd({ time: e.target.value })} /></label>
              <label className="block"><span className="font-medium">Minutes</span><input type="number" min={5} max={480} step={5} className="mt-1 block w-24 rounded-md border border-line px-2 py-2" value={adding.duration} onChange={(e) => patchAdd({ duration: e.target.value })} /></label>
            </div>
            {addError?.fields.duration_minutes && <p className="text-xs text-danger">{addError.fields.duration_minutes}</p>}
            <label className="block">
              <span className="font-medium">Customer name</span>
              <input className="mt-1 w-full rounded-md border border-line px-3 py-2" autoComplete="off" value={adding.full_name} onChange={(e) => patchAdd({ full_name: e.target.value })} />
              {addError?.fields.full_name && <span className="mt-1 block text-xs text-danger">{addError.fields.full_name}</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-medium">Email</span>
                <input type="email" className="mt-1 w-full rounded-md border border-line px-3 py-2" autoComplete="off" value={adding.email} onChange={(e) => patchAdd({ email: e.target.value })} />
                {addError?.fields.email && <span className="mt-1 block text-xs text-danger">{addError.fields.email}</span>}
              </label>
              <label className="block">
                <span className="font-medium">Mobile</span>
                <input type="tel" className="mt-1 w-full rounded-md border border-line px-3 py-2" autoComplete="off" value={adding.phone} onChange={(e) => patchAdd({ phone: e.target.value })} />
                {addError?.fields.phone && <span className="mt-1 block text-xs text-danger">{addError.fields.phone}</span>}
              </label>
            </div>
            <label className="block">
              <span className="font-medium">Price to charge ($)</span>
              <input type="number" min={0} step={0.5} inputMode="decimal" className="mt-1 block w-32 rounded-md border border-line px-3 py-2" placeholder="List price" value={adding.price} onChange={(e) => patchAdd({ price: e.target.value })} />
            </label>
            <label className="block">
              <span className="font-medium">Note (optional)</span>
              <textarea rows={2} maxLength={1000} className="mt-1 w-full rounded-md border border-line px-3 py-2" value={adding.notes} onChange={(e) => patchAdd({ notes: e.target.value })} />
            </label>
            {addError && <p className="text-danger" role="alert">{addError.message}</p>}
            <div className="flex gap-2">
              <Button disabled={addSaving || adding.full_name.trim().length < 2 || !adding.date || !adding.time} onClick={submitAdd}>{addSaving ? 'Adding…' : 'Add booking'}</Button>
              <Button variant="secondary" onClick={() => setAdding(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.customer?.full_name ?? 'Booking'}>
        {selected && (
          <div className="space-y-5">
            <KV
              items={[
                ['When', `${fmtDate(selected.starts_at)} – ${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' }).format(new Date(selected.ends_at))}`],
                ['Service', selected.service_name],
                ['With', selected.practitioner_name],
                ['Status', <Badge key="s" tone={STATUS_TONE[selected.status] ?? 'neutral'}>{label(selected.status)}</Badge>],
                ['Mobile', selected.customer?.phone ? <a key="p" className="text-royal underline" href={`tel:${selected.customer.phone.replace(/\s/g, '')}`}>{selected.customer.phone}</a> : '–'],
                ['Email', selected.customer?.email ? <a key="e" className="text-royal underline" href={`mailto:${selected.customer.email}`}>{selected.customer.email}</a> : '–'],
                ['Customer note', selected.notes ?? '–'],
                [
                  'Price',
                  selected.charge_cents == null ? (
                    'On enquiry – no price set'
                  ) : (
                    <span key="pr">
                      <strong>{money(selected.charge_cents)}</strong>
                      {selected.final_price_cents != null && selected.list_price_cents != null && selected.final_price_cents !== selected.list_price_cents && (
                        <span className="text-muted"> (list price {money(selected.list_price_cents)}{selected.price_note ? ` · ${selected.price_note}` : ''})</span>
                      )}
                    </span>
                  ),
                ],
              ]}
            />
            {can('bookings:write') && selected.status === 'confirmed' && (
              <fieldset className="rounded-lg border border-line p-4 text-sm">
                <legend className="px-1 font-medium">Move this booking</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block"><span className="text-xs text-muted">Day</span><input type="date" className="mt-1 block rounded-md border border-line px-2 py-1.5" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></label>
                  <label className="block"><span className="text-xs text-muted">Start time</span><input type="time" step={900} className="mt-1 block rounded-md border border-line px-2 py-1.5" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} /></label>
                  <Button size="sm" variant="secondary" disabled={!moveDate || !moveTime} onClick={() => move(selected, moveDate, Number(moveTime.slice(0, 2)) * 60 + Number(moveTime.slice(3, 5)))}>Move</Button>
                </div>
                <p className="mt-2 text-xs text-muted">You can also drag the booking on the week calendar. {willTell(selected)}</p>
              </fieldset>
            )}
            {can('bookings:write') && selected.status !== 'cancelled' && (
              <fieldset className="rounded-lg border border-line p-4 text-sm">
                <legend className="px-1 font-medium">Price and discount</legend>
                <p className="text-xs text-muted">List price: {money(selected.list_price_cents) ?? 'on enquiry'}</p>
                {selected.list_price_cents != null && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[10, 15, 20, 50].map((pct) => (
                      <Button key={pct} size="sm" variant="secondary" onClick={() => applyPercent(selected, pct)}>{pct}% off</Button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block"><span className="text-xs text-muted">Price to charge ($)</span><input type="number" min={0} step={0.5} inputMode="decimal" className="mt-1 block w-28 rounded-md border border-line px-2 py-1.5" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} /></label>
                  <label className="block min-w-0 flex-1"><span className="text-xs text-muted">Reason (optional)</span><input className="mt-1 block w-full rounded-md border border-line px-2 py-1.5" maxLength={300} placeholder="e.g. Club member discount" value={priceNote} onChange={(e) => setPriceNote(e.target.value)} /></label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={priceInput === '' || Number.isNaN(Number(priceInput)) || Number(priceInput) < 0} onClick={() => savePrice(selected, Math.round(Number(priceInput) * 100))}>Save price</Button>
                  {selected.final_price_cents != null && <Button size="sm" variant="secondary" onClick={() => savePrice(selected, null)}>Reset to list price</Button>}
                </div>
                <p className="mt-2 text-xs text-muted">This records what you will charge. No payment is taken through the website.</p>
              </fieldset>
            )}
            {can('bookings:write') && selected.status === 'confirmed' && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setStatus(selected, 'completed')}>Mark completed</Button>
                <Button size="sm" variant="secondary" onClick={() => setStatus(selected, 'no_show')}>Mark no-show</Button>
                <Button size="sm" variant="danger" onClick={() => setStatus(selected, 'cancelled')}>Cancel booking</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

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
