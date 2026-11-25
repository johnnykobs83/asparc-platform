import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../db';
import { JOB_TYPES, LEAVE_REASONS, LOCATION_KINDS, type PlannerAssignment, type PlannerJob, type StaffLeave, type StaffMember, type WorkLocation } from '../db/types';
import { HttpError } from '../http/respond';
import { addDays } from '../time/melbourne';
import { isYmd, localToUtc, melbourneLocal, mondayOf, weekDays, weekRange, whenLabel } from './time';

/**
 * Staff planner: job cards (what, where, when, who), covers, leave, clashes,
 * and the record of changes made after a week was sent to staff.
 * Emails and the calendar feed live in ./notify.ts.
 */

// ------------------------------------------------------------------ input schemas
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const ymd = z.string().refine(isYmd, 'Use a date like 2026-12-01');
const uuid = z.string().uuid();

export const StaffInput = z.object({
  full_name: z.string().trim().min(2, 'Enter a name').max(120),
  email: z.preprocess(blankToNull, z.string().trim().email('Enter a valid email').max(200).nullable().optional()),
  phone: optText(40),
  role_title: optText(120),
  employment_type: z.enum(['employee', 'contractor']).default('employee'),
  admin_user_id: z.preprocess(blankToNull, uuid.nullable().optional()),
  active: z.boolean().optional(),
});
export const StaffPatch = StaffInput.partial().extend({ rotate_calendar_link: z.boolean().optional() });

export const LocationInput = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  kind: z.enum(LOCATION_KINDS).default('other'),
  address: optText(300),
  access_notes: optText(1000),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Pick a colour').default('#14519C'),
  client_id: z.preprocess(blankToNull, uuid.nullable().optional()),
  active: z.boolean().optional(),
});
export const LocationPatch = LocationInput.partial();

const AssignmentInput = z.object({
  staff_id: uuid,
  covering_for_staff_id: z.preprocess(blankToNull, uuid.nullable().optional()),
  cover_reason: optText(300),
});

const JobFields = z.object({
  title: z.string().trim().min(2, 'Enter what the job is').max(160),
  job_type: z.enum(JOB_TYPES).default('other'),
  location_id: uuid,
  client_id: z.preprocess(blankToNull, uuid.nullable().optional()),
  date: ymd,
  start_minutes: z.number().int().min(0).max(1439),
  end_minutes: z.number().int().min(1).max(1440),
  notes: optText(2000),
  staff: z.array(AssignmentInput).max(20).default([]),
  /** New jobs only: put the job on these weekdays (1 = Monday … 7 = Sunday) of the chosen week. */
  days: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  /** New jobs only: repeat every week up to and including this date. */
  repeat_until: z.preprocess(blankToNull, ymd.nullable().optional()),
});
const staffOk = (v: { staff?: { staff_id: string; covering_for_staff_id?: string | null }[] }) =>
  !v.staff || (new Set(v.staff.map((s) => s.staff_id)).size === v.staff.length && v.staff.every((s) => s.covering_for_staff_id !== s.staff_id));
export const JobInput = JobFields.refine((v) => v.end_minutes > v.start_minutes, { message: 'The job must end after it starts', path: ['end_minutes'] }).refine(staffOk, {
  message: 'Each person can only be on a job once, and can’t cover themselves',
  path: ['staff'],
});
export const JobPatch = JobFields.omit({ days: true, repeat_until: true }).partial().extend({
  /** For a repeating job: change just this one, or this one and the later ones in the series. */
  scope: z.enum(['one', 'following']).default('one'),
}).refine(staffOk, { message: 'Each person can only be on a job once, and can’t cover themselves', path: ['staff'] });

export const LeaveInput = z
  .object({ staff_id: uuid, start_date: ymd, end_date: ymd, reason: z.enum(LEAVE_REASONS).default('leave') })
  .refine((v) => v.end_date >= v.start_date, { message: 'The last day can’t be before the first day', path: ['end_date'] });

// ------------------------------------------------------------------ shapes sent to the dashboard
export type StaffPublic = Omit<StaffMember, 'calendar_token'>;
export const publicStaff = ({ calendar_token: _t, ...s }: StaffMember): StaffPublic => s;
/** What staff (not planners) may see about colleagues. */
const colleague = (s: StaffMember) => ({ id: s.id, full_name: s.full_name, role_title: s.role_title, employment_type: s.employment_type, active: s.active });

