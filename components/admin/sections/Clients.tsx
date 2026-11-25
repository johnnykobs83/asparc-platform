'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError, fmtMoney, useApi } from '../api';
import { Badge, Button, DataTable, Drawer, ErrorNote, KV, Loading, Notice, PageHeader, Panel, StatCard, useToast, type Column } from '../ui';

/**
 * Clients & billing – OWNER ONLY. The API answers 404 to anyone else and the
 * database (RLS) gives them no rows, so this page is just the owner's view.
 */

type Model = 'monthly_retainer' | 'per_session' | 'per_athlete' | 'term_fee' | 'fixed_project';
const MODELS: [Model, string, string][] = [
  ['monthly_retainer', 'Monthly retainer', 'per month'],
  ['per_session', 'Per session', 'per session'],
  ['per_athlete', 'Per athlete', 'per athlete'],
  ['term_fee', 'Term fee', 'per term'],
  ['fixed_project', 'Fixed project', 'total'],
];
const modelLabel = (m: string) => MODELS.find(([k]) => k === m)?.[1] ?? m;
const unitLabel = (m: string) => MODELS.find(([k]) => k === m)?.[2] ?? '';

interface Client {
  id: string;
  name: string;
  kind: string;
  abn: string | null;
  contact_name: string | null;
  billing_email: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  status: 'prospect' | 'active' | 'paused' | 'ended';
  notes: string | null;
}
interface Agreement {
  id: string;
  client_id: string;
  title: string;
  billing_model: Model;
  rate_cents: number;
  agreed_value_cents: number | null;
  start_date: string;
  end_date: string | null;
  payment_terms_days: number;
  inclusions: string | null;
  status: 'proposed' | 'active' | 'ended';
}
interface Invoice {
  id: string;
  agreement_id: string | null;
  number: string;
  issued_on: string;
  due_on: string;
  amount_cents: number;
  gst_cents: number;
  amount_paid_cents: number;
  paid_on: string | null;
  method: string | null;
  status: string;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  state: 'paid' | 'part_paid' | 'due' | 'overdue' | 'void';
  owing_cents: number;
}
interface Summary {
  client: Client;
  agreements: Agreement[];
  agreed_cents: number;
  invoiced_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  overdue_cents: number;
  oldest_overdue_days: number;
  next_due_on: string | null;
  status: 'paid_up' | 'due' | 'overdue' | 'no_invoices';
}
interface Overview {
  ready: boolean;
  today: string;
  totals: { agreed_cents: number; invoiced_cents: number; paid_cents: number; outstanding_cents: number; overdue_cents: number };
  aged: { current: number; d1_30: number; d31_60: number; d61_plus: number };
  clients: Summary[];
}
interface Detail extends Summary {
  invoices: Invoice[];
  sessions: { by_month: { month: string; count: number }[]; upcoming: number };
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const d = (ymd: string | null) => (ymd ? dateFmt.format(new Date(`${ymd}T00:00:00Z`)) : '–');
const monthFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const money = (c: number | null | undefined) => fmtMoney(c ?? 0);
const toCents = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? Math.round(n * 100) : null;
};
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof ApiError && e.fields ? Object.values(e.fields).join(' · ') : e instanceof Error ? e.message : 'Something went wrong');

const STATUS: Record<Summary['status'], [string, 'green' | 'amber' | 'red' | 'neutral']> = {
  paid_up: ['Paid up', 'green'],
  due: ['Invoice due', 'amber'],
  overdue: ['Overdue', 'red'],
  no_invoices: ['No invoices', 'neutral'],
};
const STATE: Record<Invoice['state'], [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  paid: ['Paid', 'green'],
  part_paid: ['Part paid', 'blue'],
  due: ['Due', 'amber'],
  overdue: ['Overdue', 'red'],
  void: ['Void', 'neutral'],
};

