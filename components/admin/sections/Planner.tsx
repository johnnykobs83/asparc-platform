'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, getParam, setParam, useApi } from '../api';
import { Badge, Button, Drawer, Empty, ErrorNote, Loading, Notice, PageHeader, Panel, cx, useToast } from '../ui';

// ------------------------------------------------------------------ types (mirror lib/planner/service.ts)
interface Assignment {
  id: string;
  staff_id: string;
  covering_for_staff_id: string | null;
  cover_reason: string | null;
  acknowledged_at: string | null;
}
interface Issue {
  staff_id: string;
  kind: 'overlap' | 'leave' | 'travel';
  message: string;
}
export interface Job {
  id: string;
  title: string;
  job_type: string;
  location_id: string;
  client_id: string | null;
  starts_at: string;
  ends_at: string;
  date: string;
  start_minutes: number;
  end_minutes: number;
  notes: string | null;
  series_id?: string | null;
  assignments: Assignment[];
  issues: Issue[];
}
interface Staff {
  id: string;
  full_name: string;
  role_title: string | null;
  employment_type: 'employee' | 'contractor';
  active: boolean;
  email?: string | null;
  phone?: string | null;
  admin_user_id?: string | null;
  calendar_url?: string;
}
interface Location {
  id: string;
  name: string;
  kind: string;
  address: string | null;
  access_notes: string | null;
  colour: string;
  client_id: string | null;
  active: boolean;
}
interface Leave {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}
interface Week {
  ready: boolean;
  can_plan: boolean;
  week_start: string;
  days: string[];
  published_at: string | null;
  pending_staff_ids: string[];
  pending_changes: number;
  staff: Staff[];
  locations: Location[];
  leave: Leave[];
  jobs: Job[];
  clients: { id: string; name: string }[];
  travel_buffer_minutes: number;
}

export const JOB_TYPES: [string, string][] = [
  ['club_session', 'Club session'],
  ['testing', 'Testing'],
  ['academy', 'Academy'],
  ['one_to_one', '1:1 sessions'],
  ['massage_clinic', 'Massage clinic'],
  ['match_day', 'Match day'],
  ['admin', 'Admin'],
  ['other', 'Other'],
];
const LOCATION_KINDS: [string, string][] = [
  ['asparc', 'ASPARC venue'],
  ['club', 'Club ground'],
  ['school', 'School'],
  ['client_site', 'Client site'],
  ['other', 'Other'],
];
const LEAVE_LABEL: Record<string, string> = { leave: 'On leave', unavailable: 'Unavailable', sick: 'Off sick', other: 'Away' };
const SWATCHES = ['#14519C', '#0E8C7F', '#D9822B', '#C2185B', '#6A4FB6', '#2E7D32', '#5D6D7E', '#B8860B'];

// ------------------------------------------------------------------ date helpers (Melbourne dates as YYYY-MM-DD)
const TZ = 'Australia/Melbourne';
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const addDays = (ymd: string, n: number) => new Date(asDate(ymd).getTime() + n * 86400000).toISOString().slice(0, 10);
export const mondayOf = (ymd: string) => addDays(ymd, -((asDate(ymd).getUTCDay() + 6) % 7));
export const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
const rangeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
export const dayLabel = (ymd: string, long = false) => (long ? longDayFmt : dayFmt).format(asDate(ymd));
export const clock = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}${m % 1440 < 720 ? 'am' : 'pm'}`;
/** "6:30–8am", "11am–1:30pm": short enough for a job card. */
export const span = (a: number, b: number) => {
  const t = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}`;
  const ap = (m: number) => (m % 1440 < 720 ? 'am' : 'pm');
  return ap(a) === ap(b) ? `${t(a)}–${t(b)}${ap(b)}` : `${t(a)}${ap(a)}–${t(b)}${ap(b)}`;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};
const sentFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
/** Location colour as a soft background (8-digit hex). */
const tint = (hex: string, alpha = '1f') => (/^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alpha}` : '#14519C1f');

function useWeekParam(): [string, (w: string) => void] {
  const [week, setWeek] = useState(() => mondayOf(todayYmd()));
  useEffect(() => {
    const w = getParam('week');
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) setWeek(mondayOf(w));
  }, []);
  return [
    week,
    (w: string) => {
      const m = mondayOf(w);
      setWeek(m);
      setParam('week', m === mondayOf(todayYmd()) ? null : m);
    },
  ];
}

/** Re-fetches every 20 s while the tab is visible (and straight away when it comes back), so everyone sees changes. */
function usePolling(reload: () => Promise<void> | void, paused: boolean) {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    if (paused) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      await ref.current();
      setLastSync(new Date());
    };
    const id = window.setInterval(tick, 20000);
    const onVis = () => void tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [paused]);
  return lastSync;
}

function WeekNav({ week, onChange }: { week: string; onChange: (w: string) => void }) {
  const thisWeek = mondayOf(todayYmd());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => onChange(addDays(week, -7))} aria-label="Previous week">← Prev</Button>
      <span className="min-w-[180px] text-center text-sm font-semibold">{rangeFmt.format(asDate(week))} – {rangeFmt.format(asDate(addDays(week, 6)))}</span>
      <Button size="sm" variant="secondary" onClick={() => onChange(addDays(week, 7))} aria-label="Next week">Next →</Button>
      {week !== thisWeek && <Button size="sm" variant="ghost" onClick={() => onChange(thisWeek)}>This week</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ the Staff Planner section
type Tab = 'week' | 'calendar' | 'people';

export function PlannerSection({ can }: { can: (p: string) => boolean }) {
  const [week, setWeek] = useWeekParam();
  const [tab, setTab] = useState<Tab>('week');
  const [rows, setRows] = useState<'staff' | 'location'>('staff');
  const [editing, setEditing] = useState<{ job: Partial<Job> & { date: string }; isNew: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const data = useApi<Week>(`/api/admin/planner/week?week=${week}`);
  const { toast, toastNode } = useToast();
  const lastSync = usePolling(async () => {
    try {
      data.setData(await api<Week>(`/api/admin/planner/week?week=${week}`));
    } catch {
      /* keep showing the last good copy */
    }
  }, Boolean(editing) || publishing);
  const plan = can('planner:write');

  useEffect(() => {
    const t = getParam('tab');
    if (t === 'calendar' || t === 'people') setTab(t);
  }, []);

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  const w = data.data!;
  if (!w.ready) return <Notice tone="warn">The staff planner tables aren&apos;t in the database yet. Apply <code>supabase/migrations/20261125000007_staff_planner_billing.sql</code> in Supabase, then reload.</Notice>;

  const staffName = (id: string | null) => w.staff.find((s) => s.id === id)?.full_name ?? 'Unknown';
  const loc = (id: string) => w.locations.find((l) => l.id === id);

  async function move(job: Job, date: string, from: string | null, toRow: string) {
    const body: Record<string, unknown> = { date };
    if (rows === 'staff' && from && toRow !== from) {
      if (job.assignments.some((a) => a.staff_id === toRow)) return toast(`${staffName(toRow)} is already on this job`, 'err');
      body.staff = job.assignments.map((a) => (a.staff_id === from ? { staff_id: toRow, covering_for_staff_id: null, cover_reason: null } : { staff_id: a.staff_id, covering_for_staff_id: a.covering_for_staff_id, cover_reason: a.cover_reason }));
    }
    if (rows === 'location' && toRow !== job.location_id) body.location_id = toRow;
    if (body.date === job.date && !body.staff && !body.location_id) return;
    try {
      await api(`/api/admin/planner/jobs/${job.id}`, { method: 'PATCH', body });
      await data.reload();
      toast('Moved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not move the job', 'err');
    }
  }

  async function copyLastWeek() {
    try {
      const r = await api<{ copied: number }>('/api/admin/planner/copy', { body: { from: addDays(week, -7), to: week } });
      await data.reload();
      toast(`Copied ${r.copied} job${r.copied === 1 ? '' : 's'} from last week. Covers were reset – check before sending.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not copy', 'err');
    }
  }

  const status = !w.jobs.length || !plan ? null : w.published_at ? (
    w.pending_staff_ids.length ? <Badge tone="amber">{w.pending_staff_ids.length} staff not told about changes</Badge> : <Badge tone="green">Sent {sentFmt.format(new Date(w.published_at))}</Badge>
  ) : (
    <Badge>Draft – not sent to staff</Badge>
  );

  return (
    <>
      <PageHeader
        title="Staff Planner"
        description={plan ? 'Who is working where, each day. Publish the week to email everyone their jobs; after that, only the people affected by a change get an update.' : 'Who is working where this week. Your own jobs are under My Week.'}
        actions={
          plan && w.jobs.length > 0 && (!w.published_at || w.pending_staff_ids.length > 0) ? (
            <Button onClick={() => setPublishing(true)}>{w.published_at ? `Send updates (${w.pending_staff_ids.length})` : 'Publish & email staff'}</Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <WeekNav week={week} onChange={setWeek} />
        <div className="flex flex-wrap items-center gap-2">
          {status}
          <div className="inline-flex overflow-hidden rounded-md border border-line bg-white" role="tablist" aria-label="Planner view">
            {(
              [
                ['week', 'Week planner'],
                ['calendar', 'Calendar'],
                ...(plan ? [['people', 'Staff & places']] : []),
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => {
                  setTab(k);
                  setParam('tab', k === 'week' ? null : k);
                }}
                className={cx('px-3 py-1.5 text-sm font-medium', tab === k ? 'bg-royal text-white' : 'text-muted hover:text-charcoal')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'people' && plan ? (
        <PeopleAndPlaces week={w} reload={data.reload} toast={toast} />
      ) : !w.staff.length || !w.locations.length ? (
        <Empty title="Add your staff and places first">
          {plan ? (
            <>
              The planner needs at least one staff member and one location.{' '}
              <button type="button" className="font-semibold text-royal underline" onClick={() => setTab('people')}>Open Staff &amp; places</button>
            </>
          ) : (
            'Nothing has been planned yet.'
          )}
        </Empty>
      ) : tab === 'calendar' ? (
        <CalendarView week={w} onOpen={(j) => setEditing({ job: j, isNew: false })} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <div className="inline-flex overflow-hidden rounded-md border border-line bg-white">
              {(['staff', 'location'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRows(r)} className={cx('px-2.5 py-1 font-medium', rows === r ? 'bg-charcoal text-white' : 'hover:text-charcoal')}>
                  {r === 'staff' ? 'By staff' : 'By location'}
                </button>
              ))}
            </div>
            {w.locations.filter((l) => l.active).map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.colour }} />
                {l.name}
              </span>
            ))}
          </div>
          {!w.jobs.length && plan && (
            <div className="mb-3">
              <Notice>
                Nothing planned this week yet. Click <strong>+</strong> in a day to add a job
                {', or '}
                <button type="button" className="font-semibold underline" onClick={copyLastWeek}>copy last week</button> as a starting point.
              </Notice>
            </div>
          )}
          <WeekGrid
            week={w}
            rows={rows}
            plan={plan}
            onOpen={(j) => setEditing({ job: j, isNew: false })}
            onAdd={(date, rowId) => setEditing({ isNew: true, job: { date, start_minutes: 540, end_minutes: 600, title: '', job_type: 'club_session', location_id: rows === 'location' ? rowId : (w.locations.find((l) => l.active)?.id ?? ''), notes: null, client_id: null, assignments: rows === 'staff' ? [{ id: '', staff_id: rowId, covering_for_staff_id: null, cover_reason: null, acknowledged_at: null }] : [], issues: [] } })}
            onMove={move}
          />
          <p className="mt-2 text-xs text-muted">
            {plan ? 'Drag a job to another person, place or day, or click it to edit, change people or arrange cover. ' : 'Click a job for its details. '}
            A red ! means a double booking, leave, or under {w.travel_buffer_minutes} min to travel between venues. ↻ means a repeating job. A tick means the person has confirmed.
            {lastSync ? ` Updated ${sentFmt.format(lastSync).split(', ').pop()}.` : ''}
          </p>
        </>
      )}

      {editing && (plan ? (
        <JobDrawer week={w} initial={editing.job} isNew={editing.isNew} onClose={() => setEditing(null)} onSaved={async (msg) => { setEditing(null); await data.reload(); toast(msg); }} />
      ) : (
        <JobDetails week={w} job={editing.job as Job} onClose={() => setEditing(null)} />
      ))}
      {publishing && <PublishDrawer week={w} onClose={() => setPublishing(false)} onDone={async (msg, tone) => { setPublishing(false); await data.reload(); toast(msg, tone); }} />}
      {toastNode}
    </>
  );
}

