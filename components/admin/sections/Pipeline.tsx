'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, fmtMoney, getParam, label, setParam, useApi } from '../api';
import { OnlineBookingPanel } from './OnlineBooking';
import { Badge, Button, DataTable, Drawer, ErrorNote, KV, Loading, Notice, PageHeader, Panel, STAGE_TONE, Select, useToast } from '../ui';

type Can = (p: string) => boolean;

const STAGES: [string, string][] = [
  ['new_enquiry', 'New Enquiry'],
  ['contacted', 'Contacted'],
  ['qualified', 'Qualified'],
  ['booking_requested', 'Booking Requested'],
  ['converted', 'Converted'],
  ['not_proceeding', 'Not Proceeding'],
];
const stageLabel = (s: string) => STAGES.find(([k]) => k === s)?.[1] ?? label(s);

interface LeadRow {
  id: string;
  lead_type: string;
  source: string;
  service_interest: string | null;
  athlete_age_group: string | null;
  stage: string;
  qualification_score: number;
  is_qualified: boolean;
  priority: 'high' | 'normal' | 'low';
  needs_attention: boolean;
  attention_reason: string | null;
  enquiry_details: string | null;
  follow_up_status: string;
  follow_up_due: string | null;
  hubspot_sync_status: string;
  conversation_id: string | null;
  customer_id: string;
  created_at: string;
  customer: { id: string; full_name: string; email: string | null; phone: string | null; preferred_contact: string | null; consent_marketing: boolean; is_guardian: boolean } | null;
}

/* ------------------------------------------------------------ LEADS */
export function LeadsSection({ can }: { can: Can }) {
  const initial = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [stage, setStage] = useState(initial.get('stage') ?? '');
  const [type, setType] = useState('');
  const [attention, setAttention] = useState(initial.get('attention') === '1');
  const qs = new URLSearchParams({ ...(stage && { stage }), ...(type && { type }), ...(attention && { attention: '1' }) }).toString();
  const { data, error, loading, reload } = useApi<{ leads: LeadRow[] }>(`/api/admin/leads${qs ? `?${qs}` : ''}`);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOpenId(getParam('id')), []);

  const open = (id: string | null) => {
    setOpenId(id);
    setParam('id', id);
  };

  return (
    <>
      <PageHeader title="Leads" description="Every enquiry from the website, forms and ASPARC AI. Stage changes and notes sync to HubSpot when it is connected." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <DataTable
          rows={data.leads}
          initialSort={{ key: 'created', dir: 'desc' }}
          search={(l) => [l.customer?.full_name, l.customer?.email, l.customer?.phone, l.service_interest, l.enquiry_details].join(' ')}
          onRowClick={(l) => open(l.id)}
          empty="No leads yet. Enquiries from the website and chat will appear here automatically."
          filters={
            <>
              <Select label="Stage" value={stage} onChange={setStage} options={[['', 'All stages'], ...STAGES]} />
              <Select
                label="Type"
                value={type}
                onChange={setType}
                options={[['', 'All types'], ['academy', 'Academy'], ['club_partnership', 'Club partnership'], ['booking', 'Booking'], ['sports_performance', 'Sports performance'], ['rehabilitation', 'Rehabilitation'], ['massage', 'Massage'], ['testing', 'Testing'], ['complaint', 'Complaint'], ['general', 'General']]}
              />
              <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 text-sm">
                <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} className="accent-royal" /> Needs attention
              </label>
            </>
          }
          columns={[
            {
              key: 'name',
              header: 'Contact',
              sortValue: (l) => l.customer?.full_name ?? '',
              render: (l) => (
                <div>
                  <p className="font-medium">
                    {l.customer?.full_name ?? '–'} {l.needs_attention && <Badge tone="amber" className="ml-1">Attention</Badge>}
                  </p>
                  <p className="text-xs text-muted">{l.customer?.email ?? l.customer?.phone}</p>
                </div>
              ),
            },
            { key: 'type', header: 'Type', render: (l) => <span>{label(l.lead_type)}{l.athlete_age_group ? ` · ${l.athlete_age_group}` : ''}</span> },
            { key: 'service', header: 'Interest', render: (l) => <span className="line-clamp-1 max-w-[220px] text-muted">{l.service_interest ?? '–'}</span> },
            { key: 'source', header: 'Source', render: (l) => label(l.source) },
            { key: 'stage', header: 'Stage', sortValue: (l) => STAGES.findIndex(([k]) => k === l.stage), render: (l) => <Badge tone={STAGE_TONE[l.stage]}>{stageLabel(l.stage)}</Badge> },
            {
              key: 'score',
              header: 'Score',
              sortValue: (l) => l.qualification_score,
              render: (l) => (
                <span className="tabular-nums">
                  {l.qualification_score}
                  {l.is_qualified && <span className="ml-1 text-success" title="Qualified">✓</span>}
                  {l.priority === 'high' && <Badge tone="red" className="ml-1.5">High</Badge>}
                </span>
              ),
            },
            { key: 'crm', header: 'HubSpot', render: (l) => <Badge tone={l.hubspot_sync_status === 'synced' ? 'green' : l.hubspot_sync_status === 'failed' ? 'red' : 'neutral'}>{label(l.hubspot_sync_status)}</Badge> },
            { key: 'created', header: 'Received', sortValue: (l) => l.created_at, render: (l) => <span className="whitespace-nowrap text-muted">{fmtDate(l.created_at)}</span> },
          ]}
        />
      )}
      <LeadDrawer id={openId} onClose={() => open(null)} onChanged={reload} can={can} />
    </>
  );
}