export interface Issue {
  staff_id: string;
  kind: 'overlap' | 'leave' | 'travel';
  message: string;
}
export interface WeekJob {
  id: string;
  title: string;
  job_type: PlannerJob['job_type'];
  location_id: string;
  client_id: string | null;
  starts_at: string;
  ends_at: string;
  date: string;
  start_minutes: number;
  end_minutes: number;
  notes: string | null;
  series_id: string | null;
  assignments: Pick<PlannerAssignment, 'id' | 'staff_id' | 'covering_for_staff_id' | 'cover_reason' | 'acknowledged_at'>[];
  issues: Issue[];
}

export const newCalendarToken = () => randomBytes(32).toString('base64url');
export const travelBufferMinutes = () => {
  const v = Number(process.env.PLANNER_TRAVEL_BUFFER_MINUTES ?? 30);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 180) : 30;
};

// ------------------------------------------------------------------ reads
export async function jobsInRange(gte: string, lt: string): Promise<PlannerJob[]> {
  const jobs = await db().list('planner_jobs', { range: { column: 'starts_at', gte, lt }, orderBy: 'starts_at', ascending: true, limit: 1000 });
  return jobs.filter((j) => j.status === 'scheduled');
}

export async function assignmentsFor(jobIds: string[]): Promise<PlannerAssignment[]> {
  if (!jobIds.length) return [];
  const wanted = new Set(jobIds);
  // One query per job keeps both stores simple; a week holds a few dozen jobs at most.
  const lists = await Promise.all([...wanted].map((id) => db().list('planner_assignments', { eq: { job_id: id }, orderBy: 'created_at', ascending: true })));
  return lists.flat();
}

export async function leaveOverlapping(from: string, to: string): Promise<StaffLeave[]> {
  const all = await db().list('staff_leave', { range: { column: 'start_date', lt: addDays(to, 1) }, orderBy: 'start_date', ascending: true, limit: 1000 });
  return all.filter((l) => l.end_date >= from);
}

/** Clashes: double bookings, leave, and too little travel time between venues. */
export function findIssues(jobs: (PlannerJob & { date: string })[], assignments: PlannerAssignment[], leave: StaffLeave[], staffName: (id: string) => string, locationName: (id: string) => string): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const byStaff = new Map<string, PlannerJob[]>();
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  for (const a of assignments) {
    const j = jobById.get(a.job_id);
    if (j) (byStaff.get(a.staff_id) ?? byStaff.set(a.staff_id, []).get(a.staff_id)!).push(j);
  }
  const buffer = travelBufferMinutes() * 60000;
  const add = (jobId: string, issue: Issue) => (out.get(jobId) ?? out.set(jobId, []).get(jobId)!).push(issue);
  for (const [staffId, list] of byStaff) {
    const who = staffName(staffId);
    for (const j of list) {
      const date = jobById.get(j.id)!.date;
      const off = leave.find((l) => l.staff_id === staffId && l.start_date <= date && l.end_date >= date);
      if (off) add(j.id, { staff_id: staffId, kind: 'leave', message: `${who} is marked ${off.reason === 'sick' ? 'off sick' : off.reason === 'leave' ? 'on leave' : 'unavailable'} that day` });
      const s = Date.parse(j.starts_at);
      const e = Date.parse(j.ends_at);
      for (const o of list) {
        if (o.id === j.id) continue;
        const os = Date.parse(o.starts_at);
        const oe = Date.parse(o.ends_at);
        if (os < e && s < oe) add(j.id, { staff_id: staffId, kind: 'overlap', message: `${who} is double-booked with “${o.title}” (${whenLabel(o.starts_at, o.ends_at)})` });
        else if (buffer > 0 && o.location_id !== j.location_id && ((os >= e && os - e < buffer) || (s >= oe && s - oe < buffer)))
          add(j.id, { staff_id: staffId, kind: 'travel', message: `${who} has under ${travelBufferMinutes()} min to get between ${locationName(j.location_id)} and ${locationName(o.location_id)}` });
      }
    }
  }
  return out;
}

export async function getWeekRecord(weekStart: string) {
  return db().findOne('planner_weeks', { week_start: weekStart });
}

