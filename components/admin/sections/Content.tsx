'use client';

import { useState, type ReactNode } from 'react';
import { ApiError, api, fmtDate, fmtMoney, label, useApi } from '../api';
import { Badge, Button, Drawer, ErrorNote, Loading, Notice, PageHeader, Panel, useToast } from '../ui';

type Can = (p: string) => boolean;

interface KbItem {
  id: string;
  key: string;
  category: string;
  title: string;
  content: string;
  data: Record<string, unknown>;
  status: 'draft' | 'approved' | 'archived';
  is_public: boolean;
  updated_by: string | null;
  updated_at: string;
}

const CATS: [string, string, string][] = [
  ['business', 'Business information', 'Overview, location, contact details and founder – shown on the website and used by ASPARC AI.'],
  ['hours', 'Opening hours', 'Shown on the website once approved.'],
  ['faq', 'FAQs', 'Answers ASPARC AI gives. Keywords help guided mode match questions.'],
  ['policy', 'Policies', 'Bookings, payments, cancellations, medical and privacy statements.'],
  ['ai_rule', 'AI tone & style', 'How the assistant writes. Safety rules are fixed in code and cannot be weakened here.'],
  ['settings', 'Settings', 'Notification preferences.'],
];

const NOTIFY_TYPES: [string, string][] = [
  ['qualified_lead', 'New qualified leads'],
  ['academy_enquiry', 'Academy enquiries'],
  ['club_partnership', 'Club partnership enquiries'],
  ['complaint', 'Complaints'],
  ['unresolved_question', 'Unresolved AI questions'],
  ['booking_request', 'Booking requests'],
  ['payment_confirmation', 'Payment confirmations'],
  ['escalation', 'Escalated conversations'],
];

