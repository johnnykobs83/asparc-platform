'use client';

import { useEffect, useMemo, useState } from 'react';
import { FLAG_LABEL, FLAG_TONE, HEARD_ABOUT, SCREENING_QUESTIONS, type FormFlag } from '@/lib/clients/screening';
import { api, ApiError, fmtDate, fmtMoney, getParam, label, setParam, useApi } from '../api';
import { Badge, Button, DataTable, Drawer, Empty, ErrorNote, KV, Loading, Notice, PageHeader, Panel, Select, StatCard, useToast, type Column } from '../ui';

/**
 * The client database. Everyone on the dashboard sees contact details and history.
 * Health forms and notes come back from the API only for owners, managers and the
 * practitioner who sees that client – everyone else just sees the form's status.
 */

interface Row {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  sport: string | null;
  club: string | null;
  is_guardian: boolean;
  consent_marketing: boolean;
  created_at: string;
  bookings: number;
  visits: number;
  last_visit: string | null;
  next_visit: string | null;
  enquiries: number;
  form: FormFlag;
}

interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  is_guardian: boolean;
  consent_contact: boolean;
  consent_marketing: boolean;
  consent_marketing_at: string | null;
  source: string;
  date_of_birth?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  sport?: string | null;
  club?: string | null;
  created_at: string;
}

interface Form {
  id: string;
  status: 'sent' | 'submitted' | 'cancelled';
  sent_at: string;
  submitted_at: string | null;
  review_status: 'not_needed' | 'needs_review' | 'cleared' | 'not_cleared';
  valid_until: string | null;
  expires_at: string;
  // Only present for people allowed to see health information:
  reason?: string;
  sent_by?: string | null;
  for_whom?: 'self' | 'child' | null;
  athlete_name?: string | null;
  athlete_dob?: string | null;
  details?: Record<string, string | null>;
  screening?: Record<string, boolean | string | null>;
  health?: Record<string, string | null>;
  screening_flags?: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  consent_marketing?: boolean;
  signature_name?: string | null;
}

interface Detail {
  customer: Customer;
  form: FormFlag;
  health_access: boolean;
  totals: { bookings: number; booked_value_cents: number; paid_online_cents: number };
  appointments: { id: string; starts_at: string; ends_at: string; service_name: string; practitioner_name: string; status: string; charge_cents: number | null }[];
  enquiries: { id: string; created_at: string; lead_type: string; stage: string; service_interest: string | null; enquiry_details: string | null }[];
  booking_requests: { id: string; created_at: string; service_name: string; status: string }[];
  academy: { id: string; created_at: string; athlete: string; age_group: string; status: string; payment_status: string }[];
  payments: { id: string; paid_at: string | null; description: string | null; amount_cents: number; refunded_cents: number; status: string }[];
  forms: Form[];
  notes: { id: string; body: string; author_name: string | null; created_at: string }[];
}