/** Who on a week has been emailed it, and who still needs telling (planner view). */
export async function sendStatus(ws: string, onWeek: string[], pendingIds: string[]) {
  const sentRows = (await db().list('staff_reminders', { eq: { ref: ws }, orderBy: 'created_at', ascending: true, limit: 2000 })).filter((r) => r.kind === 'week' || r.kind === 'update');
  const last_sent: Record<string, { at: string; status: string }> = {};
  for (const r of sentRows) last_sent[r.staff_id] = { at: r.created_at, status: r.status };
  const unsent = onWeek.filter((id) => !last_sent[id]);
  return { last_sent, unsent_staff_ids: unsent, needs_sending: [...new Set([...unsent, ...pendingIds])] };
}

/** Everything the planner screens need for one week. Planners see contact details and clients; staff don't. */
export async function getWeek(weekStart: string, opts: { planner: boolean }) {
  if (!isYmd(weekStart)) throw new HttpError(400, 'Invalid week');
  const ws = mondayOf(weekStart);
  const { gte, lt } = weekRange(ws);
  const repo = db();
  const [jobs, staff, locations, leave, week, changes] = await Promise.all([
    jobsInRange(gte, lt),
    repo.list('staff_members', { orderBy: 'full_name', ascending: true, limit: 500 }),
    repo.list('work_locations', { orderBy: 'name', ascending: true, limit: 500 }),
    leaveOverlapping(ws, addDays(ws, 6)),
    getWeekRecord(ws),
    repo.list('planner_changes', { eq: { week_start: ws, notified_at: null }, limit: 1000 }),
  ]);
  const assignments = await assignmentsFor(jobs.map((j) => j.id));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const dated = jobs.map((j) => ({ ...j, date: melbourneLocal(j.starts_at).ymd }));
  const issues = findIssues(dated, assignments, leave, (id) => staffById.get(id)?.full_name ?? 'Someone', (id) => locById.get(id)?.name ?? 'another venue');

  const weekJobs: WeekJob[] = dated.map((j) => {
    const s = melbourneLocal(j.starts_at);
    const e = melbourneLocal(j.ends_at);
    return {
      id: j.id,
      title: j.title,
      job_type: j.job_type,
      location_id: j.location_id,
      client_id: opts.planner ? j.client_id : null,
      starts_at: j.starts_at,
      ends_at: j.ends_at,
      date: s.ymd,
      start_minutes: s.minutes,
      end_minutes: e.ymd === s.ymd ? e.minutes : 1440,
      notes: j.notes,
      series_id: j.series_id ?? null,
      assignments: assignments.filter((a) => a.job_id === j.id).map(({ id, staff_id, covering_for_staff_id, cover_reason, acknowledged_at }) => ({ id, staff_id, covering_for_staff_id, cover_reason, acknowledged_at })),
      issues: issues.get(j.id) ?? [],
    };
  });

  const clients = opts.planner ? (await repo.list('clients', { orderBy: 'name', ascending: true, limit: 500 })).map((c) => ({ id: c.id, name: c.name })) : [];
  const pendingIds = [...new Set(changes.map((c) => c.staff_id))];
  const onWeek = [...new Set(assignments.map((a) => a.staff_id))];
  const sending = opts.planner && week?.published_at ? await sendStatus(ws, onWeek, pendingIds) : null;
  return {
    week_start: ws,
    days: weekDays(ws),
    published_at: week?.published_at ?? null,
    pending_staff_ids: opts.planner ? pendingIds : [],
    pending_changes: opts.planner ? changes.length : 0,
    /** Planner only: when each person was last emailed this week, and who hasn't been sent it at all. */
    last_sent: sending?.last_sent ?? {},
    unsent_staff_ids: opts.planner ? (sending ? sending.unsent_staff_ids : week?.published_at ? [] : onWeek) : [],
    staff: opts.planner ? staff.map(publicStaff) : staff.map(colleague),
    locations: locations.map((l) => (opts.planner ? l : { ...l, client_id: null })),
    leave,
    jobs: weekJobs,
    clients,
    travel_buffer_minutes: travelBufferMinutes(),
  };
}

// ------------------------------------------------------------------ change log (only once a week has been sent)
async function describe(job: Pick<PlannerJob, 'title' | 'starts_at' | 'ends_at' | 'location_id'>) {
  const loc = await db().get('work_locations', job.location_id);
  return `${whenLabel(job.starts_at, job.ends_at)} · ${job.title}${loc ? ` at ${loc.name}` : ''}`;
}

