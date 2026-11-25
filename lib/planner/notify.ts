import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { db } from '../db';
import type { PlannerJob, StaffMember, StaffReminder, WorkLocation } from '../db/types';
import { HttpError } from '../http/respond';
import { emailLayout, escapeHtml as esc, isResendConfigured, sendEmail } from '../integrations/resend';
import { addDays, melbourneDate } from '../time/melbourne';
import { assignmentsFor, getWeekRecord, jobsInRange, sendStatus } from './service';
import { dayLabel, isYmd, melbourneLocal, mondayOf, weekRange, whenLabel } from './time';

/**
 * Telling staff where they're working:
 *  - "Your week" email when a week is published, with a confirm link
 *  - "Changes to your week" email for changes made after that
 *  - a reminder the evening before each work day (hourly cron, sends at PLANNER_REMINDER_HOUR Melbourne time)
 *  - a personal calendar feed (.ics) each person subscribes to once
 * Only published weeks ever reach staff. Nothing here throws on an email failure.
 */

export type SendStatus = StaffReminder['status'];
export interface SendReport {
  recipients: number;
  sent: number;
  no_email: string[];
  failed: string[];
  not_configured: boolean;
}

// ------------------------------------------------------------------ signed confirm links
const CONFIRM_TTL_DAYS = 21;
const hmac = (s: string) => createHmac('sha256', `planner-confirm:${env.sessionSecret}`).update(s).digest('base64url');

export function confirmToken(staffId: string, weekStart: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + CONFIRM_TTL_DAYS * 86400;
  const body = Buffer.from(`${staffId}|${weekStart}|${exp}`).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function readConfirmToken(token: string, now = Date.now()): { staffId: string; weekStart: string } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [staffId, weekStart, exp] = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (!staffId || !isYmd(weekStart ?? '') || !(Number(exp) > now / 1000)) return null;
  return { staffId, weekStart };
}

export const calendarUrl = (token: string) => `${env.siteUrl}/api/calendar/staff/${token}.ics`;
export const confirmUrl = (staffId: string, weekStart: string) => `${env.siteUrl}/api/planner/confirm/${confirmToken(staffId, weekStart)}`;
const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// ------------------------------------------------------------------ building one person's list of jobs
interface Line {
  job: PlannerJob;
  location: WorkLocation | null;
  coveringFor: string | null;
  with: string[];
}

async function linesFor(staffId: string, jobs: PlannerJob[]): Promise<Line[]> {
  const repo = db();
  const assignments = await assignmentsFor(jobs.map((j) => j.id));
  const staff = new Map((await repo.list('staff_members', { limit: 500 })).map((s) => [s.id, s]));
  const locations = new Map((await repo.list('work_locations', { limit: 500 })).map((l) => [l.id, l]));
  return jobs
    .filter((j) => assignments.some((a) => a.job_id === j.id && a.staff_id === staffId))
    .map((j) => {
      const mine = assignments.find((a) => a.job_id === j.id && a.staff_id === staffId)!;
      return {
        job: j,
        location: locations.get(j.location_id) ?? null,
        coveringFor: mine.covering_for_staff_id ? (staff.get(mine.covering_for_staff_id)?.full_name ?? 'a colleague') : null,
        with: assignments.filter((a) => a.job_id === j.id && a.staff_id !== staffId).map((a) => staff.get(a.staff_id)?.full_name ?? 'Colleague'),
      };
    });
}