// ------------------------------------------------------------------ week grid
function JobChip({ job, week, staffId, plan, onOpen, onDragStart }: { job: Job; week: Week; staffId: string | null; plan: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const l = week.locations.find((x) => x.id === job.location_id);
  const colour = l?.colour ?? '#14519C';
  const mine = staffId ? job.assignments.find((a) => a.staff_id === staffId) : null;
  const issues = staffId ? job.issues.filter((i) => i.staff_id === staffId) : job.issues;
  const names = (id: string | null) => week.staff.find((s) => s.id === id)?.full_name ?? '';
  return (
    <button
      type="button"
      draggable={plan}
      onDragStart={onDragStart}
      onClick={onOpen}
      title={[`${clock(job.start_minutes)}–${clock(job.end_minutes)} ${job.title}`, l?.name, ...issues.map((i) => i.message)].filter(Boolean).join('\n')}
      className={cx('relative w-full rounded-md border-l-4 px-2 py-1.5 text-left text-xs leading-snug transition hover:brightness-95', plan && 'cursor-grab active:cursor-grabbing', issues.length > 0 && 'ring-2 ring-danger')}
      style={{ borderLeftColor: colour, background: tint(colour) }}
    >
      {issues.length > 0 && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white" aria-label="Has a clash">!</span>}
      <span className={cx('block whitespace-nowrap font-semibold text-muted', issues.length > 0 && 'pr-4')}>
        {span(job.start_minutes, job.end_minutes)}
        {job.series_id && <span className="ml-1 text-royal" aria-label="Repeats" title="Repeats">↻</span>}
        {mine?.acknowledged_at && <span className="ml-1 text-success" aria-label="Confirmed">✓</span>}
      </span>
      <span className="block font-medium text-charcoal">{job.title}</span>
      <span className="block truncate text-muted">{staffId ? l?.name : job.assignments.map((a) => names(a.staff_id)).join(', ') || 'No one yet'}</span>
      {mine?.covering_for_staff_id && <span className="mt-0.5 block font-semibold text-royal">Covering {names(mine.covering_for_staff_id)}</span>}
    </button>
  );
}

function WeekGrid({ week, rows, plan, onOpen, onAdd, onMove }: { week: Week; rows: 'staff' | 'location'; plan: boolean; onOpen: (j: Job) => void; onAdd: (date: string, rowId: string) => void; onMove: (j: Job, date: string, from: string | null, toRow: string) => void }) {
  const drag = useRef<{ job: Job; from: string | null } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const today = todayYmd();
  const used = new Set(week.jobs.flatMap((j) => j.assignments.map((a) => a.staff_id)));
  const list =
    rows === 'staff'
      ? week.staff.filter((s) => s.active || used.has(s.id)).map((s) => ({ id: s.id, name: s.full_name, sub: s.role_title ?? (s.employment_type === 'contractor' ? 'Contractor' : '') }))
      : week.locations.filter((l) => l.active || week.jobs.some((j) => j.location_id === l.id)).map((l) => ({ id: l.id, name: l.name, sub: l.address ?? '' }));

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <div className="grid min-w-[1040px]" style={{ gridTemplateColumns: '150px repeat(7, minmax(0, 1fr))' }}>
        <div className="sticky left-0 z-10 border-b border-r border-line bg-white" />
        {week.days.map((d) => (
          <div key={d} className={cx('border-b border-r border-line px-2 py-2 text-xs font-semibold uppercase tracking-wide last:border-r-0', d === today ? 'bg-royal text-white' : 'bg-mist/60')}>
            {dayLabel(d)}
          </div>
        ))}
        {list.map((r) => renderRow(r))}
      </div>
    </div>
  );

  // A plain function (not a component) so rows aren't remounted mid-drag.
  function renderRow(r: { id: string; name: string; sub: string }) {
    return (
      <Fragment key={r.id}>
        <div className="sticky left-0 z-10 border-b border-r border-line bg-white px-3 py-2">
          <p className="text-sm font-semibold leading-tight">{r.name}</p>
          {r.sub && <p className="truncate text-[11px] text-muted">{r.sub}</p>}
        </div>
        {week.days.map((d) => {
          const key = `${r.id}|${d}`;
          const off = rows === 'staff' ? week.leave.find((l) => l.staff_id === r.id && l.start_date <= d && l.end_date >= d) : null;
          const jobs = week.jobs.filter((j) => j.date === d && (rows === 'staff' ? j.assignments.some((a) => a.staff_id === r.id) : j.location_id === r.id)).sort((a, b) => a.start_minutes - b.start_minutes);
          return (
            <div
              key={key}
              className={cx('flex min-h-[88px] flex-col gap-1.5 border-b border-r border-line p-1.5 last:border-r-0', over === key && 'bg-sky-100')}
              style={off ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 7px, rgba(91,102,112,.09) 7px 14px)' } : undefined}
              onDragOver={(e) => {
                if (!plan || !drag.current) return;
                e.preventDefault();
                if (over !== key) setOver(key);
              }}
              onDragLeave={() => over === key && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const dragged = drag.current;
                drag.current = null;
                if (dragged) onMove(dragged.job, d, dragged.from, r.id);
              }}
            >
              {off && <span className="text-[11px] font-semibold text-muted">{LEAVE_LABEL[off.reason] ?? 'Away'}</span>}
              {jobs.map((j) => (
                <JobChip
                  key={j.id}
                  job={j}
                  week={week}
                  staffId={rows === 'staff' ? r.id : null}
                  plan={plan}
                  onOpen={() => onOpen(j)}
                  onDragStart={(e) => {
                    drag.current = { job: j, from: rows === 'staff' ? r.id : null };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', j.id);
                  }}
                />
              ))}
              {rows === 'staff' &&
                week.jobs
                  .filter((j) => j.date === d && j.assignments.some((a) => a.covering_for_staff_id === r.id))
                  .map((j) => {
                    const by = j.assignments.filter((a) => a.covering_for_staff_id === r.id).map((a) => week.staff.find((s) => s.id === a.staff_id)?.full_name ?? 'someone');
                    return (
                      <button key={`c-${j.id}`} type="button" onClick={() => onOpen(j)} className="w-full rounded-md border border-dashed border-line px-2 py-1 text-left text-[11px] leading-snug text-muted hover:border-royal">
                        <span className="line-through">{span(j.start_minutes, j.end_minutes)} {j.title}</span>
                        <span className="block font-semibold text-royal">Covered by {by.join(', ')}</span>
                      </button>
                    );
                  })}
              {plan && (
                <button type="button" onClick={() => onAdd(d, r.id)} className="mt-auto rounded border border-dashed border-line py-0.5 text-xs text-muted opacity-60 hover:opacity-100" aria-label={`Add a job on ${dayLabel(d)} for ${r.name}`}>
                  +
                </button>
              )}
            </div>
          );
        })}
      </Fragment>
    );
  }
}