export function ClientsSection() {
  const data = useApi<Overview>('/api/admin/finance/clients');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { toast, toastNode } = useToast();

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  const o = data.data!;
  if (!o.ready) return <Notice tone="warn">The billing tables aren&apos;t in the database yet. Apply <code>supabase/migrations/20261125000007_staff_planner_billing.sql</code> in Supabase, then reload.</Notice>;

  const cols: Column<Summary & { id: string }>[] = [
    { key: 'name', header: 'Client', render: (r) => <span className="font-medium">{r.client.name}{r.client.status !== 'active' && <span className="ml-1.5 text-xs text-muted">({r.client.status})</span>}</span>, sortValue: (r) => r.client.name.toLowerCase() },
    {
      key: 'deal',
      header: 'Arrangement',
      render: (r) => {
        const a = r.agreements.find((x) => x.status === 'active') ?? r.agreements[0];
        return a ? <span>{modelLabel(a.billing_model)}<span className="block text-xs text-muted">{money(a.rate_cents)} {unitLabel(a.billing_model)}</span></span> : <span className="text-muted">No agreement</span>;
      },
    },
    { key: 'agreed', header: 'Agreed', className: 'text-right', render: (r) => money(r.agreed_cents), sortValue: (r) => r.agreed_cents },
    { key: 'inv', header: 'Invoiced', className: 'text-right', render: (r) => money(r.invoiced_cents), sortValue: (r) => r.invoiced_cents },
    { key: 'paid', header: 'Paid', className: 'text-right', render: (r) => money(r.paid_cents), sortValue: (r) => r.paid_cents },
    { key: 'owing', header: 'Owing', className: 'text-right', render: (r) => <span className={r.overdue_cents ? 'font-semibold text-danger' : ''}>{money(r.outstanding_cents)}</span>, sortValue: (r) => r.outstanding_cents },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span>
          <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
          {r.status === 'overdue' && <span className="block text-xs text-danger">{r.oldest_overdue_days} days late</span>}
          {r.status === 'due' && r.next_due_on && <span className="block text-xs text-muted">due {d(r.next_due_on)}</span>}
        </span>
      ),
      sortValue: (r) => ['overdue', 'due', 'paid_up', 'no_invoices'].indexOf(r.status),
    },
  ];
  const agedTotal = o.aged.current + o.aged.d1_30 + o.aged.d31_60 + o.aged.d61_plus;

  return (
    <>
      <PageHeader title="Clients & Billing" description="Only you can see this page. What each club and client has agreed to, what's been invoiced, and who has paid. Stripe invoices update by themselves; mark bank transfers and cash here." actions={<Button onClick={() => setAdding(true)}>+ Add client</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Agreed (active deals)" value={money(o.totals.agreed_cents)} />
        <StatCard label="Invoiced" value={money(o.totals.invoiced_cents)} />
        <StatCard label="Paid" value={money(o.totals.paid_cents)} />
        <StatCard label="Outstanding" value={money(o.totals.outstanding_cents)} />
        <StatCard label="Overdue" value={money(o.totals.overdue_cents)} tone={o.totals.overdue_cents ? 'attention' : 'muted'} />
      </div>
      {agedTotal > 0 && (
        <Panel className="mb-5" title="What's owed, by how late it is">
          <div className="flex h-3 overflow-hidden rounded-full bg-mist" aria-hidden="true">
            {([['current', '#6B9FC5'], ['d1_30', '#D9822B'], ['d31_60', '#C2410C'], ['d61_plus', '#B42318']] as const).map(([k, c]) => (o.aged[k] ? <span key={k} style={{ width: `${(o.aged[k] / agedTotal) * 100}%`, background: c }} /> : null))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {([['current', 'Not yet due'], ['d1_30', '1–30 days late'], ['d31_60', '31–60 days late'], ['d61_plus', '61+ days late']] as const).map(([k, l]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{l}</dt>
                <dd className="font-semibold">{money(o.aged[k])}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
      <DataTable
        rows={o.clients.map((c) => ({ ...c, id: c.client.id }))}
        columns={cols}
        search={(r) => `${r.client.name} ${r.client.contact_name ?? ''}`}
        onRowClick={(r) => setOpen(r.client.id)}
        initialSort={{ key: 'status', dir: 'asc' }}
        empty="No clients yet. Add each club or school you work with, then their agreement and invoices."
      />
      {adding && <ClientForm onClose={() => setAdding(false)} onSaved={async (msg) => { setAdding(false); await data.reload(); toast(msg); }} />}
      {open && <ClientDrawer id={open} onClose={() => setOpen(null)} onChange={async (msg) => { await data.reload(); if (msg) toast(msg); }} />}
      {toastNode}
    </>
  );
}

// ------------------------------------------------------------------ one client
function ClientDrawer({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: (msg?: string) => Promise<void> }) {
  const detail = useApi<Detail>(`/api/admin/finance/clients/${id}`);
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<'none' | 'agreement' | 'invoice'>('none');
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = async (msg?: string) => {
    await detail.reload();
    await onChange(msg);
  };
  const x = detail.data;

  async function patchInvoice(inv: Invoice, body: Record<string, unknown>, msg: string) {
    setErr(null);
    try {
      await api(`/api/admin/finance/invoices/${inv.id}`, { method: 'PATCH', body });
      setPaying(null);
      await refresh(msg);
    } catch (e) {
      setErr(errText(e));
    }
  }

  return (
    <Drawer open onClose={onClose} wide title={x?.client.name ?? 'Client'}>
      {detail.loading && !x ? (
        <Loading />
      ) : detail.error || !x ? (
        <ErrorNote message={detail.error ?? 'Not found'} />
      ) : edit ? (
        <ClientForm initial={x.client} onClose={() => setEdit(false)} inline onSaved={async (msg) => { setEdit(false); await refresh(msg); }} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Invoiced" value={money(x.invoiced_cents)} />
            <StatCard label="Paid" value={money(x.paid_cents)} />
            <StatCard label="Owing" value={money(x.outstanding_cents)} />
            <StatCard label="Overdue" value={money(x.overdue_cents)} tone={x.overdue_cents ? 'attention' : 'muted'} />
          </div>

          <Panel title="Details" actions={<Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Edit</Button>}>
            <KV
              items={[
                ['Status', x.client.status],
                ['Contact', x.client.contact_name],
                ['Billing email', x.client.billing_email],
                ['Phone', x.client.phone],
                ['ABN', x.client.abn],
                ['Stripe customer', x.client.stripe_customer_id ?? <span className="text-muted">Not linked – Stripe invoices won&apos;t show here until you add it</span>],
                ['Notes', x.client.notes],
              ]}
            />
          </Panel>

          <Panel title="Agreements" actions={<Button size="sm" onClick={() => setMode(mode === 'agreement' ? 'none' : 'agreement')}>+ Agreement</Button>} pad={false}>
            {mode === 'agreement' && <AgreementForm clientId={x.client.id} onDone={async (msg) => { setMode('none'); await refresh(msg); }} />}
            {!x.agreements.length ? (
              <p className="p-5 text-sm text-muted">No agreement recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {x.agreements.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{a.title} <Badge tone={a.status === 'active' ? 'green' : 'neutral'}>{a.status}</Badge></p>
                      <AgreementStatus a={a} onDone={refresh} onError={setErr} />
                    </div>
                    <p className="text-muted">
                      {modelLabel(a.billing_model)} · {money(a.rate_cents)} {unitLabel(a.billing_model)}
                      {a.agreed_value_cents != null && ` · ${money(a.agreed_value_cents)} agreed`} · {d(a.start_date)} – {a.end_date ? d(a.end_date) : 'ongoing'} · {a.payment_terms_days}-day terms
                    </p>
                    {a.inclusions && <p className="text-muted">{a.inclusions}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Invoices" actions={<Button size="sm" onClick={() => setMode(mode === 'invoice' ? 'none' : 'invoice')}>+ Record invoice</Button>} pad={false}>
            {mode === 'invoice' && <InvoiceForm detail={x} onDone={async (msg) => { setMode('none'); await refresh(msg); }} />}
            {err && <div className="p-3"><ErrorNote message={err} /></div>}
            {!x.invoices.length ? (
              <p className="p-5 text-sm text-muted">No invoices yet. Invoices you send from Stripe appear here by themselves once the Stripe customer ID is on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                      <th className="px-4 py-2 font-medium">Invoice</th>
                      <th className="px-4 py-2 font-medium">Due</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-right font-medium">Paid</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {x.invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-line last:border-0 align-top">
                        <td className="px-4 py-2.5">
                          {inv.hosted_invoice_url ? <a className="font-medium text-royal underline" href={inv.hosted_invoice_url} target="_blank" rel="noopener">{inv.number}</a> : <span className="font-medium">{inv.number}</span>}
                          <span className="block text-xs text-muted">{d(inv.issued_on)}{inv.stripe_invoice_id ? ' · Stripe' : ''}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">{d(inv.due_on)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">{money(inv.amount_cents)}<span className="block text-xs text-muted">GST {money(inv.gst_cents)}</span></td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">{money(inv.amount_paid_cents)}{inv.paid_on && <span className="block text-xs text-muted">{d(inv.paid_on)}</span>}</td>
                        <td className="px-4 py-2.5"><Badge tone={STATE[inv.state][1]}>{STATE[inv.state][0]}</Badge>{inv.method && <span className="block text-xs text-muted">{inv.method.replace('_', ' ')}</span>}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          {inv.state !== 'paid' && inv.state !== 'void' && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => setPaying(paying?.id === inv.id ? null : inv)}>Record payment</Button>{' '}
                              {!inv.stripe_invoice_id && <Button size="sm" variant="ghost" onClick={() => patchInvoice(inv, { void: true }, `${inv.number} voided`)}>Void</Button>}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {paying && (
              <form
                className="grid gap-2 border-t border-line bg-mist/50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void patchInvoice(paying, { payment: { amount_cents: toCents(f.get('amount')) ?? undefined, paid_on: f.get('paid_on') || undefined, method: f.get('method') } }, `Payment recorded on ${paying.number}`);
                }}
              >
                <div>
                  <label className="field-label" htmlFor="pay-amt">Amount ($) for {paying.number}</label>
                  <input id="pay-amt" name="amount" inputMode="decimal" className="field" defaultValue={(paying.owing_cents / 100).toFixed(2)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="pay-date">Paid on</label>
                  <input id="pay-date" name="paid_on" type="date" className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor="pay-method">How</label>
                  <select id="pay-method" name="method" className="field" defaultValue="bank_transfer">
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="stripe">Stripe</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <Button type="submit">Save</Button>
              </form>
            )}
          </Panel>

          <Panel title="Sessions delivered (from the Staff Planner)">
            {x.sessions.by_month.length || x.sessions.upcoming ? (
              <>
                <ul className="space-y-1 text-sm">
                  {x.sessions.by_month.slice(0, 6).map((m) => (
                    <li key={m.month} className="flex justify-between gap-3">
                      <span>{monthFmt.format(new Date(`${m.month}-01T00:00:00Z`))}</span>
                      <span className="font-medium">{m.count} job{m.count === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">{x.sessions.upcoming} more planned. Use these counts to check per-session invoices.</p>
              </>
            ) : (
              <p className="text-sm text-muted">No planner jobs are tagged with this client yet. Pick the client on a job card in the Staff Planner to count sessions here.</p>
            )}
          </Panel>
        </div>
      )}
    </Drawer>
  );
}

function AgreementStatus({ a, onDone, onError }: { a: Agreement; onDone: (msg?: string) => Promise<void>; onError: (e: string) => void }) {
  const next = a.status === 'proposed' ? 'active' : a.status === 'active' ? 'ended' : null;
  if (!next) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await api(`/api/admin/finance/agreements/${a.id}`, { method: 'PATCH', body: { status: next } });
          await onDone(next === 'active' ? 'Agreement is now active' : 'Agreement ended');
        } catch (e) {
          onError(errText(e));
        }
      }}
    >
      {next === 'active' ? 'Mark signed' : 'End agreement'}
    </Button>
  );
}

// ------------------------------------------------------------------ forms
function ClientForm({ initial, onClose, onSaved, inline = false }: { initial?: Client; onClose: () => void; onSaved: (msg: string) => void; inline?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(['name', 'kind', 'contact_name', 'billing_email', 'phone', 'abn', 'stripe_customer_id', 'status', 'notes'].map((k) => [k, f.get(k)]));
    setBusy(true);
    setErr(null);
    try {
      if (initial) await api(`/api/admin/finance/clients/${initial.id}`, { method: 'PATCH', body });
      else await api('/api/admin/finance/clients', { body });
      onSaved(initial ? 'Client saved' : 'Client added');
    } catch (e2) {
      setErr(errText(e2));
      setBusy(false);
    }
  }
  const form = (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="c-name">Club or client</label>
        <input id="c-name" name="name" className="field" required minLength={2} defaultValue={initial?.name ?? ''} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="c-kind">Kind</label>
          <select id="c-kind" name="kind" className="field" defaultValue={initial?.kind ?? 'club'}>
            {['club', 'school', 'association', 'corporate', 'individual', 'other'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="c-status">Status</label>
          <select id="c-status" name="status" className="field" defaultValue={initial?.status ?? 'active'}>
            {['prospect', 'active', 'paused', 'ended'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="c-contact">Contact name</label>
          <input id="c-contact" name="contact_name" className="field" defaultValue={initial?.contact_name ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="c-email">Billing email</label>
          <input id="c-email" name="billing_email" type="email" className="field" defaultValue={initial?.billing_email ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="c-phone">Phone</label>
          <input id="c-phone" name="phone" type="tel" className="field" defaultValue={initial?.phone ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="c-abn">ABN</label>
          <input id="c-abn" name="abn" inputMode="numeric" className="field" defaultValue={initial?.abn ?? ''} />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="c-stripe">Stripe customer ID (optional)</label>
        <input id="c-stripe" name="stripe_customer_id" className="field" placeholder="cus_…" defaultValue={initial?.stripe_customer_id ?? ''} />
        <p className="mt-1 text-xs text-muted">From the customer&apos;s page in Stripe. With it, invoices you send from Stripe appear and mark themselves paid here.</p>
      </div>
      <div>
        <label className="field-label" htmlFor="c-notes">Notes</label>
        <textarea id="c-notes" name="notes" rows={3} className="field" defaultValue={initial?.notes ?? ''} />
      </div>
      {err && <ErrorNote message={err} />}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save' : 'Add client'}</Button>
      </div>
    </form>
  );
  return inline ? form : <Drawer open onClose={onClose} title="Add client">{form}</Drawer>;
}

function AgreementForm({ clientId, onDone }: { clientId: string; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await api('/api/admin/finance/agreements', {
        body: {
          client_id: clientId,
          title: f.get('title'),
          billing_model: f.get('billing_model'),
          rate_cents: toCents(f.get('rate')) ?? -1,
          agreed_value_cents: toCents(f.get('agreed')),
          start_date: f.get('start_date'),
          end_date: f.get('end_date'),
          payment_terms_days: Number(f.get('terms') || 14),
          inclusions: f.get('inclusions'),
          status: f.get('status'),
        },
      });
      onDone('Agreement added');
    } catch (e2) {
      setErr(errText(e2));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-line bg-mist/50 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="a-title">Agreement</label>
        <input id="a-title" name="title" required minLength={2} className="field" placeholder="e.g. 2027 season S&C" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-model">How they pay</label>
        <select id="a-model" name="billing_model" className="field">
          {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="a-rate">Rate, incl. GST ($)</label>
        <input id="a-rate" name="rate" required inputMode="decimal" className="field" placeholder="2400" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-agreed">Total agreed value ($)</label>
        <input id="a-agreed" name="agreed" inputMode="decimal" className="field" placeholder="Optional" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-terms">Payment terms (days)</label>
        <input id="a-terms" name="terms" type="number" min={0} max={120} defaultValue={14} className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-start">Start</label>
        <input id="a-start" name="start_date" type="date" required className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-end">End</label>
        <input id="a-end" name="end_date" type="date" className="field" />
      </div>
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="a-incl">What&apos;s included</label>
        <input id="a-incl" name="inclusions" className="field" placeholder="Sessions per week, testing, match days" />
      </div>
      <div>
        <label className="field-label" htmlFor="a-status">Status</label>
        <select id="a-status" name="status" className="field" defaultValue="active">
          <option value="proposed">Proposed</option>
          <option value="active">Signed / active</option>
        </select>
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add agreement'}</Button>
      </div>
      {err && <div className="sm:col-span-2"><ErrorNote message={err} /></div>}
    </form>
  );
}

function InvoiceForm({ detail, onDone }: { detail: Detail; onDone: (msg: string) => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const active = detail.agreements.find((a) => a.status === 'active');
  const [agreement, setAgreement] = useState(active?.id ?? '');
  const [issued, setIssued] = useState(today);
  const terms = detail.agreements.find((a) => a.id === agreement)?.payment_terms_days ?? 14;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await api('/api/admin/finance/invoices', { body: { client_id: detail.client.id, agreement_id: agreement || null, number: f.get('number'), issued_on: issued, due_on: f.get('due_on') || addDays(issued, terms), amount_cents: toCents(f.get('amount')) ?? -1, notes: f.get('notes') } });
      onDone('Invoice recorded');
    } catch (e2) {
      setErr(errText(e2));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-line bg-mist/50 p-4 sm:grid-cols-2">
      <p className="text-xs text-muted sm:col-span-2">For invoices sent outside Stripe (e.g. from Xero or by hand). GST is worked out as 1/11th of the amount.</p>
      <div>
        <label className="field-label" htmlFor="i-num">Invoice number</label>
        <input id="i-num" name="number" required className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="i-amt">Amount incl. GST ($)</label>
        <input id="i-amt" name="amount" required inputMode="decimal" className="field" defaultValue={active && active.billing_model === 'monthly_retainer' ? (active.rate_cents / 100).toFixed(2) : ''} />
      </div>
      <div>
        <label className="field-label" htmlFor="i-iss">Issued</label>
        <input id="i-iss" type="date" required className="field" value={issued} onChange={(e) => setIssued(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="i-due">Due</label>
        <input id="i-due" name="due_on" type="date" className="field" placeholder={addDays(issued, terms)} key={`${issued}-${terms}`} defaultValue={addDays(issued, terms)} />
      </div>
      {detail.agreements.length > 0 && (
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="i-ag">For agreement</label>
          <select id="i-ag" className="field" value={agreement} onChange={(e) => setAgreement(e.target.value)}>
            <option value="">None</option>
            {detail.agreements.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="i-notes">Notes</label>
        <input id="i-notes" name="notes" className="field" placeholder="e.g. November sessions" />
      </div>
      {err && <div className="sm:col-span-2"><ErrorNote message={err} /></div>}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record invoice'}</Button>
      </div>
    </form>
  );
}