interface LeadDetail {
  lead: LeadRow;
  customer: LeadRow['customer'] & { consent_contact: boolean; consent_contact_at: string | null; consent_marketing_at: string | null; source: string; hubspot_contact_id: string | null; created_at: string };
  events: { id: string; event_type: string; detail: Record<string, unknown>; actor: string; created_at: string }[];
  bookings: { id: string; service_name: string; preferred_days: string | null; preferred_times: string | null; status: string }[];
  registrations: { id: string; athlete_first_name: string; athlete_last_name: string | null; athlete_age_group: string; status: string }[];
  messages: { id: string; role: string; content: string; created_at: string }[];
}

function LeadDrawer({ id, onClose, onChanged, can }: { id: string | null; onClose: () => void; onChanged: () => void; can: Can }) {
  const { data, error, reload } = useApi<LeadDetail>(id ? `/api/admin/leads/${id}` : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, toastNode } = useToast();

  async function patch(body: Record<string, unknown>, msg: string) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/admin/leads/${id}`, { method: 'PATCH', body });
      toast(msg);
      await reload();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'err');
    } finally {
      setBusy(false);
    }
  }

  const l = data?.lead;
  const c = data?.customer;
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={c?.full_name ?? 'Lead'} wide>
      {toastNode}
      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {l && c && (
        <div className="space-y-5">
          {l.needs_attention && <Notice tone="warn">{l.attention_reason ?? 'Needs attention'}</Notice>}
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Contact">
              <KV
                items={[
                  ['Email', c.email ? <a className="text-royal" href={`mailto:${c.email}`}>{c.email}</a> : '–'],
                  ['Phone', c.phone ? <a className="text-royal" href={`tel:${c.phone}`}>{c.phone}</a> : '–'],
                  ['Prefers', label(c.preferred_contact)],
                  ['Parent/guardian', c.is_guardian ? 'Yes' : 'No'],
                  ['Contact consent', c.consent_contact ? `Yes · ${fmtDate(c.consent_contact_at)}` : 'No'],
                  ['Marketing consent', c.consent_marketing ? `Yes · ${fmtDate(c.consent_marketing_at)}` : 'No – do not send marketing'],
                ]}
              />
            </Panel>
            <Panel title="Enquiry">
              <KV
                items={[
                  ['Type', label(l.lead_type)],
                  ['Interest', l.service_interest ?? '–'],
                  ['Age group', l.athlete_age_group ?? '–'],
                  ['Source', label(l.source)],
                  ['Score', `${l.qualification_score}/100 ${l.is_qualified ? '· Qualified' : ''}`],
                  ['Received', fmtDate(l.created_at)],
                  ['HubSpot', label(l.hubspot_sync_status)],
                ]}
              />
            </Panel>
          </div>
          {l.enquiry_details && (
            <Panel title="Details">
              <p className="whitespace-pre-wrap text-sm">{l.enquiry_details}</p>
            </Panel>
          )}

          {can('leads:write') && (
            <Panel title="Pipeline & follow-up">
              <div className="flex flex-wrap items-center gap-3">
                <Select label="Stage" value={l.stage} onChange={(v) => patch({ stage: v }, `Stage → ${stageLabel(v)}`)} options={STAGES} />
                <Select label="Follow-up" value={l.follow_up_status} onChange={(v) => patch({ follow_up_status: v }, 'Follow-up updated')} options={[['pending', 'Follow-up pending'], ['in_progress', 'In progress'], ['done', 'Done']]} />
                {l.needs_attention && <Button variant="secondary" disabled={busy} onClick={() => patch({ needs_attention: false }, 'Marked as handled')}>Mark handled</Button>}
                <Button variant="ghost" disabled={busy} onClick={async () => { const r = await api<{ status: string; error?: string }>(`/api/admin/leads/${l.id}/sync`, { method: 'POST' }); toast(r.status === 'synced' ? 'Synced to HubSpot' : r.status === 'skipped' ? 'HubSpot is not connected' : `Sync failed: ${r.error}`, r.status === 'failed' ? 'err' : 'ok'); reload(); }}>
                  Sync to HubSpot
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">Follow-up due: {fmtDate(l.follow_up_due)}</p>
              <div className="mt-4 flex gap-2">
                <label htmlFor="lead-note" className="sr-only">Add note</label>
                <input id="lead-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (e.g. called, left voicemail)…" className="field !py-2 !text-sm" maxLength={2000} />
                <Button disabled={!note.trim() || busy} onClick={async () => { await patch({ note }, 'Note added'); setNote(''); }}>Add</Button>
              </div>
            </Panel>
          )}

          {(data.bookings.length > 0 || data.registrations.length > 0) && (
            <Panel title="Linked requests">
              <ul className="space-y-2 text-sm">
                {data.bookings.map((b) => (
                  <li key={b.id}>Booking request: <strong>{b.service_name}</strong> · {b.preferred_days ?? 'any day'} {b.preferred_times ?? ''} <Badge>{label(b.status)}</Badge></li>
                ))}
                {data.registrations.map((r) => (
                  <li key={r.id}>Academy: <strong>{r.athlete_first_name} {r.athlete_last_name ?? ''}</strong> ({r.athlete_age_group}) <Badge>{label(r.status)}</Badge></li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="History">
            <ol className="space-y-2.5 text-sm">
              {data.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted">{fmtDate(e.created_at)}</span>
                  <span>
                    <strong className="font-medium">{label(e.event_type)}</strong>
                    {e.event_type === 'stage_changed' && ` → ${String(e.detail.label ?? '')}`}
                    {e.event_type === 'note' && `: ${String(e.detail.note ?? '')}`}
                    <span className="text-muted"> · {e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          {data.messages.length > 0 && (
            <Panel title="Chat transcript">
              <Transcript messages={data.messages} />
            </Panel>
          )}

          {can('data:delete') && (
            <div className="rounded-lg border border-danger/25 bg-white p-4 text-sm">
              <p className="font-medium text-danger">Privacy request</p>
              <p className="mt-1 text-muted">Permanently delete this person’s customer record, leads, bookings, registrations and conversations.</p>
              <Button
                variant="danger"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  if (!window.confirm(`Permanently delete all data for ${c.full_name}? This cannot be undone.`)) return;
                  await api(`/api/admin/customers/${c.id}`, { method: 'DELETE' });
                  onChanged();
                  onClose();
                }}
              >
                Delete customer data
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Transcript({ messages }: { messages: { id: string; role: string; content: string; created_at: string; tool_name?: string | null; metadata?: { staff?: string } | null }[] }) {
  return (
    <ol className="space-y-2.5">
      {messages.map((m) =>
        m.role === 'tool' ? (
          <li key={m.id} className="text-center text-[11px] text-muted">⚙ AI action: {m.tool_name}</li>
        ) : (
          <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm ${m.role === 'user' ? 'bg-royal text-white' : 'bg-mist'}`}>
              {m.content}
              <span className={`mt-1 block text-[10px] ${m.role === 'user' ? 'text-white/60' : 'text-muted'}`}>{m.role === 'user' ? 'Visitor' : m.metadata?.staff ? `ASPARC staff (${m.metadata.staff})` : 'ASPARC AI'} · {fmtDate(m.created_at)}</span>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