const FlagBadge = ({ flag }: { flag: FormFlag }) => <Badge tone={FLAG_TONE[flag]}>{FLAG_LABEL[flag]}</Badge>;
const day = (ymd: string | null | undefined) => (ymd ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`)) : '–');
const age = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
};

export function ClientsSection({ can }: { can: (p: string) => boolean }) {
  const data = useApi<{ clients: Row[] }>('/api/admin/clients');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState('all');
  const { toast, toastNode } = useToast();

  useEffect(() => setOpenId(getParam('id')), []);
  const open = (id: string | null) => {
    setOpenId(id);
    setParam('id', id);
  };

  const rows = useMemo(() => {
    const all = data.data?.clients ?? [];
    switch (show) {
      case 'review': return all.filter((r) => r.form === 'needs_review' || r.form === 'not_cleared');
      case 'no_form': return all.filter((r) => r.next_visit && ['missing', 'sent', 'expired'].includes(r.form));
      case 'upcoming': return all.filter((r) => r.next_visit);
      case 'marketing': return all.filter((r) => r.consent_marketing);
      default: return all;
    }
  }, [data.data, show]);

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  const all = data.data!.clients;
  const review = all.filter((r) => r.form === 'needs_review').length;
  const noForm = all.filter((r) => r.next_visit && ['missing', 'sent', 'expired'].includes(r.form)).length;

  const cols: Column<Row>[] = [
    {
      key: 'name',
      header: 'Client',
      render: (r) => (
        <span>
          <span className="font-medium">{r.full_name}</span>
          {r.is_guardian && <span className="ml-1.5 text-xs text-muted">(parent)</span>}
          <span className="block text-xs text-muted">{[r.email, r.phone].filter(Boolean).join(' · ')}</span>
        </span>
      ),
      sortValue: (r) => r.full_name.toLowerCase(),
    },
    { key: 'sport', header: 'Sport / club', render: (r) => [r.sport, r.club].filter(Boolean).join(' · ') || <span className="text-muted">–</span>, sortValue: (r) => (r.club ?? r.sport ?? '').toLowerCase() },
    { key: 'visits', header: 'Visits', className: 'text-right', render: (r) => r.visits, sortValue: (r) => r.visits },
    { key: 'last', header: 'Last visit', render: (r) => (r.last_visit ? fmtDate(r.last_visit, false) : <span className="text-muted">–</span>), sortValue: (r) => r.last_visit ?? '' },
    { key: 'next', header: 'Next visit', render: (r) => (r.next_visit ? fmtDate(r.next_visit) : <span className="text-muted">–</span>), sortValue: (r) => r.next_visit ?? '9999' },
    { key: 'form', header: 'Pre-visit form', render: (r) => <FlagBadge flag={r.form} />, sortValue: (r) => ['needs_review', 'not_cleared', 'missing', 'expired', 'sent', 'complete', 'cleared'].indexOf(r.form) },
    { key: 'added', header: 'Added', render: (r) => fmtDate(r.created_at, false), sortValue: (r) => r.created_at },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone who has booked, enquired or registered. Open a client to see their details, every booking, their pre-visit health form and notes."
        actions={can('clients:write') ? <Button onClick={() => setAdding(true)}>+ Add client</Button> : undefined}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clients" value={all.length} />
        <StatCard label="With an upcoming visit" value={all.filter((r) => r.next_visit).length} />
        <StatCard label="Forms needing review" value={review} tone={review ? 'attention' : 'default'} hint="A “yes” in the health screening – GP clearance may be needed" />
        <StatCard label="Coming in without a form" value={noForm} tone={noForm ? 'attention' : 'default'} hint="Upcoming visit, form not filled in yet" />
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        search={(r) => `${r.full_name} ${r.email ?? ''} ${r.phone ?? ''} ${(r.phone ?? '').replace(/\D/g, '')} ${r.sport ?? ''} ${r.club ?? ''}`}
        onRowClick={(r) => open(r.id)}
        initialSort={{ key: 'added', dir: 'desc' }}
        filters={
          <Select
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              ['all', 'All clients'],
              ['upcoming', 'Upcoming visit'],
              ['review', 'Form needs review'],
              ['no_form', 'Coming in without a form'],
              ['marketing', 'Opted in to marketing'],
            ]}
          />
        }
        empty={<Empty title="No clients yet">Clients appear here as soon as someone books, enquires or registers – or add one yourself.</Empty>}
      />
      {openId && <ClientDrawer id={openId} can={can} onClose={() => open(null)} onChanged={data.reload} toast={toast} />}
      {adding && (
        <ClientEditor
          onClose={() => setAdding(false)}
          onSaved={async (id) => {
            setAdding(false);
            toast('Client added');
            await data.reload();
            open(id);
          }}
        />
      )}
      {toastNode}
    </>
  );
}

// ------------------------------------------------------------------ one client
function ClientDrawer({ id, can, onClose, onChanged, toast }: { id: string; can: (p: string) => boolean; onClose: () => void; onChanged: () => void; toast: (t: string, tone?: 'ok' | 'err') => void }) {
  const d = useApi<Detail>(`/api/admin/clients/${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const reload = async () => {
    await d.reload();
    onChanged();
  };

  async function sendForm(email: boolean) {
    setBusy(true);
    try {
      const r = await api<{ link: string; email: string }>(`/api/admin/clients/${id}/pre-visit-form`, { body: { email } });
      setLink(r.link);
      if (email) toast(r.email === 'sent' ? 'Form emailed to the client' : r.email === 'not_configured' ? 'Email isn’t set up – copy the link instead' : 'The email didn’t send – copy the link instead', r.email === 'sent' ? 'ok' : 'err');
      else {
        await navigator.clipboard?.writeText(r.link).catch(() => undefined);
        toast('New form link copied');
      }
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const c = d.data?.customer;
  return (
    <Drawer open onClose={onClose} wide title={c ? <span className="flex flex-wrap items-center gap-2">{c.full_name} <FlagBadge flag={d.data!.form} /></span> : 'Client'}>
      {d.loading && !d.data && <Loading />}
      {d.error && <ErrorNote message={d.error} />}
      {d.data && c && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Bookings" value={d.data.totals.bookings} />
            <StatCard label="Booked value" value={fmtMoney(d.data.totals.booked_value_cents)} hint="Sessions held, at the price charged" />
            <StatCard label="Paid online" value={fmtMoney(d.data.totals.paid_online_cents)} />
          </div>

          <Panel title="Details" actions={can('clients:write') ? <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button> : undefined}>
            <KV
              items={[
                ['Mobile', c.phone ? <a className="text-royal underline" href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a> : '–'],
                ['Email', c.email ? <a className="text-royal underline" href={`mailto:${c.email}`}>{c.email}</a> : '–'],
                ['Date of birth', c.date_of_birth ? `${day(c.date_of_birth)} (age ${age(c.date_of_birth)})` : '–'],
                ['Address', c.address ?? '–'],
                ['Emergency contact', c.emergency_contact_name ? `${c.emergency_contact_name}${c.emergency_contact_phone ? ` · ${c.emergency_contact_phone}` : ''}` : '–'],
                ['Sport / club', [c.sport, c.club].filter(Boolean).join(' · ') || '–'],
                ['Parent or guardian', c.is_guardian ? 'Yes – books for a child' : 'No'],
                ['Marketing', c.consent_marketing ? `Opted in${c.consent_marketing_at ? ` ${fmtDate(c.consent_marketing_at, false)}` : ''}` : 'Not opted in'],
                ['Client since', fmtDate(c.created_at, false)],
              ]}
            />
          </Panel>

          <PreVisitPanel detail={d.data} busy={busy} canSend={can('clients:write')} link={link} onSend={sendForm} onReviewed={reload} toast={toast} />

          <Panel title="Bookings" pad={false}>
            {d.data.appointments.length ? (
              <ul className="divide-y divide-line text-sm">
                {d.data.appointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span>
                      <span className="font-medium">{fmtDate(a.starts_at)}</span> · {a.service_name}
                      <span className="block text-xs text-muted">with {a.practitioner_name}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {a.charge_cents != null && <span className="text-muted">{fmtMoney(a.charge_cents)}</span>}
                      <Badge tone={a.status === 'cancelled' || a.status === 'no_show' ? 'neutral' : Date.parse(a.starts_at) > Date.now() ? 'blue' : 'green'}>
                        {a.status === 'confirmed' && Date.parse(a.starts_at) <= Date.now() ? 'Held' : label(a.status)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted">No bookings yet.</p>
            )}
          </Panel>

          {d.data.enquiries.length + d.data.booking_requests.length > 0 && (
            <Panel title="Enquiries" pad={false}>
              <ul className="divide-y divide-line text-sm">
                {d.data.enquiries.map((l) => (
                  <li key={l.id} className="px-4 py-2.5">
                    <span className="font-medium">{fmtDate(l.created_at, false)}</span> · {label(l.lead_type)}
                    {l.service_interest && <> · {l.service_interest}</>} <Badge>{label(l.stage)}</Badge>
                    {l.enquiry_details && <span className="mt-0.5 block whitespace-pre-line text-xs text-muted">{l.enquiry_details}</span>}
                  </li>
                ))}
                {d.data.booking_requests.map((b) => (
                  <li key={b.id} className="px-4 py-2.5">
                    <span className="font-medium">{fmtDate(b.created_at, false)}</span> · Booking request: {b.service_name} <Badge>{label(b.status)}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {d.data.academy.length > 0 && (
            <Panel title="Performance Academy" pad={false}>
              <ul className="divide-y divide-line text-sm">
                {d.data.academy.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <span className="font-medium">{r.athlete}</span> · {r.age_group} · {fmtDate(r.created_at, false)} <Badge>{label(r.status)}</Badge> <Badge>{label(r.payment_status)}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {d.data.payments.length > 0 && (
            <Panel title="Online payments" pad={false}>
              <ul className="divide-y divide-line text-sm">
                {d.data.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 px-4 py-2.5">
                    <span>{p.paid_at ? fmtDate(p.paid_at, false) : '–'} · {p.description ?? 'Payment'}</span>
                    <span>
                      {fmtMoney(p.amount_cents)}
                      {p.refunded_cents > 0 && <span className="text-xs text-muted"> ({fmtMoney(p.refunded_cents)} refunded)</span>} <Badge tone={p.status === 'succeeded' ? 'green' : 'neutral'}>{label(p.status)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <NotesPanel detail={d.data} id={id} onAdded={d.reload} toast={toast} />
        </div>
      )}
      {editing && c && (
        <ClientEditor
          client={c}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            toast('Client saved');
            await reload();
          }}
        />
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------ pre-visit form
function PreVisitPanel({ detail, busy, canSend, link, onSend, onReviewed, toast }: { detail: Detail; busy: boolean; canSend: boolean; link: string | null; onSend: (email: boolean) => void; onReviewed: () => Promise<void>; toast: (t: string, tone?: 'ok' | 'err') => void }) {
  const forms = detail.forms.filter((f) => f.status !== 'cancelled');
  const latest = forms.filter((f) => f.status === 'submitted').sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))[0];
  const pending = forms.find((f) => f.status === 'sent' && Date.parse(f.expires_at) > Date.now());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function review(decision: 'cleared' | 'not_cleared' | 'needs_review') {
    if (!latest) return;
    setSaving(true);
    try {
      await api(`/api/admin/intake/${latest.id}`, { method: 'PATCH', body: { decision, note: note.trim() || undefined } });
      setNote('');
      toast(decision === 'cleared' ? 'Marked as cleared' : decision === 'not_cleared' ? 'Marked as not cleared' : 'Back to needs review');
      await onReviewed();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Pre-visit health form"
      actions={
        canSend ? (
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSend(false)}>Copy new link</Button>
            <Button size="sm" disabled={busy || !detail.customer.email} title={detail.customer.email ? undefined : 'No email address on file'} onClick={() => onSend(true)}>{forms.length ? 'Send again' : 'Send form'}</Button>
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <FlagBadge flag={detail.form} />
          {latest && <span className="text-muted">Filled in {fmtDate(latest.submitted_at!, false)} · valid until {day(latest.valid_until)}</span>}
          {pending && <span className="text-muted">A form was sent {fmtDate(pending.sent_at, false)} and is waiting to be filled in.</span>}
        </p>
        {link && (
          <p className="break-all rounded-md border border-line bg-mist px-3 py-2 text-xs">
            {link}
            <span className="mt-1 block text-muted">This link works for 30 days. Any older link has stopped working.</span>
          </p>
        )}
        {!forms.length && <p className="text-muted">The form is emailed automatically with a client&apos;s first booking and again when theirs is more than a year old.</p>}

        {latest && !detail.health_access && (
          <Notice>Health answers are only visible to managers and the practitioner seeing this client. The status above is all you need: “GP clearance needed” means a manager or the practitioner must review it before the session.</Notice>
        )}

        {latest && detail.health_access && latest.screening && (
          <div className="space-y-4">
            {latest.for_whom === 'child' && (
              <Notice>
                For <strong>{latest.athlete_name}</strong>
                {latest.athlete_dob && <> (born {day(latest.athlete_dob)}, age {age(latest.athlete_dob)})</>} – filled in by a parent or guardian.
              </Notice>
            )}
            <div>
              <h4 className="mb-1.5 font-semibold">Health screening</h4>
              <ul className="divide-y divide-line rounded-md border border-line bg-white">
                {SCREENING_QUESTIONS.map((q) => {
                  const yes = latest.screening![q.key] === true;
                  return (
                    <li key={q.key} className={`flex items-start justify-between gap-3 px-3 py-2 ${yes ? 'bg-[#fff4e0]' : ''}`}>
                      <span className={yes ? 'font-medium' : 'text-charcoal/80'}>{q.text}</span>
                      <Badge tone={yes ? 'amber' : 'neutral'}>{yes ? 'Yes' : 'No'}</Badge>
                    </li>
                  );
                })}
              </ul>
              {typeof latest.screening.details === 'string' && latest.screening.details && <p className="mt-2 whitespace-pre-line"><span className="text-muted">About the “yes” answers: </span>{latest.screening.details}</p>}
            </div>
            <KV
              items={[
                ['Injuries / pain', latest.health?.injuries ?? 'None given'],
                ['Medications', latest.health?.medications ?? 'None given'],
                ['Allergies', latest.health?.allergies ?? 'None given'],
                ['Other health info', latest.health?.other ?? '–'],
                ['Goals', latest.details?.goals ?? '–'],
                ['Heard about us', HEARD_ABOUT.find(([k]) => k === latest.details?.heard_about)?.[1] ?? '–'],
                ['Signed', `${latest.signature_name} · ${fmtDate(latest.submitted_at!, false)}`],
              ]}
            />
            {(latest.screening_flags ?? 0) > 0 && (
              <div className="rounded-md border border-line bg-white p-3">
                <h4 className="font-semibold">Review</h4>
                {latest.reviewed_at ? (
                  <p className="mt-1 text-muted">
                    {latest.review_status === 'cleared' ? 'Cleared' : latest.review_status === 'not_cleared' ? 'Not cleared' : 'Reopened'} by {latest.reviewed_by} on {fmtDate(latest.reviewed_at, false)}
                    {latest.review_note && <span className="block whitespace-pre-line text-charcoal">“{latest.review_note}”</span>}
                  </p>
                ) : (
                  <p className="mt-1 text-muted">Check the “yes” answers with the client. If needed, ask for clearance from their GP before the session.</p>
                )}
                <textarea className="mt-2 w-full rounded-md border border-line px-3 py-2" rows={2} maxLength={2000} placeholder="Note (e.g. GP letter received 3 Dec, cleared for full training)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={saving} onClick={() => review('cleared')}>Cleared to go ahead</Button>
                  <Button size="sm" variant="danger" disabled={saving} onClick={() => review('not_cleared')}>Not cleared</Button>
                  {latest.review_status !== 'needs_review' && <Button size="sm" variant="ghost" disabled={saving} onClick={() => review('needs_review')}>Reopen</Button>}
                </div>
              </div>
            )}
          </div>
        )}

        {detail.health_access && forms.filter((f) => f.status === 'submitted' && f.id !== latest?.id).length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Earlier forms</summary>
            <ul className="mt-1 space-y-0.5">
              {forms
                .filter((f) => f.status === 'submitted' && f.id !== latest?.id)
                .map((f) => (
                  <li key={f.id}>Filled in {fmtDate(f.submitted_at!, false)} · {f.screening_flags ? `${f.screening_flags} “yes” answer(s)` : 'no flags'} · {label(f.review_status)}</li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ notes
function NotesPanel({ detail, id, onAdded, toast }: { detail: Detail; id: string; onAdded: () => Promise<void>; toast: (t: string, tone?: 'ok' | 'err') => void }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  if (!detail.health_access) return null;
  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api(`/api/admin/clients/${id}/notes`, { body: { body } });
      setBody('');
      await onAdded();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel title="Notes">
      <p className="mb-2 text-xs text-muted">Only managers and the practitioner seeing this client can read these. Notes can&apos;t be edited once saved.</p>
      <textarea className="w-full rounded-md border border-line px-3 py-2 text-sm" rows={3} maxLength={4000} placeholder="Session notes, what was agreed, follow-ups…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={saving || !body.trim()} onClick={add}>Add note</Button>
      </div>
      {detail.notes.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {detail.notes.map((n) => (
            <li key={n.id} className="rounded-md border border-line bg-white px-3 py-2">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{n.author_name ?? 'Staff'} · {fmtDate(n.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ add / edit
type Draft = {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  sport: string;
  club: string;
  is_guardian: boolean;
  consent_marketing: boolean;
};

function ClientEditor({ client, onClose, onSaved }: { client?: Customer; onClose: () => void; onSaved: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>({
    full_name: client?.full_name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    date_of_birth: client?.date_of_birth ?? '',
    address: client?.address ?? '',
    emergency_contact_name: client?.emergency_contact_name ?? '',
    emergency_contact_phone: client?.emergency_contact_phone ?? '',
    sport: client?.sport ?? '',
    club: client?.club ?? '',
    is_guardian: client?.is_guardian ?? false,
    consent_marketing: client?.consent_marketing ?? false,
  });
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  async function save() {
    setSaving(true);
    setErr(null);
    const body = { ...draft, email: draft.email || null, phone: draft.phone || null, date_of_birth: draft.date_of_birth || null };
    try {
      if (client) {
        await api(`/api/admin/clients/${client.id}`, { method: 'PATCH', body });
        onSaved(client.id);
      } else {
        const r = await api<{ client: { id: string } }>('/api/admin/clients', { body });
        onSaved(r.client.id);
      }
    } catch (e) {
      setErr({ message: e instanceof Error ? e.message : String(e), fields: e instanceof ApiError ? e.fields ?? {} : {} });
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof Draft, text: string, type = 'text', hint?: string) => (
    <label className="block">
      <span className="font-medium">{text}</span>
      {hint && <span className="ml-1 text-xs text-muted">{hint}</span>}
      <input type={type} className="mt-1 w-full rounded-md border border-line px-3 py-2" value={draft[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)} />
      {err?.fields[key] && <span className="mt-1 block text-xs text-danger">{err.fields[key]}</span>}
    </label>
  );

  return (
    <Drawer open onClose={onClose} title={client ? 'Edit client' : 'Add client'}>
      <div className="space-y-4 text-sm">
        {err && <ErrorNote message={err.message} />}
        {field('full_name', 'Full name')}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('email', 'Email', 'email')}
          {field('phone', 'Mobile', 'tel')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('date_of_birth', 'Date of birth', 'date')}
          {field('address', 'Suburb or address')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('emergency_contact_name', 'Emergency contact')}
          {field('emergency_contact_phone', 'Emergency contact phone', 'tel')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('sport', 'Sport')}
          {field('club', 'Club or school')}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-royal" checked={draft.is_guardian} onChange={(e) => set({ is_guardian: e.target.checked })} /> Parent or guardian booking for a child
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-royal" checked={draft.consent_marketing} onChange={(e) => set({ consent_marketing: e.target.checked })} />
          <span>Opted in to marketing <span className="block text-xs text-muted">Only tick this if the client has asked to receive news and offers.</span></span>
        </label>
        <p className="text-xs text-muted">Health details are never entered here – they come from the client&apos;s own pre-visit form.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Drawer>
  );
}