async function recordChanges(job: Pick<PlannerJob, 'id' | 'starts_at'>, entries: { staffId: string; summary: string }[]) {
  if (!entries.length) return;
  const ws = mondayOf(melbourneLocal(job.starts_at).ymd);
  const week = await getWeekRecord(ws);
  if (!week?.published_at) return; // drafts are sent in full when published
  for (const e of entries) await db().insert('planner_changes', { week_start: ws, staff_id: e.staffId, job_id: job.id, summary: e.summary.slice(0, 400) });
}

// ------------------------------------------------------------------ writes
async function checkRefs(input: { location_id?: string; client_id?: string | null; staff?: { staff_id: string; covering_for_staff_id?: string | null }[] }) {
  const repo = db();
  if (input.location_id && !(await repo.get('work_locations', input.location_id))) throw new HttpError(422, 'That location no longer exists');
  if (input.client_id && !(await repo.get('clients', input.client_id))) throw new HttpError(422, 'That client no longer exists');
  for (const s of input.staff ?? []) {
    if (!(await repo.get('staff_members', s.staff_id))) throw new HttpError(422, 'One of the staff members no longer exists');
    if (s.covering_for_staff_id && !(await repo.get('staff_members', s.covering_for_staff_id))) throw new HttpError(422, 'The person being covered no longer exists');
  }
}

const times = (date: string, start: number, end: number) => {
  const starts = localToUtc(date, start);
  const ends = localToUtc(date, end);
  if (ends.getTime() - starts.getTime() > 16 * 3600000) throw new HttpError(422, 'A job can be at most 16 hours long');
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
};

export const MAX_JOBS_AT_ONCE = 300;
export const MAX_REPEAT_DAYS = 731; // two years

