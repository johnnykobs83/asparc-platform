'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { api, fmtDate, useApi } from '../api';
import { Badge, Button, DataTable, Drawer, ErrorNote, Loading, Notice, PageHeader, Panel, StatCard, useToast, type Column } from '../ui';

type State = 'active' | 'invited' | 'link_expired' | 'switched_off';
interface Member {
  id: string;
  email: string;
  full_name: string;
  club: string | null;
  team: string | null;
  is_guardian: boolean;
  athlete_name: string | null;
  access_hub: boolean;
  access_warmup: boolean;
  access_downloads: boolean;
  active: boolean;
  password_set_at: string | null;
  invite_expires_at: string | null;
  invited_at: string | null;
  invited_by: string | null;
  last_login_at: string | null;
  login_count: number;
  notes: string | null;
  created_at: string;
  state: State;
}
interface Download { file: string; kind: 'poster' | 'social' | 'pack'; label: string; topic: number | null }
interface Data {
  ready: boolean;
  members: Member[];
  pages: { slug: string; title: string; blurb: string }[];
  downloads: Download[];
  email_configured: boolean;
}
type LinkResult = { link: string; email: 'sent' | 'not_configured' | 'failed' | 'not_requested'; expires_at: string; kind?: 'invite' | 'reset' };

const STATE: Record<State, [string, 'green' | 'blue' | 'amber' | 'neutral']> = {
  active: ['Active', 'green'],
  invited: ['Invited', 'blue'],
  link_expired: ['Invite expired', 'amber'],
  switched_off: ['Switched off', 'neutral'],
};
const ACCESS: [keyof Pick<Member, 'access_hub' | 'access_warmup' | 'access_downloads'>, string][] = [
  ['access_hub', 'Hub'],
  ['access_warmup', 'Warm-Up'],
  ['access_downloads', 'Downloads'],
];

