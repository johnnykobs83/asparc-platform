'use client';

import { useState } from 'react';
import { ApiError, api, fmtDate, fmtMoney, label, useApi } from '../api';
import { BarList } from '../charts';
import type { Me } from '../AdminApp';
import { Badge, Button, DataTable, Empty, ErrorNote, KV, Loading, Notice, PageHeader, Panel, Select, StatCard, useToast } from '../ui';

type Can = (p: string) => boolean;

/* ------------------------------------------------------------ REVENUE */
export function RevenueSection() {
  const { data, error, loading } = useApi<{ connected: boolean; totalCents: number; payments: { id: string; description: string | null; amount_cents: number; status: string; paid_at: string | null; provider_ref: string }[] }>('/api/admin/revenue');
  return (
    <>
      <PageHeader title="Revenue" description="Revenue is reported only from real payment records received from Stripe. No figures are estimated." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && !data.connected && (
        <Empty title="Payments are not connected yet">
          Revenue reporting activates in <strong>Phase 4</strong> when Stripe is connected (STRIPE_SECRET_KEY + webhook). Until then, payments are handled outside the platform and nothing is shown here.
        </Empty>
      )}
      {data?.connected && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total received" value={fmtMoney(data.totalCents)} />
            <StatCard label="Payments" value={data.payments.filter((p) => p.status === 'succeeded').length} />
          </div>
          <DataTable
            rows={data.payments}
            search={(p) => `${p.description ?? ''} ${p.provider_ref}`}
            columns={[
              { key: 'd', header: 'Description', render: (p) => p.description ?? '–' },
              { key: 'a', header: 'Amount', render: (p) => fmtMoney(p.amount_cents) },
              { key: 's', header: 'Status', render: (p) => <Badge tone={p.status === 'succeeded' ? 'green' : 'neutral'}>{label(p.status)}</Badge> },
              { key: 'p', header: 'Paid', render: (p) => fmtDate(p.paid_at) },
            ]}
          />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------ NOTIFICATIONS */
interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'important' | 'urgent';
  link_path: string | null;
  read_at: string | null;
  email_status: string;
  created_at: string;
}

export function NotificationsSection({ can, onChange }: { can: Can; onChange: () => void }) {
  const [filter, setFilter] = useState('unread');
  const { data, error, loading, reload } = useApi<{ notifications: NotificationRow[]; unread: number }>(`/api/admin/notifications${filter === 'unread' ? '?unread=1' : filter ? `?type=${filter}` : ''}`);
  const write = can('notifications:write');
  async function markRead(id: string, read = true) {
    await api(`/api/admin/notifications/${id}`, { method: 'PATCH', body: { read } });
    reload();
    onChange();
  }
  return (
    <>
      <PageHeader
        title="Notifications"
        description="New qualified leads, Academy and club enquiries, complaints, unresolved AI questions, booking requests, payments and daily summaries."
        actions={write && (data?.unread ?? 0) > 0 && <Button variant="secondary" onClick={async () => { await api('/api/admin/notifications/read-all', { method: 'POST' }); reload(); onChange(); }}>Mark all read</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[['unread', 'Unread'], ['', 'All'], ['qualified_lead', 'Leads'], ['academy_enquiry', 'Academy'], ['club_partnership', 'Club partnerships'], ['complaint', 'Complaints'], ['unresolved_question', 'Unresolved AI questions'], ['booking_request', 'Booking requests'], ['escalation', 'Escalations'], ['daily_summary', 'Daily summaries']]}
        />
      </div>
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && data.notifications.length === 0 && <Empty title={filter === 'unread' ? 'You’re all caught up' : 'No notifications'} />}
      {data && data.notifications.length > 0 && (
        <ul className="space-y-2">
          {data.notifications.map((n) => (
            <li key={n.id} className={`rounded-xl border bg-white p-4 ${n.read_at ? 'border-line opacity-75' : n.severity === 'urgent' ? 'border-danger/40' : n.severity === 'important' ? 'border-royal/30' : 'border-line'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={n.severity === 'urgent' ? 'red' : n.severity === 'important' ? 'blue' : 'neutral'}>{label(n.severity)}</Badge>
                    <Badge>{label(n.type)}</Badge>
                    <span className="text-xs text-muted">{fmtDate(n.created_at)}</span>
                    <span className="text-xs text-muted">· Email: {n.email_status === 'not_required' ? 'not required' : label(n.email_status)}</span>
                  </div>
                  <p className="mt-2 font-medium">{n.title}</p>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {n.link_path && <a href={n.link_path} onClick={() => !n.read_at && write && void markRead(n.id)} className="rounded-md bg-royal px-3 py-1.5 text-xs font-medium text-white hover:bg-royal-600">Open</a>}
                  {write && <Button size="sm" variant="secondary" onClick={() => markRead(n.id, !n.read_at)}>{n.read_at ? 'Mark unread' : 'Mark read'}</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------ INTEGRATIONS */
interface Integration {
  key: string;
  name: string;
  phase: number;
  state: 'connected' | 'not_configured' | 'partially_configured' | 'not_started';
  detail: string;
  missing: string[];
}

const STATE: Record<Integration['state'], { tone: 'green' | 'amber' | 'neutral' | 'sky'; text: string }> = {
  connected: { tone: 'green', text: 'Connected' },
  partially_configured: { tone: 'amber', text: 'Partially configured' },
  not_configured: { tone: 'amber', text: 'Awaiting credentials' },
  not_started: { tone: 'sky', text: 'Prepared – later phase' },
};

export function IntegrationsSection({ can }: { can: Can }) {
  const { data, error, loading, reload } = useApi<{ integrations: Integration[]; logs: { id: string; integration: string; action: string; status: string; error: string | null; created_at: string; entity_type: string | null }[] }>('/api/admin/integrations');
  const [testing, setTesting] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  async function test(key: string) {
    setTesting(key);
    try {
      const r = await api<{ ok: boolean; message: string }>('/api/admin/integrations/test', { body: { integration: key } });
      toast(r.message, r.ok ? 'ok' : 'err');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Test failed', 'err');
    } finally {
      setTesting(null);
    }
  }
  return (
    <>
      {toastNode}
      <PageHeader title="Integrations" description="What is live, what is waiting on credentials, and what belongs to a later phase. Statuses reflect real configuration – nothing is shown as connected unless it is." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.integrations.map((i) => (
              <div key={i.key} className="flex flex-col rounded-xl border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted">Phase {i.phase}</p>
                    <p className="mt-0.5 font-medium">{i.name}</p>
                  </div>
                  <Badge tone={STATE[i.state].tone}>{STATE[i.state].text}</Badge>
                </div>
                <p className="mt-3 flex-1 text-sm text-muted">{i.detail}</p>
                {i.missing.length > 0 && i.state !== 'not_started' && (
                  <p className="mt-3 text-xs text-muted">
                    Needs: {i.missing.map((m) => <code key={m} className="mb-1 mr-1 inline-block break-all rounded bg-mist px-1 py-0.5 text-[11px]">{m}</code>)}
                  </p>
                )}
                {can('integrations:run') && ['supabase', 'openai', 'hubspot', 'resend'].includes(i.key) && (
                  <Button size="sm" variant="secondary" className="mt-4 self-start" disabled={testing === i.key} onClick={() => test(i.key)}>
                    {testing === i.key ? 'Testing…' : 'Test connection'}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Notice>Secrets are set as environment variables in Vercel (never in the dashboard or code). See <code>docs/CREDENTIALS.md</code> for each account and permission required.</Notice>
          <Panel title="Integration activity log" pad={false}>
            {data.logs.length === 0 ? (
              <p className="p-5 text-sm text-muted">No integration activity yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th className="px-5 py-2.5 font-medium">When</th>
                      <th className="px-5 py-2.5 font-medium">Integration</th>
                      <th className="px-5 py-2.5 font-medium">Action</th>
                      <th className="px-5 py-2.5 font-medium">Result</th>
                      <th className="px-5 py-2.5 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.slice(0, 50).map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-5 py-2.5 text-muted">{fmtDate(l.created_at)}</td>
                        <td className="px-5 py-2.5">{label(l.integration)}</td>
                        <td className="px-5 py-2.5">{label(l.action)}</td>
                        <td className="px-5 py-2.5"><Badge tone={l.status === 'success' ? 'green' : l.status === 'error' ? 'red' : 'neutral'}>{label(l.status)}</Badge></td>
                        <td className="max-w-md truncate px-5 py-2.5 text-xs text-muted">{l.error ?? l.entity_type ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------ REPORTS */
interface Summary {
  date: string;
  totalEnquiries: number;
  qualifiedLeads: number;
  newLeadsByChannel: { label: string; count: number }[];
  academyEnquiries: number;
  bookingRequests: number;
  conversations: number;
  payments: { connected: boolean; count: number; totalCents: number };
  outstandingFollowUps: { id: string; name: string; type: string; stage: string; due: string | null }[];
  attentionItems: { kind: string; id: string; reason: string }[];
}

export function ReportsSection({ can }: { can: Can }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
  const [date, setDate] = useState(today);
  const { data, error, loading, reload } = useApi<{ live: Summary; history: { id: string; summary_date: string; email_status: string; data: Summary }[]; funnel: { label: string; count: number }[]; sources: { label: string; count: number }[] }>(`/api/admin/reports?date=${date}`);
  const { toast, toastNode } = useToast();
  const s = data?.live;
  const converted = data?.funnel.find((f) => f.label === 'Converted')?.count ?? 0;
  const totalLeads = data?.funnel.reduce((a, f) => a + f.count, 0) ?? 0;
  return (
    <>
      {toastNode}
      <PageHeader
        title="Reports"
        description="Daily business summary (Melbourne time) and lead conversion. The summary runs automatically each morning once scheduled; you can also run it now."
        actions={
          <>
            <label className="inline-flex items-center gap-2 text-sm">
              <span className="text-muted">Day</span>
              <input type="date" className="field !w-auto !py-2 !text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            {can('reports:run') && (
              <Button onClick={async () => { await api('/api/admin/reports/run', { body: { date } }); toast('Summary generated and sent to notifications'); reload(); }}>Run summary for this day</Button>
            )}
          </>
        }
      />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {s && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Enquiries" value={s.totalEnquiries} hint={s.date} />
            <StatCard label="Qualified" value={s.qualifiedLeads} />
            <StatCard label="Academy" value={s.academyEnquiries} />
            <StatCard label="Booking requests" value={s.bookingRequests} />
            <StatCard label="Chats" value={s.conversations} />
            <StatCard label="Payments" value={s.payments.connected ? fmtMoney(s.payments.totalCents) : '—'} hint={s.payments.connected ? undefined : 'Not connected'} tone={s.payments.connected ? 'default' : 'muted'} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title={`New leads by channel · ${s.date}`}>
              <BarList data={s.newLeadsByChannel.map((c) => ({ label: c.label, value: c.count }))} />
            </Panel>
            <Panel title={`Outstanding follow-ups (${s.outstandingFollowUps.length})`}>
              {s.outstandingFollowUps.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                <ul className="space-y-2 text-sm">
                  {s.outstandingFollowUps.slice(0, 12).map((f) => (
                    <li key={f.id}><a href={`/admin/leads?id=${f.id}`} className="hover:text-royal">{f.name}</a> <span className="text-muted">· {label(f.type)} · {label(f.stage)}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={`Requires attention (${s.attentionItems.length})`}>
              {s.attentionItems.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                <ul className="space-y-2 text-sm">
                  {s.attentionItems.slice(0, 12).map((a) => (
                    <li key={a.id}><a className="hover:text-royal" href={a.kind === 'lead' ? `/admin/leads?id=${a.id}` : `/admin/conversations?id=${a.id}`}>{a.reason}</a></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Lead conversion · last 90 days">
              <p className="mb-4 text-sm text-muted">{totalLeads ? `${converted} of ${totalLeads} leads converted (${Math.round((converted / totalLeads) * 100)}%)` : 'No leads yet.'}</p>
              <BarList data={data.funnel.map((f) => ({ label: f.label, value: f.count }))} />
            </Panel>
            <Panel title="Summary history" pad={false}>
              {data.history.length === 0 ? <p className="p-5 text-sm text-muted">No summaries generated yet.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {data.history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <button type="button" className="font-medium hover:text-royal" onClick={() => setDate(h.summary_date)}>{h.summary_date}</button>
                      <span className="text-muted">{h.data.totalEnquiries} enquiries · {h.data.attentionItems?.length ?? 0} attention</span>
                      <Badge tone={h.email_status === 'sent' ? 'green' : 'neutral'}>Email: {label(h.email_status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------ SETTINGS */
export function SettingsSection({ me, can }: { me: Me; can: Can }) {
  const users = useApi<{ users: { id: string; email: string; full_name: string | null; role: string; active: boolean; last_login_at: string | null }[] }>(can('users:manage') ? '/api/admin/users' : null);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'staff', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  return (
    <>
      {toastNode}
      <PageHeader title="Settings" description="Your account, team access and roles." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Your account">
          <KV items={[['Name', me.user.name ?? '–'], ['Email', me.user.email], ['Role', label(me.user.role)]]} />
          <div className="mt-5 rounded-lg bg-mist p-3 text-xs text-muted">
            <p className="font-medium text-charcoal">Role permissions</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li><strong>Owner</strong> – everything, incl. team access and data deletion</li>
              <li><strong>Manager</strong> – all operations, knowledge base, pricing, reports, integrations</li>
              <li><strong>Staff</strong> – view all; work leads, bookings, Academy, conversations</li>
            </ul>
          </div>
        </Panel>
        <Panel title="Notification preferences">
          <p className="text-sm text-muted">Choose which notifications are emailed and whether the daily summary is emailed in <a className="text-royal underline" href="/admin/knowledge-base">AI Knowledge Base → Settings</a>.</p>
          <p className="mt-3 text-sm text-muted">Recipients are set by <code className="rounded bg-mist px-1">NOTIFY_EMAIL_TO</code> in Vercel.</p>
        </Panel>
        <Panel title="Security">
          <ul className="space-y-2 text-sm text-muted">
            <li>• Sessions expire after 12 hours (HttpOnly, SameSite cookie)</li>
            <li>• Sign-in attempts are rate-limited</li>
            <li>• All database tables use Row Level Security</li>
            <li>• Secrets live only in server environment variables</li>
          </ul>
        </Panel>
      </div>
      {can('users:manage') && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {users.loading && !users.data && <Loading />}
            {users.data && (
              <DataTable
                rows={users.data.users}
                columns={[
                  { key: 'u', header: 'User', render: (u) => <div><p className="font-medium">{u.full_name ?? u.email}</p><p className="text-xs text-muted">{u.email}</p></div> },
                  {
                    key: 'r',
                    header: 'Role',
                    render: (u) => (
                      <Select label="Role" value={u.role} onChange={async (v) => { try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: v } }); toast('Role updated'); users.reload(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }} options={[['owner', 'Owner'], ['manager', 'Manager'], ['staff', 'Staff']]} />
                    ),
                  },
                  { key: 'a', header: 'Access', render: (u) => <Button size="sm" variant={u.active ? 'secondary' : 'primary'} onClick={async () => { try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); users.reload(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }}>{u.active ? 'Disable' : 'Enable'}</Button> },
                  { key: 'l', header: 'Last sign-in', render: (u) => <span className="text-muted">{fmtDate(u.last_login_at)}</span> },
                ]}
              />
            )}
          </div>
          <Panel title="Add team member">
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  await api('/api/admin/users', { body: form });
                  setForm({ email: '', full_name: '', role: 'staff', password: '' });
                  toast('User created');
                  users.reload();
                } catch (x) {
                  setErr(x instanceof ApiError && x.fields ? Object.values(x.fields).join(' ') : x instanceof Error ? x.message : 'Failed');
                }
              }}
            >
              <input className="field" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} aria-label="Full name" />
              <input className="field" type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" />
              <input className="field" type="password" required placeholder="Temporary password (12+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-label="Temporary password" autoComplete="new-password" />
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Role">
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
              {err && <ErrorNote message={err} />}
              <Button type="submit">Create user</Button>
            </form>
          </Panel>
        </div>
      )}
    </>
  );
}