function lineText(l: Line): string {
  return [
    `${whenLabel(l.job.starts_at, l.job.ends_at)} – ${l.job.title}`,
    `  Where: ${l.location?.name ?? 'TBC'}${l.location?.address ? `, ${l.location.address}` : ''}`,
    l.coveringFor ? `  Covering ${l.coveringFor}` : '',
    l.with.length ? `  With: ${l.with.join(', ')}` : '',
    l.location?.access_notes ? `  Access: ${l.location.access_notes}` : '',
    l.job.notes ? `  Notes: ${l.job.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function lineHtml(l: Line): string {
  const where = l.location
    ? `${esc(l.location.name)}${l.location.address ? ` · <a href="${esc(mapsUrl(l.location.address))}" style="color:#14519C">${esc(l.location.address)}</a>` : ''}`
    : 'Location to be confirmed';
  return `<tr><td style="padding:10px 0;border-top:1px solid #dde4eb;vertical-align:top">
<div style="font-weight:bold;color:#14519C">${esc(whenLabel(l.job.starts_at, l.job.ends_at))}</div>
<div style="font-size:16px;font-weight:bold;margin:2px 0">${esc(l.job.title)}</div>
<div>${where}</div>
${l.coveringFor ? `<div style="color:#b26a00;font-weight:bold">Covering ${esc(l.coveringFor)}</div>` : ''}
${l.with.length ? `<div style="color:#5b6670">With ${esc(l.with.join(', '))}</div>` : ''}
${l.location?.access_notes ? `<div style="color:#5b6670">Access: ${esc(l.location.access_notes)}</div>` : ''}
${l.job.notes ? `<div style="color:#5b6670">${esc(l.job.notes)}</div>` : ''}
</td></tr>`;
}

async function deliver(staff: StaffMember, kind: StaffReminder['kind'], ref: string, subject: string, title: string, introText: string, introHtml: string, lines: Line[], opts: { confirmWeek?: string } = {}): Promise<SendStatus> {
  let status: SendStatus;
  if (!staff.email) status = 'no_email';
  else if (!isResendConfigured()) status = 'not_configured';
  else {
    const first = staff.full_name.split(' ')[0];
    const confirm = opts.confirmWeek ? confirmUrl(staff.id, opts.confirmWeek) : null;
    const cal = calendarUrl(staff.calendar_token);
    const text = [
      `Hi ${first},`,
      '',
      introText,
      '',
      ...lines.map(lineText),
      '',
      confirm ? `Confirm you've seen this: ${confirm}` : '',
      `Add your ASPARC jobs to your phone's calendar (updates by itself): ${cal}`,
      '',
      'ASPARC',
    ]
      .filter((x) => x !== '')
      .join('\n');
    const html = emailLayout(
      title,
      `<p>Hi ${esc(first)},</p><p>${introHtml}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines.map(lineHtml).join('')}</table>
<p style="margin-top:18px;font-size:13px;color:#5b6670">Add your ASPARC jobs to your phone's calendar once and they'll stay up to date: <a href="${esc(cal)}" style="color:#14519C">calendar link</a> (in Google Calendar choose “From URL”; on iPhone choose Settings › Calendar › Accounts › Add Subscribed Calendar).</p>`,
      confirm ? { label: 'Got it – confirm my week', url: confirm } : undefined,
    );
    const r = await sendEmail({ to: [staff.email], subject, text, html, entityType: 'staff_member', entityId: staff.id });
    status = r.status === 'sent' ? 'sent' : r.status === 'not_configured' ? 'not_configured' : 'failed';
  }
  await db().insert('staff_reminders', { staff_id: staff.id, kind, ref, status });
  return status;
}

function tally(report: SendReport, staff: StaffMember, status: SendStatus) {
  report.recipients++;
  if (status === 'sent') report.sent++;
  else if (status === 'no_email') report.no_email.push(staff.full_name);
  else if (status === 'failed') report.failed.push(staff.full_name);
  else report.not_configured = true;
}

// ------------------------------------------------------------------ publish a week / send to chosen staff
/**
 * Sends the week to staff.
 * - staffIds left out: the first time, everyone on the week; after that, everyone who still
 *   needs telling (never sent this week, or has changes they haven't been told about).
 * - staffIds given: just those people – one person or several. Anyone with unsent changes
 *   gets the "what changed" email; everyone else gets their full week again.
 * The first send marks the week as published (it then shows in calendars and reminders).
 */