/** The dates a new job goes on: the chosen weekdays of its week, then every week until repeat_until. */
export function expandDates(date: string, days?: number[] | null, repeatUntil?: string | null): string[] {
  const isoDow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const weekdays = [...new Set(days?.length ? days : [isoDow])].sort((a, b) => a - b);
  const monday = mondayOf(date);
  const last = repeatUntil && repeatUntil >= date ? repeatUntil : addDays(monday, 6);
  if (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`) > MAX_REPEAT_DAYS * 86400000) throw new HttpError(422, 'Repeat for two years at most');
  const out: string[] = [];
  for (let wk = monday; wk <= last; wk = addDays(wk, 7)) for (const d of weekdays) {
    const day = addDays(wk, d - 1);
    if (day <= last) out.push(day);
  }
  return out;
}

async function insertJob(input: z.infer<typeof JobInput>, date: string, seriesId: string | null, actorId: string | null) {
  const repo = db();
  const job = await repo.insert('planner_jobs', {
    title: input.title,
    job_type: input.job_type,
    location_id: input.location_id,
    client_id: input.client_id ?? null,
    notes: input.notes ?? null,
    created_by: actorId,
    ...(seriesId ? { series_id: seriesId } : {}),
    ...times(date, input.start_minutes, input.end_minutes),
  });
  for (const s of input.staff) await repo.insert('planner_assignments', { job_id: job.id, staff_id: s.staff_id, covering_for_staff_id: s.covering_for_staff_id ?? null, cover_reason: s.cover_reason ?? null });
  const what = await describe(job);
  await recordChanges(job, input.staff.map((s) => ({ staffId: s.staff_id, summary: `New job: ${what}` })));
  return job;
}

/** Adds a job – or a set of them, on several days and/or repeating weekly (one series). Returns the first. */
export async function createJob(input: z.infer<typeof JobInput>, actorId: string | null) {
  await checkRefs(input);
  const dates = expandDates(input.date, input.days, input.repeat_until);
  if (dates.length > MAX_JOBS_AT_ONCE) throw new HttpError(422, `That would add ${dates.length} jobs – the most at once is ${MAX_JOBS_AT_ONCE}. Pick fewer days or an earlier end date.`);
  const seriesId = dates.length > 1 ? randomUUID() : null;
  let first: PlannerJob | null = null;
  for (const d of dates) {
    const job = await insertJob(input, d, seriesId, actorId);
    first ??= job;
  }
  return Object.assign(first!, { created: dates.length });
}

export const RepeatInput = z.object({
  days: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  repeat_until: ymd,
});

/**
 * Repeats a job that already exists: copies it onto the chosen weekdays (default: its own day)
 * every week until repeat_until. The copies join its series (one is started if needed), so
 * "this one and all later ones" works on them. Covers are not copied: the regular person is on.
 */
export async function repeatJob(id: string, input: z.infer<typeof RepeatInput>, actorId: string | null) {
  const repo = db();
  const job = await repo.get('planner_jobs', id);
  if (!job || job.status !== 'scheduled') throw new HttpError(404, 'Job not found');
  const s = melbourneLocal(job.starts_at);
  const e = melbourneLocal(job.ends_at);
  if (input.repeat_until < s.ymd) throw new HttpError(422, 'Pick an end date after this job');
  const taken = new Set(
    job.series_id
      ? (await repo.list('planner_jobs', { eq: { series_id: job.series_id }, limit: 1000 })).filter((j) => j.status === 'scheduled').map((j) => melbourneLocal(j.starts_at).ymd)
      : [s.ymd],
  );
  const dates = expandDates(s.ymd, input.days?.length ? input.days : null, input.repeat_until).filter((d) => !taken.has(d) && d !== s.ymd);
  if (!dates.length) throw new HttpError(422, 'Nothing new to add – pick more days or a later end date');
  if (dates.length > MAX_JOBS_AT_ONCE) throw new HttpError(422, `That would add ${dates.length} jobs – the most at once is ${MAX_JOBS_AT_ONCE}. Pick fewer days or an earlier end date.`);
  const seriesId = job.series_id ?? randomUUID();
  if (!job.series_id) await repo.update('planner_jobs', job.id, { series_id: seriesId });
  const people = [...new Set((await repo.list('planner_assignments', { eq: { job_id: job.id } })).map((a) => a.covering_for_staff_id ?? a.staff_id))];
  const template = {
    title: job.title,
    job_type: job.job_type,
    location_id: job.location_id,
    client_id: job.client_id,
    notes: job.notes,
    date: s.ymd,
    start_minutes: s.minutes,
    end_minutes: e.ymd === s.ymd ? e.minutes : 1440,
    staff: people.map((staff_id) => ({ staff_id })),
  } as z.infer<typeof JobInput>;
  for (const d of dates) await insertJob(template, d, seriesId, actorId);
  return { created: dates.length, first: dates[0], last: dates[dates.length - 1] };
}

/** The jobs a change or delete applies to: just this one, or this one and the later ones in its series. */
async function targets(job: PlannerJob, scope: 'one' | 'following'): Promise<PlannerJob[]> {
  if (scope === 'one' || !job.series_id) return [job];
  const series = await db().list('planner_jobs', { eq: { series_id: job.series_id }, orderBy: 'starts_at', ascending: true, limit: 1000 });
  return series.filter((j) => j.status === 'scheduled' && Date.parse(j.starts_at) >= Date.parse(job.starts_at));
}

export async function updateJob(id: string, patch: z.infer<typeof JobPatch>) {
  const job = await db().get('planner_jobs', id);
  if (!job || job.status !== 'scheduled') throw new HttpError(404, 'Job not found');
  await checkRefs(patch);
  const { scope, ...rest } = patch;
  const list = await targets(job, scope ?? 'one');
  let first: PlannerJob | null = null;
  for (const j of list) {
    // A new day only applies to the job that was opened; the others keep their own days.
    const updated = await updateOne(j, j.id === job.id ? rest : { ...rest, date: undefined });
    first ??= updated;
  }
  return Object.assign(first!, { updated: list.length });
}

async function updateOne(job: PlannerJob, patch: Omit<z.infer<typeof JobPatch>, 'scope'>) {
  const repo = db();
  const id = job.id;
  const was = melbourneLocal(job.starts_at);
  const wasEnd = melbourneLocal(job.ends_at);
  const date = patch.date ?? was.ymd;
  const start = patch.start_minutes ?? was.minutes;
  const end = patch.end_minutes ?? (wasEnd.ymd === was.ymd ? wasEnd.minutes : 1440);
  if (end <= start) throw new HttpError(422, 'The job must end after it starts');
  const next = {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.job_type !== undefined && { job_type: patch.job_type }),
    ...(patch.location_id !== undefined && { location_id: patch.location_id }),
    ...(patch.client_id !== undefined && { client_id: patch.client_id ?? null }),
    ...(patch.notes !== undefined && { notes: patch.notes ?? null }),
    ...times(date, start, end),
  };
  const oldWhat = await describe(job);
  const updated = (await repo.update('planner_jobs', id, next))!;
  const newWhat = await describe(updated);
  const detailsChanged = updated.starts_at !== job.starts_at || updated.ends_at !== job.ends_at || updated.location_id !== job.location_id || updated.title !== job.title || (updated.notes ?? '') !== (job.notes ?? '');

  const current = await repo.list('planner_assignments', { eq: { job_id: id } });
  const entries: { staffId: string; summary: string }[] = [];
  const reAck = new Set<string>();
  if (patch.staff) {
    const wanted = new Map(patch.staff.map((s) => [s.staff_id, s]));
    for (const a of current) {
      if (!wanted.has(a.staff_id)) {
        await repo.remove('planner_assignments', a.id);
        entries.push({ staffId: a.staff_id, summary: `Taken off: ${oldWhat}` });
      }
    }
    for (const s of patch.staff) {
      const a = current.find((x) => x.staff_id === s.staff_id);
      const cover = { covering_for_staff_id: s.covering_for_staff_id ?? null, cover_reason: s.cover_reason ?? null };
      if (!a) {
        await repo.insert('planner_assignments', { job_id: id, staff_id: s.staff_id, ...cover });
        const coverName = cover.covering_for_staff_id ? (await repo.get('staff_members', cover.covering_for_staff_id))?.full_name : null;
        entries.push({ staffId: s.staff_id, summary: `${coverName ? `Covering ${coverName}` : 'Added to'}: ${newWhat}` });
        // The person being covered hears that they're off this job.
        if (cover.covering_for_staff_id && !wanted.has(cover.covering_for_staff_id) && !entries.some((e) => e.staffId === cover.covering_for_staff_id))
          entries.push({ staffId: cover.covering_for_staff_id, summary: `Covered by ${(await repo.get('staff_members', s.staff_id))?.full_name ?? 'a colleague'}: ${oldWhat}` });
      } else if (a.covering_for_staff_id !== cover.covering_for_staff_id || (a.cover_reason ?? null) !== cover.cover_reason) {
        await repo.update('planner_assignments', a.id, cover);
      }
    }
  }
  if (detailsChanged) {
    const kept = (patch.staff ? current.filter((a) => patch.staff!.some((s) => s.staff_id === a.staff_id)) : current).map((a) => a.staff_id);
    for (const staffId of kept) {
      if (!entries.some((e) => e.staffId === staffId)) entries.push({ staffId, summary: `Changed: ${newWhat} (was ${oldWhat})` });
      reAck.add(staffId);
    }
  }
  for (const a of await repo.list('planner_assignments', { eq: { job_id: id } })) if (reAck.has(a.staff_id) && a.acknowledged_at) await repo.update('planner_assignments', a.id, { acknowledged_at: null });
  // A job moved into another week is news for both weeks.
  const oldWeek = mondayOf(was.ymd);
  const newWeek = mondayOf(melbourneLocal(updated.starts_at).ymd);
  if (oldWeek !== newWeek) {
    await recordChanges(job, entries.filter((e) => current.some((a) => a.staff_id === e.staffId)).map((e) => ({ staffId: e.staffId, summary: `Moved out of this week: ${oldWhat}` })));
  }
  await recordChanges(updated, entries);
  return updated;
}

export async function deleteJob(id: string, scope: 'one' | 'following' = 'one') {
  const job = await db().get('planner_jobs', id);
  if (!job) throw new HttpError(404, 'Job not found');
  const list = await targets(job, scope);
  for (const j of list) await deleteOne(j);
  return list.length;
}

async function deleteOne(job: PlannerJob) {
  const repo = db();
  const id = job.id;
  const current = await repo.list('planner_assignments', { eq: { job_id: id } });
  const what = await describe(job);
  await recordChanges(job, current.map((a) => ({ staffId: a.staff_id, summary: `Cancelled: ${what}` })));
  for (const a of current) await repo.remove('planner_assignments', a.id);
  await repo.remove('planner_jobs', id);
  // Keep the change log entries (they reference the job only loosely).
  for (const c of await repo.list('planner_changes', { eq: { job_id: id } })) await repo.update('planner_changes', c.id, { job_id: null });
}

/** Copies one week's jobs into another, empty, week. Covers are undone: the original person is back on. */
export async function copyWeek(fromWeek: string, toWeek: string, actorId: string | null) {
  if (!isYmd(fromWeek) || !isYmd(toWeek)) throw new HttpError(400, 'Invalid week');
  const from = mondayOf(fromWeek);
  const to = mondayOf(toWeek);
  if (from === to) throw new HttpError(422, 'Pick a different week to copy into');
  const target = weekRange(to);
  if ((await jobsInRange(target.gte, target.lt)).length) throw new HttpError(409, 'That week already has jobs. Copying only works into an empty week.');
  const src = weekRange(from);
  const jobs = await jobsInRange(src.gte, src.lt);
  const assignments = await assignmentsFor(jobs.map((j) => j.id));
  const staff = new Map((await db().list('staff_members', { limit: 500 })).map((s) => [s.id, s]));
  const shift = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  let count = 0;
  for (const j of jobs) {
    const s = melbourneLocal(j.starts_at);
    const e = melbourneLocal(j.ends_at);
    const date = addDays(s.ymd, shift);
    const people = [...new Set(assignments.filter((a) => a.job_id === j.id).map((a) => a.covering_for_staff_id ?? a.staff_id))].filter((id) => staff.get(id)?.active);
    await createJob(
      { title: j.title, job_type: j.job_type, location_id: j.location_id, client_id: j.client_id, notes: j.notes, date, start_minutes: s.minutes, end_minutes: e.ymd === s.ymd ? e.minutes : 1440, staff: people.map((id) => ({ staff_id: id })) },
      actorId,
    );
    count++;
  }
  return { copied: count, week_start: to };
}

// ------------------------------------------------------------------ staff, locations, leave
export async function createStaff(input: z.infer<typeof StaffInput>) {
  if (input.admin_user_id && !(await db().get('admin_users', input.admin_user_id))) throw new HttpError(422, 'That dashboard login no longer exists');
  return db().insert('staff_members', { ...input, email: input.email ?? null, phone: input.phone ?? null, role_title: input.role_title ?? null, admin_user_id: input.admin_user_id ?? null, calendar_token: newCalendarToken() });
}

export async function updateStaff(id: string, patch: z.infer<typeof StaffPatch>) {
  const { rotate_calendar_link, ...rest } = patch;
  if (rest.admin_user_id && !(await db().get('admin_users', rest.admin_user_id))) throw new HttpError(422, 'That dashboard login no longer exists');
  if (rest.admin_user_id) {
    const other = await db().findOne('staff_members', { admin_user_id: rest.admin_user_id });
    if (other && other.id !== id) throw new HttpError(422, `That login is already linked to ${other.full_name}`);
  }
  const updated = await db().update('staff_members', id, { ...rest, ...(rotate_calendar_link ? { calendar_token: newCalendarToken() } : {}) });
  if (!updated) throw new HttpError(404, 'Staff member not found');
  return updated;
}

export async function addLeave(input: z.infer<typeof LeaveInput>) {
  if (!(await db().get('staff_members', input.staff_id))) throw new HttpError(422, 'Staff member not found');
  return db().insert('staff_leave', input);
}

/** The staff record for a signed-in dashboard user: their linked login, or the same email address. */
export async function staffForSession(session: { sub: string; email: string }): Promise<StaffMember | null> {
  const linked = await db().findOne('staff_members', { admin_user_id: session.sub });
  if (linked) return linked;
  const byEmail = await db().findOne('staff_members', { email: session.email });
  return byEmail && !byEmail.admin_user_id ? byEmail : null;
}

/** A staff member's own jobs for a week, plus colleagues and locations to show on each card. */
export async function getMyWeek(staffId: string, weekStart: string) {
  const week = await getWeek(weekStart, { planner: false });
  const jobs = week.jobs.filter((j) => j.assignments.some((a) => a.staff_id === staffId));
  return { ...week, jobs, staff_id: staffId, pending_staff_ids: [], pending_changes: 0 };
}

export async function acknowledge(staffId: string, opts: { jobId?: string; weekStart?: string }) {
  const repo = db();
  let jobIds: string[];
  if (opts.jobId) jobIds = [opts.jobId];
  else if (opts.weekStart && isYmd(opts.weekStart)) {
    const { gte, lt } = weekRange(mondayOf(opts.weekStart));
    jobIds = (await jobsInRange(gte, lt)).map((j) => j.id);
  } else throw new HttpError(400, 'Say which job or week to confirm');
  const now = new Date().toISOString();
  let n = 0;
  for (const a of await assignmentsFor(jobIds)) {
    if (a.staff_id !== staffId) continue;
    if (!a.acknowledged_at) await repo.update('planner_assignments', a.id, { acknowledged_at: now });
    n++;
  }
  return n;
}

export type { WorkLocation };