/** Members area: who can sign in to /members, their access, and the resources themselves. */
export function MembersSection({ can }: { can: (p: string) => boolean }) {
  const data = useApi<Data>('/api/admin/members');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [link, setLink] = useState<(LinkResult & { name: string }) | null>(null);
  const { toast, toastNode } = useToast();
  const manage = can('members:manage');

  const members = useMemo(() => data.data?.members ?? [], [data.data]);
  const open = members.find((m) => m.id === openId) ?? null;

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  const d = data.data!;

  const count = (s: State) => members.filter((m) => m.state === s).length;

  const cols: Column<Member>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (m) => (
        <span>
          <span className="font-medium">{m.full_name}</span>
          <span className="block text-xs text-muted">{m.is_guardian && m.athlete_name ? `Parent/guardian of ${m.athlete_name}` : m.email}</span>
        </span>
      ),
      sortValue: (m) => m.full_name.toLowerCase(),
    },
    { key: 'club', header: 'Club / team', render: (m) => [m.club, m.team].filter(Boolean).join(' · ') || '–', sortValue: (m) => `${m.club ?? ''} ${m.team ?? ''}`.toLowerCase() },
    {
      key: 'access',
      header: 'Access',
      render: (m) => (
        <span className="flex flex-wrap gap-1">
          {ACCESS.filter(([k]) => m[k]).map(([k, l]) => <Badge key={k} tone="sky">{l}</Badge>)}
          {!ACCESS.some(([k]) => m[k]) && <span className="text-xs text-muted">None</span>}
        </span>
      ),
    },
    { key: 'state', header: 'Status', render: (m) => <Badge tone={STATE[m.state][1]}>{STATE[m.state][0]}</Badge>, sortValue: (m) => m.state },
    { key: 'last', header: 'Last sign-in', render: (m) => fmtDate(m.last_login_at), sortValue: (m) => m.last_login_at ?? '' },
  ];

  async function sendLink(m: Member, sendEmail: boolean) {
    try {
      const r = await api<LinkResult>(`/api/admin/members/${m.id}/link`, { body: { send_email: sendEmail } });
      setLink({ ...r, name: m.full_name });
      await data.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
  }

  return (
    <div className="space-y-6">
      {toastNode}
      <PageHeader
        title="Members & Resources"
        description="Players, parents and coaches who can sign in to the Members area on the website, and the Training & Health resources they get."
        actions={manage ? <Button onClick={() => setAdding(true)}>Add member</Button> : undefined}
      />

      {!d.ready && (
        <Notice tone="warn">
          The members table isn&apos;t in the database yet. Run <code>supabase/migrations/20261128000014_members.sql</code> in the Supabase SQL Editor, then reload this page.
        </Notice>
      )}
      {d.ready && !d.email_configured && (
        <Notice>Email isn&apos;t set up, so invites aren&apos;t emailed. After you add someone, copy their link and send it to them yourself (text or email).</Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value={count('active')} hint="Have set a password" />
        <StatCard label="Invited" value={count('invited')} hint="Waiting for them to set a password" />
        <StatCard label="Invite expired" value={count('link_expired')} hint="Send a new link" tone={count('link_expired') ? 'attention' : 'default'} />
        <StatCard label="Switched off" value={count('switched_off')} tone="muted" />
      </div>

      <DataTable
        rows={members}
        columns={cols}
        search={(m) => `${m.full_name} ${m.email} ${m.club ?? ''} ${m.team ?? ''} ${m.athlete_name ?? ''}`}
        onRowClick={(m) => setOpenId(m.id)}
        initialSort={{ key: 'name', dir: 'asc' }}
        empty={<div className="p-6 text-sm text-muted">No members yet.{manage ? ' Use "Add member" to invite the first person.' : ''}</div>}
      />

      <ResourcesPanel d={d} />

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add member">
        <MemberForm
          emailConfigured={d.email_configured}
          onCancel={() => setAdding(false)}
          onSaved={async (r) => {
            setAdding(false);
            setLink(r);
            await data.reload();
          }}
        />
      </Drawer>

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.full_name ?? ''}>
        {open && (
          <MemberDetail
            m={open}
            manage={manage}
            canDelete={can('data:delete')}
            emailConfigured={d.email_configured}
            onLink={(sendEmail) => sendLink(open, sendEmail)}
            onChanged={async (msg) => {
              toast(msg);
              await data.reload();
            }}
            onDeleted={async () => {
              setOpenId(null);
              toast('Member deleted');
              await data.reload();
            }}
            onError={(msg) => toast(msg, 'err')}
          />
        )}
      </Drawer>

      <Drawer open={!!link} onClose={() => setLink(null)} title={link?.kind === 'reset' ? 'Password reset link' : 'Invite link'}>
        {link && <LinkPanel r={link} />}
      </Drawer>
    </div>
  );
}

function LinkPanel({ r }: { r: LinkResult & { name: string } }) {
  const [copied, setCopied] = useState(false);
  const msg =
    r.email === 'sent'
      ? `Emailed to ${r.name}.`
      : r.email === 'failed'
        ? "The email didn't send. Copy the link and send it yourself."
        : r.email === 'not_configured'
          ? "Email isn't set up. Copy the link and send it yourself."
          : 'Copy the link and send it yourself.';
  return (
    <div className="space-y-4">
      <Notice tone={r.email === 'failed' ? 'warn' : 'info'}>{msg}</Notice>
      <div>
        <label htmlFor="member-link" className="field-label">One-time link for {r.name}</label>
        <textarea id="member-link" readOnly value={r.link} rows={4} className="field font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <p className="mt-1.5 text-xs text-muted">Works once. Expires {fmtDate(r.expires_at)}. Making a new link cancels this one.</p>
      </div>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(r.link);
            setCopied(true);
          } catch {
            (document.getElementById('member-link') as HTMLTextAreaElement | null)?.select();
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

function Fields({ m, errors }: { m?: Member; errors: Record<string, string> }) {
  const [guardian, setGuardian] = useState(m?.is_guardian ?? false);
  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-medium text-danger">{errors[k]}</p> : null);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="mf-name" className="field-label">Full name</label>
        <input id="mf-name" name="full_name" required defaultValue={m?.full_name} className="field" />
        {err('full_name')}
      </div>
      <div>
        <label htmlFor="mf-email" className="field-label">Email</label>
        <input id="mf-email" name="email" type="email" required defaultValue={m?.email} className="field" />
        {err('email')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mf-club" className="field-label">Club (optional)</label>
          <input id="mf-club" name="club" defaultValue={m?.club ?? ''} className="field" />
        </div>
        <div>
          <label htmlFor="mf-team" className="field-label">Team (optional)</label>
          <input id="mf-team" name="team" defaultValue={m?.team ?? ''} placeholder="e.g. U15 NPL Boys" className="field" />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="is_guardian" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1" />
        <span>Parent or guardian account for an under-18 player</span>
      </label>
      {guardian && (
        <div>
          <label htmlFor="mf-athlete" className="field-label">Player&apos;s name</label>
          <input id="mf-athlete" name="athlete_name" defaultValue={m?.athlete_name ?? ''} className="field" />
          {err('athlete_name')}
        </div>
      )}
      <fieldset>
        <legend className="field-label">Access</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="access_hub" defaultChecked={m?.access_hub ?? true} /> Training &amp; Health Hub</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="access_warmup" defaultChecked={m?.access_warmup ?? true} /> ASPARC Warm-Up</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="access_downloads" defaultChecked={m?.access_downloads ?? true} /> Poster downloads</label>
        </div>
      </fieldset>
      <div>
        <label htmlFor="mf-notes" className="field-label">Staff notes (optional)</label>
        <textarea id="mf-notes" name="notes" rows={2} defaultValue={m?.notes ?? ''} className="field" />
      </div>
    </div>
  );
}

function readFields(form: HTMLFormElement) {
  const fd = new FormData(form);
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const guardian = fd.get('is_guardian') === 'on';
  return {
    full_name: s('full_name'),
    email: s('email'),
    club: s('club') || null,
    team: s('team') || null,
    is_guardian: guardian,
    athlete_name: guardian ? s('athlete_name') || null : null,
    access_hub: fd.get('access_hub') === 'on',
    access_warmup: fd.get('access_warmup') === 'on',
    access_downloads: fd.get('access_downloads') === 'on',
    notes: s('notes') || null,
  };
}

function MemberForm({ emailConfigured, onCancel, onSaved }: { emailConfigured: boolean; onCancel: () => void; onSaved: (r: LinkResult & { name: string }) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { ...readFields(e.currentTarget), send_email: new FormData(e.currentTarget).get('send_email') === 'on' };
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const r = await api<LinkResult & { member: Member }>('/api/admin/members', { body });
      onSaved({ ...r, kind: 'invite', name: r.member.full_name });
    } catch (err) {
      const fields = (err as { fields?: Record<string, string> }).fields;
      if (fields) setErrors(fields);
      setFormError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-muted">They&apos;ll get a one-time link to set their own password. You never see or choose it.</p>
      <Fields errors={errors} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="send_email" defaultChecked={emailConfigured} disabled={!emailConfigured} className="mt-1" />
        <span>Email the invite now{emailConfigured ? '' : ' (email isn’t set up: you’ll get a link to copy)'}</span>
      </label>
      {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add and invite'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function MemberDetail({
  m, manage, canDelete, emailConfigured, onLink, onChanged, onDeleted, onError,
}: {
  m: Member; manage: boolean; canDelete: boolean; emailConfigured: boolean;
  onLink: (sendEmail: boolean) => void; onChanged: (msg: string) => void; onDeleted: () => void; onError: (msg: string) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await api(`/api/admin/members/${m.id}`, { method: 'PATCH', body });
      onChanged(msg);
    } catch (err) {
      const fields = (err as { fields?: Record<string, string> }).fields;
      if (fields) setErrors(fields);
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const linkLabel = m.password_set_at ? 'password reset' : 'invite';
  return (
    <div className="space-y-6">
      <Panel>
        <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Status</dt><dd><Badge tone={STATE[m.state][1]}>{STATE[m.state][0]}</Badge></dd>
          <dt className="text-muted">Email</dt><dd className="break-all">{m.email}</dd>
          <dt className="text-muted">Invited</dt><dd>{fmtDate(m.invited_at)}{m.invited_by ? ` by ${m.invited_by}` : ''}</dd>
          <dt className="text-muted">Password set</dt><dd>{fmtDate(m.password_set_at)}</dd>
          <dt className="text-muted">Last sign-in</dt><dd>{fmtDate(m.last_login_at)}{m.login_count ? ` · ${m.login_count} sign-in${m.login_count === 1 ? '' : 's'}` : ''}</dd>
        </dl>
      </Panel>

      {manage && m.active && (
        <Panel title={m.password_set_at ? 'Password' : 'Invite'}>
          <p className="mb-3 text-sm text-muted">
            {m.password_set_at
              ? 'Send them a link to choose a new password. It works once, for 24 hours, and signs them out everywhere when used.'
              : m.state === 'link_expired'
                ? 'Their invite expired. Send a new one (valid 14 days).'
                : 'Send the invite again. The new link replaces the old one.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {emailConfigured && <Button size="sm" disabled={busy} onClick={() => onLink(true)}>Email a {linkLabel} link</Button>}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onLink(false)}>Get a {linkLabel} link to copy</Button>
          </div>
        </Panel>
      )}

      {manage ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            void patch(readFields(e.currentTarget), 'Member saved');
          }}
          className="space-y-5"
        >
          <Fields m={m} errors={errors} />
          <Button type="submit" disabled={busy}>Save changes</Button>
        </form>
      ) : (
        <Notice>Only owners and managers can change members.</Notice>
      )}

      {manage && (
        <Panel title="Access">
          {m.active ? (
            <>
              <p className="mb-3 text-sm text-muted">Switching them off ends their access straight away and cancels any unused link. You can switch them back on later.</p>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void patch({ active: false }, `${m.full_name} switched off`)}>Switch off</Button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Switched off. Switch them back on, then send a new link if they need one.</p>
              <Button size="sm" disabled={busy} onClick={() => void patch({ active: true }, `${m.full_name} switched back on`)}>Switch back on</Button>
            </>
          )}
          {canDelete && (
            <div className="mt-5 border-t border-line pt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Delete {m.full_name} permanently?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api(`/api/admin/members/${m.id}`, { method: 'DELETE' });
                        onDeleted();
                      } catch (err) {
                        onError(err instanceof Error ? err.message : String(err));
                        setBusy(false);
                      }
                    }}
                  >
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>Delete member…</Button>
              )}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function ResourcesPanel({ d }: { d: Data }) {
  const pack = d.downloads.find((x) => x.kind === 'pack');
  const topics = d.downloads.filter((x) => x.kind === 'poster');
  const href = (file: string, inline = false) => `/members/download/${encodeURIComponent(file)}${inline ? '?view=1' : ''}`;
  return (
    <Panel
      title="Resources"
      actions={pack ? <a href={href(pack.file)} className="text-sm font-semibold text-royal hover:underline">Download all posters</a> : undefined}
    >
      <p className="mb-4 text-sm text-muted">What members see. Open a page to preview it as staff, or download posters and social images for your own clubs and socials.</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {d.pages.map((p) => (
          <a key={p.slug} href={`/members/${p.slug}`} target="_blank" rel="noopener" className="rounded-lg border border-line p-4 hover:border-royal">
            <span className="block font-semibold">{p.title} ↗</span>
            <span className="mt-1 block text-xs text-muted">{p.blurb}</span>
          </a>
        ))}
      </div>
      <ul className="divide-y divide-line text-sm">
        {topics.map((t) => {
          const social = d.downloads.find((x) => x.kind === 'social' && x.topic === t.topic);
          return (
            <li key={t.file} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{String(t.topic).padStart(2, '0')} · {t.label.replace(' poster (A3 PDF)', '')}</span>
              <span className="flex gap-4 font-semibold">
                <a href={href(t.file, true)} target="_blank" rel="noopener" className="text-muted hover:underline">Preview</a>
                <a href={href(t.file)} className="text-royal hover:underline">Poster PDF</a>
                {social && <a href={href(social.file)} className="text-royal hover:underline">Social PNG</a>}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