export async function publishWeek(weekStart: string, actorId: string | null, opts: { staffIds?: string[] } = {}): Promise<SendReport & { mode: 'published' | 'updates' | 'resent' }> {
  if (!isYmd(weekStart)) throw new HttpError(400, 'Invalid week');
  const ws = mondayOf(weekStart);
  const repo = db();
  const { gte, lt } = weekRange(ws);
  const jobs = await jobsInRange(gte, lt);
  const assignments = await assignmentsFor(jobs.map((j) => j.id));
  let week = await getWeekRecord(ws);
  const report: SendReport = { recipients: 0, sent: 0, no_email: [], failed: [], not_configured: false };
  const range = `${dayLabel(ws)} – ${dayLabel(addDays(ws, 6))}`;
  const firstTime = !week?.published_at;
  if (firstTime && !jobs.length) throw new HttpError(422, 'There are no jobs in this week to send yet.');

  const onWeek = [...new Set(assignments.map((a) => a.staff_id))];
  const pending = firstTime ? [] : await repo.list('planner_changes', { eq: { week_start: ws, notified_at: null }, orderBy: 'created_at', ascending: true, limit: 1000 });
  const pendingIds = [...new Set(pending.map((c) => c.staff_id))];
  const status = await sendStatus(ws, onWeek, pendingIds);

  let targets: string[];
  if (opts.staffIds) {
    targets = [...new Set(opts.staffIds)];
    const allowed = new Set([...onWeek, ...pendingIds]);
    if (!targets.length) throw new HttpError(422, 'Choose at least one person to send to.');
    if (targets.some((id) => !allowed.has(id))) throw new HttpError(422, 'Someone you picked has no jobs or changes in this week.');
  } else {
    targets = firstTime ? onWeek : status.needs_sending;
    if (!targets.length) throw new HttpError(422, 'Everyone already has the latest version of this week.');
  }

  if (firstTime) {
    const now = new Date().toISOString();
    week = week ? await repo.update('planner_weeks', week.id, { published_at: now, published_by: actorId }) : await repo.insert('planner_weeks', { week_start: ws, published_at: now, published_by: actorId });
  }

  let updates = 0;
  for (const staffId of targets) {
    const staff = await repo.get('staff_members', staffId);
    const mine = pending.filter((c) => c.staff_id === staffId);
    if (staff) {
      const lines = await linesFor(staffId, jobs);
      // They already had this week and something changed since: tell them what changed.
      if (mine.length && status.last_sent[staffId]) {
        updates++;
        const changesText = mine.map((c) => `• ${c.summary}`).join('\n');
        const changesHtml = `<ul style="padding-left:18px;margin:8px 0">${mine.map((c) => `<li>${esc(c.summary)}</li>`).join('')}</ul>`;
        tally(
          report,
          staff,
          await deliver(
            staff,
            'update',
            ws,
            `Change to your ASPARC week: ${range}`,
            'Your week has changed',
            `Your week (${range}) has changed:\n${changesText}\n\n${lines.length ? 'Your full week now:' : 'You have no jobs left this week.'}`,
            `Your week (<strong>${esc(range)}</strong>) has changed:</p>${changesHtml}<p>${lines.length ? 'Your full week now:' : 'You have no jobs left this week.'}`,
            lines,
            { confirmWeek: lines.length ? ws : undefined },
          ),
        );
      } else {
        tally(
          report,
          staff,
          await deliver(
            staff,
            'week',
            ws,
            `Your ASPARC week: ${range}`,
            'Your week at ASPARC',
            lines.length ? `Here's where you're working ${range}:` : `You have no jobs in the week of ${range}.`,
            lines.length ? `Here's where you're working <strong>${esc(range)}</strong>:` : `You have no jobs in the week of <strong>${esc(range)}</strong>.`,
            lines,
            { confirmWeek: lines.length ? ws : undefined },
          ),
        );
      }
    }
    for (const c of mine) await repo.update('planner_changes', c.id, { notified_at: new Date().toISOString() });
  }
  return { ...report, mode: firstTime ? 'published' : updates ? 'updates' : 'resent' };
}

// ------------------------------------------------------------------ evening-before reminders (cron)
export const reminderHour = () => {
  const h = Number(process.env.PLANNER_REMINDER_HOUR ?? 18);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 18;
};