// ------------------------------------------------------------------ calendar view (time grid; agenda on phones)
function CalendarView({ week, onOpen }: { week: Week; onOpen: (j: Job) => void }) {
  const [fStaff, setFStaff] = useState<Set<string>>(new Set());
  const [fLoc, setFLoc] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    fn(n);
  };
  const shown = week.jobs.filter((j) => (!fStaff.size || j.assignments.some((a) => fStaff.has(a.staff_id))) && (!fLoc.size || fLoc.has(j.location_id)));
  const from = Math.min(360, ...shown.map((j) => Math.floor(j.start_minutes / 60) * 60));
  const to = Math.max(1260, ...shown.map((j) => Math.ceil(j.end_minutes / 60) * 60));
  const H = 40; // px per hour
  const y = (m: number) => ((m - from) / 60) * H;
  const name = (id: string) => week.staff.find((s) => s.id === id)?.full_name ?? '';
  const initials = (id: string) => name(id).split(' ').map((p) => p[0]).join('');
  const today = todayYmd();

  return (
    <>
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="Filter by staff">
          {week.staff.filter((s) => s.active).map((s) => (
            <button key={s.id} type="button" onClick={() => toggle(fStaff, s.id, setFStaff)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', fStaff.has(s.id) ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-white')}>
              {s.full_name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Filter by location">
          {week.locations.filter((l) => l.active).map((l) => (
            <button key={l.id} type="button" onClick={() => toggle(fLoc, l.id, setFLoc)} className={cx('rounded-full border border-l-4 px-3 py-1 text-xs font-medium', fLoc.has(l.id) ? 'bg-charcoal text-white' : 'bg-white')} style={{ borderLeftColor: l.colour }}>
              {l.name}
            </button>
          ))}
          {(fStaff.size > 0 || fLoc.size > 0) && <Button size="sm" variant="ghost" onClick={() => { setFStaff(new Set()); setFLoc(new Set()); }}>Clear filters</Button>}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
          <div className="border-b border-line" />
          {week.days.map((d) => (
            <div key={d} className={cx('border-b border-l border-line px-2 py-2 text-center text-xs font-semibold uppercase', d === today ? 'bg-royal text-white' : '')}>{dayLabel(d)}</div>
          ))}
          <div className="relative" style={{ height: y(to) }}>
            {Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60).slice(1).map((m) => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted" style={{ top: y(m) }}>{clock(m).replace(':00', '')}</span>
            ))}
          </div>
          {week.days.map((d) => {
            const items = shown.filter((j) => j.date === d).sort((a, b) => a.start_minutes - b.start_minutes);
            const lanes: number[] = [];
            const placed = items.map((j) => {
              let k = lanes.findIndex((end) => end <= j.start_minutes);
              if (k < 0) {
                k = lanes.length;
                lanes.push(0);
              }
              lanes[k] = j.end_minutes;
              return { j, k };
            });
            const n = Math.max(1, lanes.length);
            return (
              <div key={d} className="relative border-l border-line" style={{ height: y(to) }}>
                {Array.from({ length: (to - from) / 60 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * H }} />
                ))}
                {placed.map(({ j, k }) => {
                  const l = week.locations.find((x) => x.id === j.location_id);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => onOpen(j)}
                      className={cx('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-95', j.issues.length > 0 && 'ring-2 ring-danger')}
                      style={{ top: y(j.start_minutes) + 1, height: Math.max(y(j.end_minutes) - y(j.start_minutes) - 2, 22), left: `calc(${(k * 100) / n}% + 2px)`, width: `calc(${100 / n}% - 4px)`, borderLeftColor: l?.colour, background: tint(l?.colour ?? '#14519C', '2e') }}
                      title={`${clock(j.start_minutes)}–${clock(j.end_minutes)} ${j.title} · ${l?.name ?? ''} · ${j.assignments.map((a) => name(a.staff_id)).join(', ')}`}
                    >
                      <span className="block truncate font-semibold">{span(j.start_minutes, j.end_minutes)}</span>
                      <span className="block truncate">{j.title}</span>
                      <span className="block truncate text-muted">{j.assignments.map((a) => initials(a.staff_id)).join(' · ')}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {week.days.map((d) => {
          const items = shown.filter((j) => j.date === d).sort((a, b) => a.start_minutes - b.start_minutes);
          return (
            <section key={d} className="rounded-xl border border-line bg-white p-3">
              <h3 className={cx('mb-1 font-display text-lg font-bold uppercase', d === today && 'text-royal')}>{dayLabel(d, true)}</h3>
              {items.length ? (
                items.map((j) => {
                  const l = week.locations.find((x) => x.id === j.location_id);
                  return (
                    <button key={j.id} type="button" onClick={() => onOpen(j)} className="grid w-full grid-cols-[64px_1fr] gap-2 border-t border-line py-2 text-left">
                      <span className="text-sm font-semibold">{clock(j.start_minutes)}<span className="block text-xs font-normal text-muted">to {clock(j.end_minutes)}</span></span>
                      <span className="border-l-4 pl-2" style={{ borderLeftColor: l?.colour }}>
                        <span className="block font-medium">{j.title}{j.issues.length > 0 && <span className="ml-1 text-danger">!</span>}</span>
                        <span className="block text-xs text-muted">{l?.name}</span>
                        <span className="block text-xs text-muted">{j.assignments.map((a) => name(a.staff_id) + (a.covering_for_staff_id ? ` (covering ${name(a.covering_for_staff_id)})` : '')).join(', ')}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-muted">Nothing booked</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ job card (edit) and read-only details
interface Row {
  staff_id: string;
  covering_for_staff_id: string;
  cover_reason: string;
}

const WEEKDAYS: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const isoDow = (ymd: string) => ((asDate(ymd).getUTCDay() + 6) % 7) + 1;
/** Mirrors expandDates() in lib/planner/service.ts, for the preview line. */
function previewDates(date: string, days: number[], until: string | null): string[] {
  const set = [...new Set(days.length ? days : [isoDow(date)])].sort((a, b) => a - b);
  const monday = mondayOf(date);
  const last = until && until >= date ? until : addDays(monday, 6);
  const out: string[] = [];
  for (let wk = monday; wk <= last && out.length <= 400; wk = addDays(wk, 7)) for (const d of set) if (addDays(wk, d - 1) <= last) out.push(addDays(wk, d - 1));
  return out;
}
const REPEATS: [string, string, number][] = [
  ['none', 'This week only', 0],
  ['4', 'Every week for 4 weeks', 4],
  ['8', 'Every week for 8 weeks', 8],
  ['10', 'Every week for 10 weeks (a school term)', 10],
  ['12', 'Every week for 12 weeks', 12],
  ['26', 'Every week for 6 months', 26],
  ['52', 'Every week for a year', 52],
  ['until', 'Every week until a date…', 0],
];
const MAX_AT_ONCE = 300;

/** Day buttons + repeat menu, used when adding a job and when repeating one that exists. */
function RepeatPicker({ date, days, setDays, repeat, setRepeat, until, setUntil, count, first, last, noun }: { date: string; days: number[]; setDays: (d: number[]) => void; repeat: string; setRepeat: (r: string) => void; until: string; setUntil: (u: string) => void; count: number; first?: string; last?: string; noun: string }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
        {WEEKDAYS.map(([n, l]) => {
          const on = days.includes(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => setDays(on ? (days.length > 1 ? days.filter((d) => d !== n) : days) : [...days, n])}
              className={cx('min-h-[40px] min-w-[48px] rounded-md border px-2 text-sm font-semibold', on ? 'border-royal bg-royal text-white' : 'border-line bg-white text-charcoal hover:border-royal')}
            >
              {l}
            </button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</Button>
      </div>
      <div className={cx('mt-3 grid gap-2', repeat === 'until' && 'sm:grid-cols-2')}>
        <select aria-label="Repeat" className="field" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {repeat === 'until' && <input aria-label="Repeat until" type="date" className="field" min={date} max={addDays(date, 730)} value={until} onChange={(e) => setUntil(e.target.value)} />}
      </div>
      <p className={cx('mt-2 text-xs', count > MAX_AT_ONCE ? 'font-semibold text-danger' : 'text-muted')}>
        {count > MAX_AT_ONCE
          ? `That's ${count} jobs – the most at once is ${MAX_AT_ONCE}.`
          : `${noun} ${count} job${count === 1 ? '' : 's'}${count && first ? `: ${dayLabel(first)}${last && last !== first ? ` to ${dayLabel(last)}${last.slice(0, 4) !== first.slice(0, 4) ? ` ${last.slice(0, 4)}` : ''}` : ''}` : ''}.`}
        {count > 1 && ' They stay linked, so you can change or delete the rest of them in one go later.'}
      </p>
    </>
  );
}

function JobDrawer({ week, initial, isNew, onClose, onSaved }: { week: Week; initial: Partial<Job> & { date: string }; isNew: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [jobType, setJobType] = useState(initial.job_type ?? 'club_session');
  const [locationId, setLocationId] = useState(initial.location_id ?? '');
  const [clientId, setClientId] = useState(initial.client_id ?? '');
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(toHHMM(initial.start_minutes ?? 540));
  const [end, setEnd] = useState(toHHMM(initial.end_minutes ?? 600));
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [people, setPeople] = useState<Row[]>((initial.assignments ?? []).map((a) => ({ staff_id: a.staff_id, covering_for_staff_id: a.covering_for_staff_id ?? '', cover_reason: a.cover_reason ?? '' })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [days, setDays] = useState<number[]>(() => [isoDow(initial.date)]);
  const [repeat, setRepeat] = useState('none');
  const [until, setUntil] = useState(() => addDays(initial.date, 7 * 10));
  // For a job that exists, "Repeat" starts from its own day.
  const [scope, setScope] = useState<'one' | 'following'>('one');
  const inSeries = !isNew && Boolean(initial.series_id);
  const repeatUntil = repeat === 'none' ? null : repeat === 'until' ? until : addDays(mondayOf(date), 7 * Number(repeat) - 1);
  const preview = isNew ? previewDates(date, days, repeatUntil) : [];
  const [repeatOpen, setRepeatOpen] = useState(false);
  const extra = !isNew && repeatOpen && repeatUntil ? previewDates(initial.date, days, repeatUntil).filter((d) => d !== initial.date) : [];

  async function repeatExisting() {
    if (!repeatUntil) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ created: number }>(`/api/admin/planner/jobs/${initial.id}/repeat`, { body: { days, repeat_until: repeatUntil } });
      onSaved(`${r.created} job${r.created === 1 ? '' : 's'} added${week.published_at ? ' – send updates so staff know' : ''}`);
    } catch (e) {
      setErr(e instanceof ApiError && e.fields ? Object.values(e.fields).join(' · ') : e instanceof Error ? e.message : 'Could not repeat');
      setBusy(false);
    }
  }
  const active = week.staff.filter((s) => s.active);
  const free = active.filter((s) => !people.some((p) => p.staff_id === s.id));
  const issues = (initial.issues ?? []) as Issue[];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      title,
      job_type: jobType,
      location_id: locationId,
      client_id: clientId || null,
      date,
      start_minutes: fromHHMM(start),
      end_minutes: end === '00:00' ? 1440 : fromHHMM(end),
      notes: notes || null,
      staff: people.filter((p) => p.staff_id).map((p) => ({ staff_id: p.staff_id, covering_for_staff_id: p.covering_for_staff_id || null, cover_reason: p.cover_reason || null })),
    };
    try {
      if (isNew) {
        const r = await api<{ created: number }>('/api/admin/planner/jobs', { body: { ...body, days, repeat_until: repeatUntil } });
        onSaved(r.created > 1 ? `${r.created} jobs added` : 'Job added');
      } else {
        const r = await api<{ updated: number }>(`/api/admin/planner/jobs/${initial.id}`, { method: 'PATCH', body: { ...body, ...(scope === 'following' ? { date: undefined } : {}), scope } });
        onSaved(r.updated > 1 ? `${r.updated} jobs updated` : 'Job saved');
      }
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.fields ? Object.values(e2.fields).join(' · ') : e2 instanceof Error ? e2.message : 'Could not save');
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>(`/api/admin/planner/jobs/${initial.id}${scope === 'following' ? '?scope=following' : ''}`, { method: 'DELETE' });
      const what = r.deleted > 1 ? `${r.deleted} jobs deleted` : 'Job deleted';
      onSaved(week.published_at ? `${what} – send updates so staff know` : what);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete');
      setBusy(false);
    }
  }

  const set = (i: number, patch: Partial<Row>) => setPeople(people.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <Drawer open onClose={onClose} title={isNew ? 'New job' : 'Job card'}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="job-title">What</label>
          <input id="job-title" className="field" required minLength={2} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pre-season S&C" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="job-type">Type</label>
            <select id="job-type" className="field" value={jobType} onChange={(e) => setJobType(e.target.value)}>
              {JOB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="job-loc">Where</label>
            <select id="job-loc" className="field" required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose a place…</option>
              {week.locations.filter((l) => l.active || l.id === locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="job-date">{isNew ? 'Week of / first day' : 'Day'}</label>
            <input id="job-date" type="date" className="field" required value={date} disabled={scope === 'following'} onChange={(e) => { setDate(e.target.value); if (isNew && e.target.value && days.length === 1) setDays([isoDow(e.target.value)]); }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label" htmlFor="job-start">Start</label>
              <input id="job-start" type="time" step={300} className="field" required value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="job-end">End</label>
              <input id="job-end" type="time" step={300} className="field" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {week.clients.length > 0 && (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="job-client">Client (for billing)</label>
              <select id="job-client" className="field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">None – ASPARC&apos;s own session</option>
                {week.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {isNew && (
          <fieldset className="rounded-lg border border-line bg-white p-3">
            <legend className="px-1 text-sm font-medium text-charcoal">Days and repeat</legend>
            <RepeatPicker date={date} days={days} setDays={setDays} repeat={repeat} setRepeat={setRepeat} until={until} setUntil={setUntil} count={preview.length} first={preview[0]} last={preview[preview.length - 1]} noun="Adds" />
          </fieldset>
        )}
        {!isNew && scope === 'one' && (
          <fieldset className="rounded-lg border border-line bg-white p-3">
            <legend className="px-1 text-sm font-medium text-charcoal">Repeat this job</legend>
            {!repeatOpen ? (
              <Button size="sm" variant="secondary" onClick={() => { setRepeatOpen(true); setRepeat('until'); }}>↻ Repeat on more days or weeks…</Button>
            ) : (
              <>
                <RepeatPicker date={initial.date} days={days} setDays={setDays} repeat={repeat} setRepeat={setRepeat} until={until} setUntil={setUntil} count={extra.length} first={extra[0]} last={extra[extra.length - 1]} noun="Adds" />
                <p className="mt-1 text-xs text-muted">Copies keep this job&apos;s times, place, client, notes and people (covers aren&apos;t copied). Save any other changes first.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={repeatExisting} disabled={busy || !extra.length || extra.length > MAX_AT_ONCE}>{busy ? 'Adding…' : `Add ${extra.length} job${extra.length === 1 ? '' : 's'}`}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRepeatOpen(false)}>Cancel</Button>
                </div>
              </>
            )}
          </fieldset>
        )}
        {inSeries && (
          <fieldset className="rounded-lg border border-sky/40 bg-sky-100/50 p-3">
            <legend className="px-1 text-sm font-medium text-royal-800">This job repeats</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="scope" className="accent-royal" checked={scope === 'one'} onChange={() => setScope('one')} /> Just this one</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="scope" className="accent-royal" checked={scope === 'following'} onChange={() => { setScope('following'); setDate(initial.date); }} /> This one and all later ones</label>
            </div>
            <p className="mt-1 text-xs text-muted">Saving or deleting applies to what you pick here. To move days, change just this one.</p>
          </fieldset>
        )}

        <fieldset>
          <legend className="field-label">Who&apos;s on this job</legend>
          <div className="space-y-2">
            {people.map((p, i) => (
              <div key={i} className="rounded-lg border border-line bg-white p-2.5">
                <div className="flex gap-2">
                  <select aria-label="Staff member" className="field !py-2 !text-sm" value={p.staff_id} onChange={(e) => set(i, { staff_id: e.target.value })}>
                    {[...week.staff.filter((s) => s.id === p.staff_id), ...free].map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => setPeople(people.filter((_, k) => k !== i))} aria-label="Take off this job">Remove</Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select aria-label="Covering for" className="field !py-2 !text-sm" value={p.covering_for_staff_id} onChange={(e) => set(i, { covering_for_staff_id: e.target.value })}>
                    <option value="">Not covering anyone</option>
                    {week.staff.filter((s) => s.id !== p.staff_id).map((s) => <option key={s.id} value={s.id}>Covering {s.full_name}</option>)}
                  </select>
                  {p.covering_for_staff_id && <input aria-label="Reason for cover" className="field !py-2 !text-sm" maxLength={300} placeholder="Reason (optional)" value={p.cover_reason} onChange={(e) => set(i, { cover_reason: e.target.value })} />}
                </div>
              </div>
            ))}
            {free.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setPeople([...people, { staff_id: free[0].id, covering_for_staff_id: '', cover_reason: '' }])}>+ Add a person</Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">For cover: swap in the person doing it and pick who they&apos;re covering. Both are told when you send updates.</p>
        </fieldset>

        <div>
          <label className="field-label" htmlFor="job-notes">Notes for staff</label>
          <textarea id="job-notes" className="field" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Equipment, who to report to, parking. No athlete medical details." />
        </div>

        {issues.length > 0 && !isNew && (
          <div className="rounded-lg border border-danger/25 bg-[#fdecea] px-3 py-2 text-sm text-danger">
            {issues.map((i, k) => <p key={k}>{i.message}</p>)}
          </div>
        )}
        {err && <ErrorNote message={err} />}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!isNew && <Button variant="danger" onClick={remove} disabled={busy}>{confirmDelete ? 'Tap again to delete' : scope === 'following' ? 'Delete this and later' : 'Delete job'}</Button>}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || preview.length > MAX_AT_ONCE}>{busy ? 'Saving…' : isNew ? (preview.length > 1 ? `Add ${preview.length} jobs` : 'Add job') : scope === 'following' ? 'Save this and later' : 'Save'}</Button>
          </div>
        </div>
        {week.published_at && <p className="text-xs text-muted">This week has been sent. Changes are collected and go out when you press Send updates.</p>}
      </form>
    </Drawer>
  );
}

function JobDetails({ week, job, onClose }: { week: Week; job: Job; onClose: () => void }) {
  const l = week.locations.find((x) => x.id === job.location_id);
  const name = (id: string | null) => week.staff.find((s) => s.id === id)?.full_name ?? '';
  return (
    <Drawer open onClose={onClose} title={job.title}>
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-royal">{dayLabel(job.date, true)}, {clock(job.start_minutes)} – {clock(job.end_minutes)}</p>
        <p>
          <strong>{l?.name}</strong>
          {l?.address && (
            <>
              <br />
              <a className="text-royal underline" href={mapsUrl(l.address)} target="_blank" rel="noopener">{l.address}</a>
            </>
          )}
        </p>
        {l?.access_notes && <p className="text-muted">Access: {l.access_notes}</p>}
        <p>{job.assignments.map((a) => name(a.staff_id) + (a.covering_for_staff_id ? ` (covering ${name(a.covering_for_staff_id)})` : '')).join(', ') || 'No one assigned yet'}</p>
        {job.notes && <p className="whitespace-pre-line text-muted">{job.notes}</p>}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ publish / send updates
function PublishDrawer({ week, onClose, onDone }: { week: Week; onClose: () => void; onDone: (msg: string, tone?: 'ok' | 'err') => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const first = !week.published_at;
  const who = first ? [...new Set(week.jobs.flatMap((j) => j.assignments.map((a) => a.staff_id)))] : week.pending_staff_ids;
  const staff = (id: string) => week.staff.find((s) => s.id === id);
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ sent: number; recipients: number; no_email: string[]; failed: string[]; not_configured: boolean }>('/api/admin/planner/publish', { body: { week_start: week.week_start } });
      const notes = [r.no_email.length ? `No email for ${r.no_email.join(', ')} – tell them yourself.` : '', r.failed.length ? `Couldn't email ${r.failed.join(', ')}.` : '', r.not_configured ? 'Email isn’t set up (Resend), so nothing was sent.' : ''].filter(Boolean).join(' ');
      onDone(`${first ? 'Week published' : 'Updates sent'}: ${r.sent} of ${r.recipients} emailed.${notes ? ` ${notes}` : ''}`, r.failed.length || r.not_configured ? 'err' : 'ok');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send');
      setBusy(false);
    }
  }
  return (
    <Drawer open onClose={onClose} title={first ? 'Publish & email staff' : 'Send updates'}>
      <div className="space-y-4 text-sm">
        <p>{first ? 'Each person gets one email with their jobs this week: times, addresses, access notes and who they’re working with. They also get a reminder at 6 pm the evening before each work day.' : 'Only the people whose jobs changed get an email, listing what changed and their full week.'}</p>
        <Panel pad={false}>
          <ul className="divide-y divide-line">
            {who.map((id) => {
              const s = staff(id);
              const count = week.jobs.filter((j) => j.assignments.some((a) => a.staff_id === id)).length;
              return (
                <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    <span className="font-medium">{s?.full_name ?? 'Unknown'}</span>
                    <span className="block text-xs text-muted">{count} job{count === 1 ? '' : 's'} this week</span>
                  </span>
                  {s?.email ? <Badge tone="blue">Email</Badge> : <Badge tone="amber">No email – tell them yourself</Badge>}
                </li>
              );
            })}
          </ul>
        </Panel>
        {err && <ErrorNote message={err} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy || !who.length}>{busy ? 'Sending…' : `Send to ${who.length} ${who.length === 1 ? 'person' : 'people'}`}</Button>
        </div>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ staff, places and leave
function PeopleAndPlaces({ week, reload, toast }: { week: Week; reload: () => Promise<void>; toast: (t: string, tone?: 'ok' | 'err') => void }) {
  const full = useApi<{ staff: Staff[]; logins: { id: string; email: string; full_name: string | null; role: string }[] }>('/api/admin/planner/staff');
  const [staffEdit, setStaffEdit] = useState<Partial<Staff> | null>(null);
  const [locEdit, setLocEdit] = useState<Partial<Location> | null>(null);
  const after = useCallback(async (msg: string) => {
    setStaffEdit(null);
    setLocEdit(null);
    await Promise.all([reload(), full.reload()]);
    toast(msg);
  }, [reload, full, toast]);
  const staff = full.data?.staff ?? [];
  const logins = full.data?.logins ?? [];

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Calendar link copied');
    } catch {
      toast('Copy failed – select the link and copy it', 'err');
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Staff" actions={<Button size="sm" onClick={() => setStaffEdit({ employment_type: 'employee', active: true })}>+ Add staff</Button>} pad={false}>
        {full.loading && !full.data ? (
          <div className="p-5"><Loading /></div>
        ) : !staff.length ? (
          <p className="p-5 text-sm text-muted">No staff yet. Add everyone you roster, including contractors.</p>
        ) : (
          <ul className="divide-y divide-line">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.full_name} {!s.active && <Badge>Inactive</Badge>} {s.employment_type === 'contractor' && <Badge tone="sky">Contractor</Badge>}</p>
                  <p className="text-xs text-muted">{[s.role_title, s.email ?? 'No email – reminders can’t be sent', s.phone].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-muted">{s.admin_user_id ? `Dashboard login: ${logins.find((l) => l.id === s.admin_user_id)?.email ?? 'linked'}` : 'No dashboard login (gets emails and the calendar link)'}</p>
                </div>
                {s.calendar_url && <Button size="sm" variant="ghost" onClick={() => copy(s.calendar_url!)}>Copy calendar link</Button>}
                <Button size="sm" variant="secondary" onClick={() => setStaffEdit(s)}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Places" actions={<Button size="sm" onClick={() => setLocEdit({ kind: 'club', colour: SWATCHES[week.locations.length % SWATCHES.length], active: true })}>+ Add place</Button>} pad={false}>
        {!week.locations.length ? (
          <p className="p-5 text-sm text-muted">No places yet. Add ASPARC, each club ground and school you work at.</p>
        ) : (
          <ul className="divide-y divide-line">
            {week.locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                <i className="h-8 w-2 shrink-0 rounded" style={{ background: l.colour }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name} {!l.active && <Badge>Inactive</Badge>}</p>
                  <p className="truncate text-xs text-muted">{[LOCATION_KINDS.find(([k]) => k === l.kind)?.[1], l.address, l.client_id ? `Client: ${week.clients.find((c) => c.id === l.client_id)?.name ?? ''}` : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setLocEdit(l)}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <LeavePanel week={week} staff={staff.length ? staff : week.staff} reload={reload} toast={toast} />

      {staffEdit && <StaffDrawer initial={staffEdit} logins={logins} staff={staff} onClose={() => setStaffEdit(null)} onSaved={after} />}
      {locEdit && <LocationDrawer initial={locEdit} clients={week.clients} onClose={() => setLocEdit(null)} onSaved={after} />}
    </div>
  );
}

function FormDrawer({ title, onClose, onSubmit, busy, err, children, submitLabel }: { title: string; onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; busy: boolean; err: string | null; children: ReactNode; submitLabel: string }) {
  return (
    <Drawer open onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="space-y-4">
        {children}
        {err && <ErrorNote message={err} />}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Drawer>
  );
}

function useSubmit(onSaved: (msg: string) => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await fn());
    } catch (e) {
      setErr(e instanceof ApiError && e.fields ? Object.values(e.fields).join(' · ') : e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };
  return { busy, err, run };
}

function StaffDrawer({ initial, logins, staff, onClose, onSaved }: { initial: Partial<Staff>; logins: { id: string; email: string; full_name: string | null; role: string }[]; staff: Staff[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const { busy, err, run } = useSubmit(onSaved);
  const [rotate, setRotate] = useState(false);
  const taken = new Set(staff.filter((s) => s.id !== initial.id && s.admin_user_id).map((s) => s.admin_user_id));
  return (
    <FormDrawer
      title={initial.id ? `Edit ${initial.full_name}` : 'Add staff'}
      onClose={onClose}
      busy={busy}
      err={err}
      submitLabel={initial.id ? 'Save' : 'Add'}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          full_name: f.get('full_name'),
          email: f.get('email'),
          phone: f.get('phone'),
          role_title: f.get('role_title'),
          employment_type: f.get('employment_type'),
          admin_user_id: f.get('admin_user_id') || null,
          active: f.get('active') === 'on',
          ...(rotate ? { rotate_calendar_link: true } : {}),
        };
        void run(async () => {
          if (initial.id) await api(`/api/admin/planner/staff/${initial.id}`, { method: 'PATCH', body });
          else await api('/api/admin/planner/staff', { body });
          return initial.id ? 'Staff member saved' : 'Staff member added';
        });
      }}
    >
      <div>
        <label className="field-label" htmlFor="s-name">Name</label>
        <input id="s-name" name="full_name" className="field" required minLength={2} defaultValue={initial.full_name ?? ''} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="s-email">Email (for reminders)</label>
          <input id="s-email" name="email" type="email" className="field" defaultValue={initial.email ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="s-phone">Mobile</label>
          <input id="s-phone" name="phone" type="tel" className="field" defaultValue={initial.phone ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="s-role">Role</label>
          <input id="s-role" name="role_title" className="field" placeholder="S&C coach" defaultValue={initial.role_title ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="s-type">Employment</label>
          <select id="s-type" name="employment_type" className="field" defaultValue={initial.employment_type ?? 'employee'}>
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="s-login">Dashboard login (optional)</label>
        <select id="s-login" name="admin_user_id" className="field" defaultValue={initial.admin_user_id ?? ''}>
          <option value="">None – emails and calendar link only</option>
          {logins.filter((l) => !taken.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.full_name ? `${l.full_name} – ` : ''}{l.email} ({l.role})</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">Linking a login lets them open “My Week” on the dashboard. Add logins in Settings.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="accent-royal" defaultChecked={initial.active ?? true} /> Active (can be rostered)
      </label>
      {initial.id && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-royal" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
          <span>Make a new calendar link. The old link stops working; they&apos;ll need to subscribe again (e.g. if a phone is lost or they leave).</span>
        </label>
      )}
    </FormDrawer>
  );
}

function LocationDrawer({ initial, clients, onClose, onSaved }: { initial: Partial<Location>; clients: { id: string; name: string }[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const { busy, err, run } = useSubmit(onSaved);
  const [colour, setColour] = useState(initial.colour ?? SWATCHES[0]);
  return (
    <FormDrawer
      title={initial.id ? `Edit ${initial.name}` : 'Add place'}
      onClose={onClose}
      busy={busy}
      err={err}
      submitLabel={initial.id ? 'Save' : 'Add'}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = { name: f.get('name'), kind: f.get('kind'), address: f.get('address'), access_notes: f.get('access_notes'), colour, client_id: f.get('client_id') || null, active: f.get('active') === 'on' };
        void run(async () => {
          if (initial.id) await api(`/api/admin/planner/locations/${initial.id}`, { method: 'PATCH', body });
          else await api('/api/admin/planner/locations', { body });
          return initial.id ? 'Place saved' : 'Place added';
        });
      }}
    >
      <div>
        <label className="field-label" htmlFor="l-name">Name</label>
        <input id="l-name" name="name" className="field" required minLength={2} defaultValue={initial.name ?? ''} placeholder="e.g. Avenger Park" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="l-kind">Kind</label>
          <select id="l-kind" name="kind" className="field" defaultValue={initial.kind ?? 'club'}>
            {LOCATION_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {clients.length > 0 && (
          <div>
            <label className="field-label" htmlFor="l-client">Belongs to client</label>
            <select id="l-client" name="client_id" className="field" defaultValue={initial.client_id ?? ''}>
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor="l-addr">Address</label>
        <input id="l-addr" name="address" className="field" defaultValue={initial.address ?? ''} placeholder="Shown in emails with a map link" />
      </div>
      <div>
        <label className="field-label" htmlFor="l-access">Access notes for staff</label>
        <textarea id="l-access" name="access_notes" rows={2} className="field" defaultValue={initial.access_notes ?? ''} placeholder="Parking, gate, who has the keys" />
      </div>
      <fieldset>
        <legend className="field-label">Colour on the planner</legend>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => setColour(c)} aria-label={`Colour ${c}`} aria-pressed={colour === c} className={cx('h-9 w-9 rounded-full border-2', colour === c ? 'border-charcoal' : 'border-white shadow')} style={{ background: c }} />
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="accent-royal" defaultChecked={initial.active ?? true} /> In use
      </label>
    </FormDrawer>
  );
}

function LeavePanel({ week, staff, reload, toast }: { week: Week; staff: Staff[]; reload: () => Promise<void>; toast: (t: string, tone?: 'ok' | 'err') => void }) {
  const [busy, setBusy] = useState(false);
  const name = (id: string) => staff.find((s) => s.id === id)?.full_name ?? 'Unknown';
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    try {
      await api('/api/admin/planner/leave', { body: { staff_id: f.get('staff_id'), start_date: f.get('start_date'), end_date: f.get('end_date') || f.get('start_date'), reason: f.get('reason') } });
      form.reset();
      await reload();
      toast('Leave added. Jobs that clash show a red !');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add leave', 'err');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/api/admin/planner/leave/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove', 'err');
    }
  }
  return (
    <Panel title="Leave & unavailability (this week)" className="xl:col-span-2">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label className="field-label" htmlFor="lv-staff">Who</label>
          <select id="lv-staff" name="staff_id" required className="field">
            {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="lv-from">From</label>
          <input id="lv-from" name="start_date" type="date" required className="field" defaultValue={week.week_start} />
        </div>
        <div>
          <label className="field-label" htmlFor="lv-to">To</label>
          <input id="lv-to" name="end_date" type="date" className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="lv-why">Reason</label>
          <select id="lv-why" name="reason" className="field">
            {Object.entries(LEAVE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={busy || !staff.length}>Add</Button>
      </form>
      <p className="mt-2 text-xs text-muted">No medical details are kept – just the dates and a reason.</p>
      {week.leave.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {week.leave.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <strong>{name(l.staff_id)}</strong> · {LEAVE_LABEL[l.reason] ?? l.reason} · {dayLabel(l.start_date)}{l.end_date !== l.start_date ? ` – ${dayLabel(l.end_date)}` : ''}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ My Week (every role)
interface MyWeekData extends Partial<Week> {
  ready: boolean;
  linked?: boolean;
  is_me?: boolean;
  can_plan?: boolean;
  staff_options?: { id: string; full_name: string }[];
  me?: { id: string; full_name: string; role_title: string | null };
  calendar_url?: string | null;
}

export function MyWeekSection() {
  const [week, setWeek] = useWeekParam();
  const [who, setWho] = useState<string>('');
  const url = `/api/admin/planner/my-week?week=${week}${who ? `&staff=${who}` : ''}`;
  const data = useApi<MyWeekData>(url);
  const { toast, toastNode } = useToast();
  usePolling(async () => {
    try {
      data.setData(await api<MyWeekData>(url));
    } catch {
      /* ignore */
    }
  }, false);

  const d = data.data;
  const jobs = useMemo(() => [...(d?.jobs ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [d?.jobs]);
  if (data.loading && !d) return <Loading />;
  if (data.error) return <ErrorNote message={data.error} />;
  if (!d?.ready) return <Notice tone="warn">The staff planner isn&apos;t set up in the database yet.</Notice>;

  const picker = d.can_plan && d.staff_options?.length ? (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">Show</span>
      <select className="field !w-auto !py-1.5 !text-sm" value={who || d.me?.id || ''} onChange={(e) => setWho(e.target.value)}>
        {!d.linked && <option value="">Choose a person…</option>}
        {d.staff_options.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>
    </label>
  ) : null;

  const staffName = (id: string | null) => d.staff?.find((s) => s.id === id)?.full_name ?? 'a colleague';
  async function confirm(body: { job_id?: string; week_start?: string }) {
    try {
      const r = await api<{ confirmed: number }>('/api/admin/planner/my-week', { body });
      await data.reload();
      toast(r.confirmed ? 'Thanks – confirmed' : 'Nothing to confirm');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not confirm', 'err');
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Calendar link copied');
    } catch {
      toast('Copy failed – press and hold the link to copy it', 'err');
    }
  }
  const unconfirmed = d.is_me ? jobs.filter((j) => j.assignments.some((a) => a.staff_id === d.me?.id && !a.acknowledged_at)).length : 0;

  return (
    <>
      <PageHeader title="My Week" description={d.linked ? `Where ${d.is_me ? 'you are' : `${d.me?.full_name} is`} working, day by day.` : undefined} actions={picker} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <WeekNav week={week} onChange={setWeek} />
        {d.is_me && unconfirmed > 0 && <Button onClick={() => confirm({ week_start: week })}>Got it – confirm my week</Button>}
      </div>
      {!d.linked ? (
        <Empty title="Your login isn’t linked to a staff member yet">
          {d.can_plan ? 'Pick someone above to see their week, or link your login in Staff Planner › Staff & places.' : 'Ask Johnny to link your login in the Staff Planner. Until then you’ll still get your jobs by email.'}
        </Empty>
      ) : (
        <>
          {d.calendar_url && (
            <Panel className="mb-4" title="Put your jobs in your phone’s calendar">
              <p className="text-sm text-muted">Subscribe once and every job and change appears by itself (updates every hour or so). Google Calendar: Other calendars › + › From URL. iPhone: Settings › Calendar › Accounts › Add Account › Other › Add Subscribed Calendar.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-mist px-2 py-1.5 text-xs">{d.calendar_url}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(d.calendar_url!)}>Copy link</Button>
              </div>
              <p className="mt-2 text-xs text-muted">Keep this link private. Ask for a new one if your phone is lost.</p>
            </Panel>
          )}
          {!jobs.length ? (
            <Empty title="No jobs this week">Nothing has been planned for {d.is_me ? 'you' : d.me?.full_name} this week{d.published_at ? '' : ' yet'}.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((j) => {
                const l = d.locations?.find((x) => x.id === j.location_id);
                const mine = j.assignments.find((a) => a.staff_id === d.me?.id);
                const others = j.assignments.filter((a) => a.staff_id !== d.me?.id).map((a) => staffName(a.staff_id));
                return (
                  <article key={j.id} className="rounded-xl border border-line border-t-[5px] bg-white p-4" style={{ borderTopColor: l?.colour }}>
                    <p className="text-sm font-semibold text-royal">{dayLabel(j.date, true)} · {clock(j.start_minutes)}–{clock(j.end_minutes)}</p>
                    <h3 className="mt-0.5 font-display text-2xl font-bold uppercase leading-tight">{j.title}</h3>
                    <p className="mt-1 text-sm">
                      <strong>{l?.name}</strong>
                      {l?.address && (
                        <>
                          <br />
                          <a className="text-royal underline" href={mapsUrl(l.address)} target="_blank" rel="noopener">{l.address}</a>
                        </>
                      )}
                    </p>
                    {l?.access_notes && <p className="mt-1 text-sm text-muted">Access: {l.access_notes}</p>}
                    {mine?.covering_for_staff_id && <p className="mt-2"><Badge tone="amber">Covering {staffName(mine.covering_for_staff_id)}</Badge> <span className="text-sm text-muted">{mine.cover_reason}</span></p>}
                    {others.length > 0 && <p className="mt-1 text-sm text-muted">With {others.join(', ')}</p>}
                    {j.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted">{j.notes}</p>}
                    {d.is_me && (
                      <div className="mt-3">
                        {mine?.acknowledged_at ? <Badge tone="green">Confirmed ✓</Badge> : <Button size="sm" onClick={() => confirm({ job_id: j.id })}>Got it</Button>}
                      </div>
                    )}
                    {!d.published_at && <p className="mt-2 text-xs text-muted">Draft – not sent yet, may change.</p>}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {toastNode}
    </>
  );
}