export function KnowledgeSection({ can }: { can: Can }) {
  const { data, error, loading, reload } = useApi<{ items: KbItem[] }>('/api/admin/knowledge');
  const [edit, setEdit] = useState<KbItem | 'new' | null>(null);
  const editable = can('kb:write');
  return (
    <>
      <PageHeader
        title="AI Knowledge Base"
        description="The single source of truth for the website and ASPARC AI. Only APPROVED items are presented as fact; drafts are treated as “being confirmed”."
        actions={editable && <Button onClick={() => setEdit('new')}>Add FAQ</Button>}
      />
      {!editable && <div className="mb-4"><Notice>You have read-only access. Managers and owners can edit the knowledge base.</Notice></div>}
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-6">
          {CATS.map(([cat, title, desc]) => {
            const items = data.items.filter((i) => i.category === cat);
            if (!items.length) return null;
            return (
              <Panel key={cat} title={<span>{title} <span className="ml-1 font-normal text-muted">· {desc}</span></span>} pad={false}>
                <ul className="divide-y divide-line">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => setEdit(i)} className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left hover:bg-mist">
                        <div className="min-w-0">
                          <p className="font-medium">{i.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-sm text-muted">{i.content || '—'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {!i.is_public && <Badge>Internal</Badge>}
                          <Badge tone={i.status === 'approved' ? 'green' : 'amber'}>{label(i.status)}</Badge>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
      {edit && <KbEditor item={edit === 'new' ? null : edit} editable={editable} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="field-label">{l}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function KbEditor({ item, editable, onClose, onSaved }: { item: KbItem | null; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [status, setStatus] = useState(item?.status ?? 'draft');
  const [isPublic, setIsPublic] = useState(item?.is_public ?? true);
  const [dataObj, setDataObj] = useState<Record<string, unknown>>(item?.data ?? { keywords: [] });
  const [key, setKey] = useState(item?.key ?? 'faq.');
  const [err, setErr] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  const setD = (k: string, v: unknown) => setDataObj((d) => ({ ...d, [k]: v }));

  async function save() {
    setErr(null);
    try {
      if (item) await api(`/api/admin/knowledge/${item.id}`, { method: 'PATCH', body: { title, content, status, is_public: isPublic, data: dataObj } });
      else await api('/api/admin/knowledge', { body: { key, category: 'faq', title, content, status, is_public: true, data: dataObj } });
      toast('Saved');
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError && e.fields ? Object.values(e.fields).join(' ') : e instanceof Error ? e.message : 'Save failed');
    }
  }

  const k = item?.key ?? '';
  const textFields: Record<string, [string, string][]> = {
    'business.contact': [['email', 'Public email'], ['phone', 'Public phone'], ['instagram_url', 'Instagram URL'], ['facebook_url', 'Facebook URL'], ['linkedin_url', 'LinkedIn URL']],
    'business.location': [['address', 'Street address (shown when approved)'], ['suburb', 'Suburb'], ['map_url', 'Map link']],
  };

  return (
    <Drawer open onClose={onClose} title={item ? item.title : 'New FAQ'}>
      {toastNode}
      <div className="space-y-4">
        {!item && (
          <Field label="Key" hint="Unique id, e.g. faq.parking">
            <input className="field" value={key} onChange={(e) => setKey(e.target.value)} disabled={!editable} />
          </Field>
        )}
        <Field label={item?.category === 'faq' || !item ? 'Question' : 'Title'}>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} maxLength={200} />
        </Field>
        {k !== 'settings.notifications' && (
          <Field label={item?.category === 'faq' || !item ? 'Answer' : 'Content'} hint="Write only confirmed facts. ASPARC AI will repeat this to the public.">
            <textarea className="field min-h-40" value={content} onChange={(e) => setContent(e.target.value)} disabled={!editable} maxLength={6000} />
          </Field>
        )}
        {textFields[k]?.map(([f, l]) => (
          <Field key={f} label={l}>
            <input className="field" value={String(dataObj[f] ?? '')} onChange={(e) => setD(f, e.target.value)} disabled={!editable} />
          </Field>
        ))}
        {(item?.category === 'faq' || !item) && (
          <Field label="Keywords (comma separated)" hint="Used by guided mode to match visitor questions.">
            <input className="field" value={((dataObj.keywords as string[]) ?? []).join(', ')} onChange={(e) => setD('keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} disabled={!editable} />
          </Field>
        )}
        {k === 'settings.notifications' && (
          <fieldset className="space-y-2">
            <legend className="field-label">Email these notifications to management</legend>
            {NOTIFY_TYPES.map(([t, l]) => {
              const set = new Set((dataObj.email_types as string[]) ?? []);
              return (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-royal" disabled={!editable} checked={set.has(t)} onChange={(e) => { e.target.checked ? set.add(t) : set.delete(t); setD('email_types', [...set]); }} />
                  {l}
                </label>
              );
            })}
            <label className="flex items-center gap-2 pt-2 text-sm">
              <input type="checkbox" className="accent-royal" disabled={!editable} checked={Boolean(dataObj.daily_summary_email)} onChange={(e) => setD('daily_summary_email', e.target.checked)} />
              Email the daily summary (Melbourne time)
            </label>
            <p className="text-xs text-muted">Emails send via Resend once configured. All notifications always appear in the dashboard.</p>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-4">
          <Field label="Status">
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as KbItem['status'])} disabled={!editable}>
              <option value="draft">Draft – not yet confirmed</option>
              <option value="approved">Approved – publish as fact</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          {item && item.category !== 'settings' && item.category !== 'ai_rule' && (
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-royal" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={!editable} /> Public
            </label>
          )}
        </div>
        {item && <p className="text-xs text-muted">Last updated {fmtDate(item.updated_at)} by {item.updated_by ?? 'system'}</p>}
        {err && <ErrorNote message={err} />}
        {editable && (
          <div className="flex gap-2 pt-2">
            <Button onClick={save}>Save</Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------ PRICING */
interface Svc {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string;
  duration_minutes: number | null;
  price_cents: number | null;
  price_unit: string | null;
  price_status: 'draft' | 'approved' | 'on_enquiry';
  availability: 'available' | 'pending_confirmation' | 'unavailable';
  bookable: boolean;
  payment_link_url: string | null;
  is_public: boolean;
  sort_order: number;
}

export function PricingSection({ can }: { can: Can }) {
  const { data, error, loading, reload } = useApi<{ services: Svc[] }>('/api/admin/services');
  const [edit, setEdit] = useState<Svc | null>(null);
  const editable = can('services:write');
  const cats = ['performance', 'academy', 'rehabilitation', 'recovery', 'testing'];
  return (
    <>
      <PageHeader title="Pricing & Services" description="Prices and availability shown on the website and quoted by ASPARC AI. Draft prices are always labelled “subject to confirmation”; the AI cannot quote any price not listed here." />
      {error && <ErrorNote message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-6">
          {cats.map((c) => (
            <Panel key={c} title={label(c)} pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th className="px-5 py-2.5 font-medium">Service</th>
                      <th className="px-5 py-2.5 font-medium">Price</th>
                      <th className="px-5 py-2.5 font-medium">Pricing status</th>
                      <th className="px-5 py-2.5 font-medium">Availability</th>
                      <th className="px-5 py-2.5 font-medium">Payment link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.filter((s) => s.category === c).map((s) => (
                      <tr key={s.id} onClick={() => setEdit(s)} className="cursor-pointer border-b border-line last:border-0 hover:bg-mist">
                        <td className="px-5 py-3"><p className="font-medium">{s.name}</p>{!s.is_public && <Badge className="mt-1">Hidden</Badge>}</td>
                        <td className="px-5 py-3 tabular-nums">{s.price_status === 'on_enquiry' ? <span className="text-muted">On enquiry</span> : `${fmtMoney(s.price_cents)} ${s.price_unit ?? ''}`}</td>
                        <td className="px-5 py-3"><Badge tone={s.price_status === 'approved' ? 'green' : s.price_status === 'draft' ? 'amber' : 'neutral'}>{s.price_status === 'on_enquiry' ? 'On enquiry' : label(s.price_status)}</Badge></td>
                        <td className="px-5 py-3"><Badge tone={s.availability === 'available' ? 'green' : s.availability === 'pending_confirmation' ? 'sky' : 'neutral'}>{label(s.availability)}</Badge></td>
                        <td className="px-5 py-3 text-xs text-muted">{s.payment_link_url ? 'Set' : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}
      {edit && <ServiceEditor svc={edit} editable={editable} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function ServiceEditor({ svc, editable, onClose, onSaved }: { svc: Svc; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(svc);
  const [price, setPrice] = useState(svc.price_cents == null ? '' : String(svc.price_cents / 100));
  const [err, setErr] = useState<string | null>(null);
  const up = <K extends keyof Svc>(k: K, v: Svc[K]) => setS((x) => ({ ...x, [k]: v }));
  async function save() {
    setErr(null);
    try {
      const cents = price.trim() === '' ? null : Math.round(Number(price) * 100);
      if (cents !== null && Number.isNaN(cents)) throw new Error('Price must be a number');
      await api(`/api/admin/services/${svc.id}`, {
        method: 'PATCH',
        body: { name: s.name, summary: s.summary, duration_minutes: s.duration_minutes, price_cents: cents, price_unit: s.price_unit || null, price_status: s.price_status, availability: s.availability, bookable: s.bookable, payment_link_url: s.payment_link_url || null, is_public: s.is_public },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError && e.fields ? Object.values(e.fields).join(' ') + ` (${e.message})` : e instanceof Error ? e.message : 'Save failed');
    }
  }
  return (
    <Drawer open onClose={onClose} title={svc.name}>
      <div className="space-y-4">
        {!editable && <Notice>Read-only. Managers and owners can change pricing.</Notice>}
        <Field label="Name"><input className="field" value={s.name} onChange={(e) => up('name', e.target.value)} disabled={!editable} /></Field>
        <Field label="Summary"><textarea className="field min-h-24" value={s.summary} onChange={(e) => up('summary', e.target.value)} disabled={!editable} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (AUD)"><input className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!editable} placeholder="e.g. 380" /></Field>
          <Field label="Price unit"><input className="field" value={s.price_unit ?? ''} onChange={(e) => up('price_unit', e.target.value)} disabled={!editable} placeholder="per session" /></Field>
        </div>
        <Field label="Pricing status" hint="Only approved prices are quoted without a “subject to confirmation” label.">
          <select className="field" value={s.price_status} onChange={(e) => up('price_status', e.target.value as Svc['price_status'])} disabled={!editable}>
            <option value="on_enquiry">Pricing on enquiry (no price shown)</option>
            <option value="draft">Draft – show with “subject to confirmation”</option>
            <option value="approved">Approved</option>
          </select>
        </Field>
        <Field label="Availability" hint="Testing equipment and practitioners should stay “pending” until confirmed.">
          <select className="field" value={s.availability} onChange={(e) => up('availability', e.target.value as Svc['availability'])} disabled={!editable}>
            <option value="available">Available</option>
            <option value="pending_confirmation">Pending confirmation</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (minutes)"><input className="field" inputMode="numeric" value={s.duration_minutes ?? ''} onChange={(e) => up('duration_minutes', e.target.value ? Number(e.target.value) : null)} disabled={!editable} /></Field>
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-royal" checked={s.is_public} onChange={(e) => up('is_public', e.target.checked)} disabled={!editable} /> Show on website</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-royal" checked={s.bookable} onChange={(e) => up('bookable', e.target.checked)} disabled={!editable} /> Accept booking requests</label>
          </div>
        </div>
        <Field label="Secure payment link (Phase 4)" hint="A Stripe Payment Link (https://buy.stripe.com/…). Allowed only on approved prices. ASPARC AI shares it; it never takes card details.">
          <input className="field" value={s.payment_link_url ?? ''} onChange={(e) => up('payment_link_url', e.target.value)} disabled={!editable} placeholder="https://" />
        </Field>
        {err && <ErrorNote message={err} />}
        {editable && <div className="flex gap-2"><Button onClick={save}>Save</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>}
      </div>
    </Drawer>
  );
}