/** Sends tomorrow's jobs to each person once, at the reminder hour (Melbourne). Safe to call every hour. */
export async function runDayBeforeReminders(now = new Date(), opts: { force?: boolean } = {}) {
  const local = melbourneLocal(now);
  if (!opts.force && Math.floor(local.minutes / 60) !== reminderHour()) return { skipped: 'not reminder time', sent: 0 };
  const tomorrow = addDays(melbourneDate(now), 1);
  const week = await getWeekRecord(mondayOf(tomorrow));
  if (!week?.published_at) return { skipped: 'week not published', sent: 0 };
  const range = weekRange(mondayOf(tomorrow));
  const jobs = (await jobsInRange(range.gte, range.lt)).filter((j) => melbourneLocal(j.starts_at).ymd === tomorrow);
  const assignments = await assignmentsFor(jobs.map((j) => j.id));
  const repo = db();
  let sent = 0;
  for (const staffId of [...new Set(assignments.map((a) => a.staff_id))]) {
    const already = (await repo.list('staff_reminders', { eq: { staff_id: staffId, kind: 'day_before', ref: tomorrow } })).some((r) => r.status === 'sent');
    if (already) continue;
    const staff = await repo.get('staff_members', staffId);
    if (!staff?.active) continue;
    const lines = await linesFor(staffId, jobs);
    const day = dayLabel(tomorrow, true);
    const status = await deliver(staff, 'day_before', tomorrow, `Tomorrow at ASPARC: ${lines.map((l) => l.location?.name).filter(Boolean)[0] ?? 'your jobs'}`, 'Your jobs tomorrow', `Tomorrow, ${day}:`, `Tomorrow, <strong>${esc(day)}</strong>:`, lines);
    if (status === 'sent') sent++;
  }
  return { skipped: null, sent, date: tomorrow };
}

// ------------------------------------------------------------------ calendar feed
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = '';
  for (const ch of line) {
    if (Buffer.byteLength(chunk + ch) > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  out.push(chunk);
  return out.join('\r\n ');
}

/** The published jobs for one person from two weeks ago to two months ahead, as an iCalendar feed. */
export async function buildCalendarFeed(token: string, now = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  const repo = db();
  const staff = await repo.findOne('staff_members', { calendar_token: token });
  if (!staff || !staff.active) return null;
  const from = new Date(now.getTime() - 14 * 86400000).toISOString();
  const to = new Date(now.getTime() + 62 * 86400000).toISOString();
  const all = await jobsInRange(from, to);
  const published = new Set((await repo.list('planner_weeks', { limit: 1000 })).filter((w) => w.published_at).map((w) => w.week_start));
  const jobs = all.filter((j) => published.has(mondayOf(melbourneLocal(j.starts_at).ymd)));
  const lines = await linesFor(staff.id, jobs);
  const stamp = icsTime(now.toISOString());
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ASPARC//Staff planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`ASPARC – ${staff.full_name}`)}`,
    'X-WR-TIMEZONE:Australia/Melbourne',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const l of lines) {
    const desc = [l.coveringFor ? `Covering ${l.coveringFor}` : '', l.with.length ? `With ${l.with.join(', ')}` : '', l.location?.access_notes ? `Access: ${l.location.access_notes}` : '', l.job.notes ?? ''].filter(Boolean).join('\n');
    out.push(
      'BEGIN:VEVENT',
      `UID:${l.job.id}-${staff.id}@asparc.com.au`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${icsTime(l.job.updated_at)}`,
      `DTSTART:${icsTime(l.job.starts_at)}`,
      `DTEND:${icsTime(l.job.ends_at)}`,
      `SUMMARY:${icsEscape(`${l.job.title}${l.coveringFor ? ` (covering ${l.coveringFor})` : ''}`)}`,
      `LOCATION:${icsEscape([l.location?.name, l.location?.address].filter(Boolean).join(', '))}`,
      ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
      'END:VEVENT',
    );
  }
  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n') + '\r\n';
}