/* ------------------------------------------------------------ CONVERSATIONS */
interface ConvoRow {
  id: string;
  channel: string;
  status: string;
  needs_attention: boolean;
  attention_reason: string | null;
  ai_mode: string;
  message_count: number;
  last_message_at: string | null;
  customer_name: string | null;
  lead_id: string | null;
  created_at: string;
  state?: { human_takeover?: boolean; opted_out?: boolean; last_inbound_at?: string } | null;
}

const MESSAGING_CHANNELS = ['whatsapp', 'facebook', 'instagram'];
const CHANNEL_NAMES: Record<string, string> = { whatsapp: 'WhatsApp', facebook: 'Facebook Messenger', instagram: 'Instagram' };

export function ConversationsSection({ can }: { can: Can }) {
  const [attention, setAttention] = useState(getParam('attention') === '1');
  const { data, error, loading, reload } = useApi<{ conversations: ConvoRow[] }>(`/api/admin/conversations${attention ? '?attention=1' : ''}`);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOpenId(getParam('id')), []);
  const open = (id: string | null) => {
    setOpenId(id);
    setParam('id', id);
  };
  const detail = useApi<{ conversation: ConvoRow; messages: { id: string; role: string; content: string; created_at: string; tool_name: string | null; metadata?: { staff?: string } | null }[]; customer: { full_name: string } | null; lead: { id: string } | null }>(openId ? `/api/admin/conversations/${openId}` : null);

  async function update(body: Record<string, unknown>) {
    await api(`/api/admin/conversations/${openId}`, { method: 'PATCH', body });
    await detail.reload();
    reload();
  }

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  useEffect(() => {
    setDraft('');
    setReplyError(null);
  }, [openId]);
  async function sendReply() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      await api(`/api/admin/conversations/${openId}/reply`, { body: { message: draft } });
      setDraft('');
      await detail.reload();
      reload();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader title="Conversations" description="Every ASPARC AI conversation, recorded in full. Escalations, complaints and questions the AI could not answer are flagged for review." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <DataTable
          rows={data.conversations}
          initialSort={{ key: 'last', dir: 'desc' }}
          search={(c) => `${c.customer_name ?? ''} ${c.attention_reason ?? ''}`}
          onRowClick={(c) => open(c.id)}
          empty="No conversations yet. Chats from the website widget will appear here."
          filters={
            <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} className="accent-royal" /> Needs attention
            </label>
          }
          columns={[
            { key: 'who', header: 'Visitor', render: (c) => <span className="font-medium">{c.customer_name ?? <span className="text-muted">Anonymous visitor</span>}</span> },
            { key: 'channel', header: 'Channel', render: (c) => label(c.channel) },
            { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'escalated' ? 'red' : c.status === 'closed' ? 'neutral' : 'blue'}>{label(c.status)}</Badge> },
            { key: 'flag', header: 'Flag', render: (c) => (c.needs_attention ? <span className="line-clamp-2 max-w-xs text-xs text-warn">{c.attention_reason}</span> : <span className="text-muted">–</span>) },
            { key: 'lead', header: 'Lead', render: (c) => (c.lead_id ? <Badge tone="green">Captured</Badge> : <span className="text-muted">–</span>) },
            { key: 'msgs', header: 'Messages', sortValue: (c) => c.message_count, render: (c) => <span className="tabular-nums">{c.message_count}</span> },
            { key: 'mode', header: 'AI mode', render: (c) => <span className="text-xs text-muted">{c.ai_mode === 'openai' ? 'OpenAI' : 'Guided'}</span> },
            { key: 'last', header: 'Last message', sortValue: (c) => c.last_message_at ?? '', render: (c) => <span className="whitespace-nowrap text-muted">{fmtDate(c.last_message_at)}</span> },
          ]}
        />
      )}
      <Drawer open={Boolean(openId)} onClose={() => open(null)} title={detail.data?.customer?.full_name ?? 'Conversation'} wide>
        {!detail.data && <Loading />}
        {detail.data && (
          <div className="space-y-4">
            {detail.data.conversation.needs_attention && <Notice tone="warn">{detail.data.conversation.attention_reason}</Notice>}
            {can('conversations:write') && (
              <div className="flex flex-wrap gap-2">
                {detail.data.conversation.needs_attention && <Button variant="secondary" onClick={() => update({ needs_attention: false })}>Mark reviewed</Button>}
                {detail.data.conversation.status !== 'closed' && <Button variant="secondary" onClick={() => update({ status: 'closed', needs_attention: false })}>Close conversation</Button>}
                {detail.data.lead && <a className="inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium text-royal hover:bg-white" href={`/admin/leads?id=${detail.data.lead.id}`}>Open lead →</a>}
              </div>
            )}
            {detail.data.conversation.state?.human_takeover && (
              <Notice>
                A staff member is handling this conversation, so ASPARC AI is paused for it (emergency messages still get the 000 reply).
                {can('conversations:write') && (
                  <Button variant="secondary" size="sm" className="ml-3" onClick={() => update({ human_takeover: false })}>
                    Hand back to ASPARC AI
                  </Button>
                )}
              </Notice>
            )}
            {detail.data.conversation.state?.opted_out && <Notice tone="warn">This person sent STOP and has opted out of messages.</Notice>}
            <Panel>
              <Transcript messages={detail.data.messages} />
            </Panel>
            {can('conversations:write') && MESSAGING_CHANNELS.includes(detail.data.conversation.channel) && detail.data.conversation.status !== 'closed' && (
              <Panel>
                <label className="block text-sm font-medium" htmlFor="staff-reply">
                  Reply as ASPARC staff
                </label>
                <p className="mt-1 text-xs text-muted">
                  Sent to the customer on {CHANNEL_NAMES[detail.data.conversation.channel] ?? label(detail.data.conversation.channel)}. Replying pauses ASPARC AI for this conversation. You can only reply within 24 hours of their last message.
                </p>
                <textarea
                  id="staff-reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm"
                  placeholder="Write your reply…"
                />
                {replyError && <p className="mt-2 text-sm text-danger" role="alert">{replyError}</p>}
                <Button className="mt-3" disabled={sending || !draft.trim()} onClick={sendReply}>
                  {sending ? 'Sending…' : 'Send reply'}
                </Button>
              </Panel>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------ BOOKINGS */
interface BookingRow {
  id: string;
  service_name: string;
  preferred_days: string | null;
  preferred_times: string | null;
  notes: string | null;
  status: string;
  lead_id: string | null;
  created_at: string;
  customer: { full_name: string; email: string | null; phone: string | null; preferred_contact: string | null } | null;
}

export function BookingsSection({ can }: { can: Can }) {
  const { data, error, loading, reload } = useApi<{ bookings: BookingRow[] }>('/api/admin/bookings');
  const [status, setStatus] = useState('open');
  const { toast, toastNode } = useToast();
  const rows = useMemo(() => (data?.bookings ?? []).filter((b) => (status === 'open' ? ['requested', 'in_progress'].includes(b.status) : status ? b.status === status : true)), [data, status]);
  return (
    <>
      {toastNode}
      <PageHeader title="Bookings" description="Online bookings customers make themselves, and booking requests from the website and ASPARC AI." />
      <h2 className="mb-3 font-display text-xl font-bold uppercase">Online bookings</h2>
      <OnlineBookingPanel can={can} />
      <h2 className="mb-3 font-display text-xl font-bold uppercase">Booking requests</h2>
      <div className="mb-4">
        <Notice>
          <strong>Requests are not bookings.</strong> These came from the request form or ASPARC AI for services that are not booked online. Contact the client to arrange a time, then set the status to <em>Confirmed by staff</em>.
        </Notice>
      </div>
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <DataTable
          rows={rows}
          initialSort={{ key: 'created', dir: 'desc' }}
          search={(b) => `${b.customer?.full_name} ${b.customer?.email} ${b.service_name}`}
          filters={<Select label="Status" value={status} onChange={setStatus} options={[['open', 'Open requests'], ['', 'All'], ['confirmed_by_staff', 'Confirmed by staff'], ['declined', 'Declined'], ['cancelled', 'Cancelled']]} />}
          empty="No booking requests."
          columns={[
            { key: 'who', header: 'Client', render: (b) => <div><p className="font-medium">{b.customer?.full_name}</p><p className="text-xs text-muted">{b.customer?.email ?? b.customer?.phone} · prefers {label(b.customer?.preferred_contact)}</p></div> },
            { key: 'svc', header: 'Service', render: (b) => b.service_name },
            { key: 'pref', header: 'Preferred', render: (b) => <span className="text-muted">{[b.preferred_days, b.preferred_times].filter(Boolean).join(' · ') || '–'}</span> },
            { key: 'notes', header: 'Notes', render: (b) => <span className="line-clamp-2 max-w-xs text-xs text-muted">{b.notes ?? '–'}</span> },
            {
              key: 'status',
              header: 'Status',
              render: (b) =>
                can('bookings:write') ? (
                  <Select
                    label="Booking status"
                    value={b.status}
                    onChange={async (v) => {
                      await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body: { status: v } });
                      toast(v === 'confirmed_by_staff' ? 'Marked confirmed – lead set to Converted' : 'Status updated');
                      reload();
                    }}
                    options={[['requested', 'Requested'], ['in_progress', 'In progress'], ['confirmed_by_staff', 'Confirmed by staff'], ['declined', 'Declined'], ['cancelled', 'Cancelled']]}
                  />
                ) : (
                  <Badge>{label(b.status)}</Badge>
                ),
            },
            { key: 'created', header: 'Received', sortValue: (b) => b.created_at, render: (b) => <span className="whitespace-nowrap text-muted">{fmtDate(b.created_at)}</span> },
          ]}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ ACADEMY */
interface RegRow {
  id: string;
  athlete_first_name: string;
  athlete_last_name: string | null;
  athlete_age_group: string;
  club_or_school: string | null;
  program_term: string | null;
  status: string;
  payment_status: string;
  guardian_consent_at: string | null;
  created_at: string;
  customer: { full_name: string; email: string | null; phone: string | null } | null;
}

export function AcademySection({ can }: { can: Can }) {
  const { data, error, loading, reload } = useApi<{ registrations: RegRow[]; program: { name: string; price_cents: number | null; price_status: string; availability: string } | null }>('/api/admin/academy');
  const [group, setGroup] = useState('');
  const { toast, toastNode } = useToast();
  const regs = data?.registrations ?? [];
  const counts = ['8-10', '11-13', '14-16', '16-18'].map((g) => [g, regs.filter((r) => r.athlete_age_group === g && r.status !== 'withdrawn').length] as const);
  return (
    <>
      {toastNode}
      <PageHeader title="Academy Registrations" description="Parent/guardian registrations of interest for the Performance Academy." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {counts.map(([g, n]) => (
              <button key={g} type="button" onClick={() => setGroup(group === g ? '' : g)} className={`rounded-xl border p-4 text-left transition ${group === g ? 'border-royal bg-[#e8f0fa]' : 'border-line bg-white hover:border-royal'}`}>
                <p className="text-xs uppercase tracking-wider text-muted">{g} years</p>
                <p className="mt-1 font-display text-3xl font-bold">{n}</p>
              </button>
            ))}
            {data.program && (
              <div className="col-span-2 rounded-xl border border-line bg-white p-4 lg:col-span-1">
                <p className="text-xs uppercase tracking-wider text-muted">Program fee</p>
                <p className="mt-1 font-display text-3xl font-bold">{fmtMoney(data.program.price_cents)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.program.price_status === 'draft' && <Badge tone="amber">Draft price</Badge>}
                  {data.program.availability === 'pending_confirmation' && <Badge tone="sky">Dates TBC</Badge>}
                </div>
              </div>
            )}
          </div>
          <DataTable
            rows={group ? regs.filter((r) => r.athlete_age_group === group) : regs}
            initialSort={{ key: 'created', dir: 'desc' }}
            search={(r) => `${r.athlete_first_name} ${r.athlete_last_name ?? ''} ${r.customer?.full_name} ${r.customer?.email} ${r.club_or_school ?? ''}`}
            empty="No Academy registrations yet."
            columns={[
              { key: 'athlete', header: 'Athlete', sortValue: (r) => r.athlete_first_name, render: (r) => <div><p className="font-medium">{r.athlete_first_name} {r.athlete_last_name ?? ''}</p><p className="text-xs text-muted">{r.club_or_school ?? ''}</p></div> },
              { key: 'group', header: 'Age group', sortValue: (r) => r.athlete_age_group, render: (r) => r.athlete_age_group },
              { key: 'guardian', header: 'Parent/guardian', render: (r) => <div><p>{r.customer?.full_name}</p><p className="text-xs text-muted">{r.customer?.email ?? r.customer?.phone}</p></div> },
              { key: 'consent', header: 'Consent', render: (r) => <span className="text-xs text-success">✓ {fmtDate(r.guardian_consent_at, false)}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (r) =>
                  can('academy:write') ? (
                    <Select label="Registration status" value={r.status} onChange={async (v) => { await api(`/api/admin/academy/${r.id}`, { method: 'PATCH', body: { status: v } }); toast('Status updated'); reload(); }} options={[['registration_submitted', 'Submitted'], ['waitlist', 'Waitlist'], ['offered', 'Place offered'], ['enrolled', 'Enrolled'], ['withdrawn', 'Withdrawn']]} />
                  ) : (
                    <Badge>{label(r.status)}</Badge>
                  ),
              },
              { key: 'pay', header: 'Payment', render: (r) => <span className="text-xs text-muted">{r.payment_status === 'not_requested' ? 'Not requested' : label(r.payment_status)}</span> },
              { key: 'created', header: 'Received', sortValue: (r) => r.created_at, render: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.created_at)}</span> },
            ]}
          />
        </div>
      )}
    </>
  );
}
