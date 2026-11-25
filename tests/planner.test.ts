import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GET as calendarGET } from '../app/api/calendar/staff/[token]/route';
import { POST as copyPOST } from '../app/api/admin/planner/copy/route';
import { PATCH as jobPATCH, DELETE as jobDELETE } from '../app/api/admin/planner/jobs/[id]/route';
import { POST as jobPOST } from '../app/api/admin/planner/jobs/route';
import { POST as leavePOST } from '../app/api/admin/planner/leave/route';
import { POST as locationPOST } from '../app/api/admin/planner/locations/route';
import { GET as myWeekGET, POST as myWeekPOST } from '../app/api/admin/planner/my-week/route';
import { POST as publishPOST } from '../app/api/admin/planner/publish/route';
import { PATCH as staffPATCH } from '../app/api/admin/planner/staff/[id]/route';
import { GET as staffGET, POST as staffPOST } from '../app/api/admin/planner/staff/route';
import { GET as weekGET } from '../app/api/admin/planner/week/route';
import { GET as confirmGET, POST as confirmPOST } from '../app/api/planner/confirm/[token]/route';
import { GET as cronGET } from '../app/api/cron/staff-reminders/route';
import { signSession } from '../lib/auth/session';
import { db } from '../lib/db';
import type { Role } from '../lib/db/types';
import { buildCalendarFeed, confirmToken, runDayBeforeReminders } from '../lib/planner/notify';
import { expandDates } from '../lib/planner/service';
import { localToUtc, mondayOf } from '../lib/planner/time';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, mockFetch, req, type FetchCall } from './helpers';

const RESEND = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'ASPARC <performance@asparc.com.au>' };
const WEEK = mondayOf(addDays(melbourneDate(), 14));
const day = (i: number) => addDays(WEEK, i);
const mail = (c: FetchCall) => c.body as { to: string[]; subject: string; text: string; html: string };
const resend = () => mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'email_1' } })]]);

async function cookieFor(role: Role, sub: string, email: string) {
  return `asparc_session=${await signSession({ sub, email, role, name: email })}`;
}
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });
const post = async (fn: (r: Request) => Promise<Response>, path: string, body: unknown, role: Role | null = 'owner') => json(await fn(req(path, { body, cookie: role ? await adminCookie(role) : undefined })));

async function setup() {
  const sam = (await post(staffPOST, '/api/admin/planner/staff', { full_name: 'Sam Coach', email: 'sam@example.com', role_title: 'S&C coach' })).body.staff;
  const pri = (await post(staffPOST, '/api/admin/planner/staff', { full_name: 'Priya Coach', email: 'priya@example.com' })).body.staff;
  const alex = (await post(staffPOST, '/api/admin/planner/staff', { full_name: 'Alex Therapist', employment_type: 'contractor', email: '' })).body.staff;
  const home = (await post(locationPOST, '/api/admin/planner/locations', { name: 'ASPARC Parkville', kind: 'asparc', address: '476 Brunswick Rd, Parkville VIC', colour: '#14519C' })).body.location;
  const ground = (await post(locationPOST, '/api/admin/planner/locations', { name: 'Club ground', kind: 'club', address: '1 Test St', access_notes: 'Gate code 1234', colour: '#0E8C7F' })).body.location;
  return { sam, pri, alex, home, ground };
}
const addJob = async (body: Record<string, unknown>, role: Role = 'owner') => post(jobPOST, '/api/admin/planner/jobs', { title: 'Pre-season S&C', job_type: 'club_session', ...body }, role);
const getWeek = async (role: Role = 'owner', week = WEEK) => json(await weekGET(req(`/api/admin/planner/week?week=${week}`, { cookie: await adminCookie(role) })));

describe('Staff planner – planning a week', () => {
  beforeEach(() => freshDb());

  it('lets owners and managers plan, and staff only look', async () => {
    const { sam, ground } = await setup();
    assert.equal((await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] }, 'staff')).status, 403);
    assert.equal((await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] }, 'manager')).status, 201);
    assert.equal((await post(staffPOST, '/api/admin/planner/staff', { full_name: 'Nope' }, 'staff')).status, 403);
    assert.equal((await post(jobPOST, '/api/admin/planner/jobs', {}, null)).status, 401);

    const staffView = await getWeek('staff');
    assert.equal(staffView.status, 200);
    assert.equal(staffView.body.can_plan, false);
    assert.equal(staffView.body.jobs.length, 1);
    assert.equal(staffView.body.staff[0].email, undefined, 'staff do not get colleagues’ contact details');
    assert.equal(staffView.body.staff[0].calendar_token, undefined);
    assert.deepEqual(staffView.body.pending_staff_ids, []);
    const planner = await getWeek('owner');
    assert.equal(planner.body.can_plan, true);
    assert.ok(planner.body.staff.every((s: Record<string, unknown>) => s.calendar_token === undefined), 'calendar secrets never go out in the week view');
  });

  it('stores Melbourne local times correctly across daylight saving', async () => {
    const { sam, ground } = await setup();
    const { body } = await addJob({ location_id: ground.id, date: day(1), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] });
    assert.equal(body.job.starts_at, localToUtc(day(1), 390).toISOString());
    const w = (await getWeek()).body;
    assert.equal(w.week_start, WEEK);
    assert.deepEqual([w.jobs[0].date, w.jobs[0].start_minutes, w.jobs[0].end_minutes], [day(1), 390, 480]);
    // 6:30 am on 1 Dec 2026 (AEDT, UTC+11) is 7:30 pm UTC the day before.
    assert.equal(localToUtc('2026-12-01', 390).toISOString(), '2026-11-30T19:30:00.000Z');
    assert.equal(localToUtc('2026-07-01', 390).toISOString(), '2026-06-30T20:30:00.000Z');
  });

  it('rejects bad jobs: ending before starting, unknown places, the same person twice, covering yourself', async () => {
    const { sam, ground } = await setup();
    assert.equal((await addJob({ location_id: ground.id, date: day(0), start_minutes: 600, end_minutes: 540 })).status, 422);
    assert.equal((await addJob({ location_id: crypto.randomUUID(), date: day(0), start_minutes: 540, end_minutes: 600 })).status, 422);
    assert.equal((await addJob({ location_id: ground.id, date: day(0), start_minutes: 540, end_minutes: 600, staff: [{ staff_id: sam.id }, { staff_id: sam.id }] })).status, 422);
    assert.equal((await addJob({ location_id: ground.id, date: day(0), start_minutes: 540, end_minutes: 600, staff: [{ staff_id: sam.id, covering_for_staff_id: sam.id }] })).status, 422);
  });

  it('flags double bookings, leave and too little travel time between venues', async () => {
    const { sam, pri, home, ground } = await setup();
    await addJob({ location_id: ground.id, date: day(0), start_minutes: 540, end_minutes: 780, staff: [{ staff_id: pri.id }] });
    await addJob({ title: '1:1 sessions', location_id: home.id, date: day(0), start_minutes: 720, end_minutes: 840, staff: [{ staff_id: pri.id }] });
    await addJob({ location_id: ground.id, date: day(2), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] });
    await addJob({ title: '1:1 sessions', location_id: home.id, date: day(2), start_minutes: 490, end_minutes: 600, staff: [{ staff_id: sam.id }] });
    await addJob({ title: 'Later', location_id: home.id, date: day(2), start_minutes: 900, end_minutes: 960, staff: [{ staff_id: sam.id }] });
    assert.equal((await post(leavePOST, '/api/admin/planner/leave', { staff_id: pri.id, start_date: day(3), end_date: day(4), reason: 'leave' })).status, 201);
    await addJob({ location_id: ground.id, date: day(4), start_minutes: 600, end_minutes: 660, staff: [{ staff_id: pri.id }] });

    const jobs = (await getWeek()).body.jobs as { date: string; start_minutes: number; issues: { kind: string; message: string }[] }[];
    const at = (d: string, m: number) => jobs.find((j) => j.date === d && j.start_minutes === m)!.issues.map((i) => i.kind);
    assert.deepEqual(at(day(0), 540), ['overlap']);
    assert.deepEqual(at(day(0), 720), ['overlap']);
    assert.deepEqual(at(day(2), 390), ['travel']);
    assert.deepEqual(at(day(2), 490), ['travel']);
    assert.deepEqual(at(day(2), 900), [], 'plenty of time before the later job');
    assert.deepEqual(at(day(4), 600), ['leave']);
  });

  it('arranges cover, and copies a week forward with covers undone', async () => {
    const { sam, pri, ground } = await setup();
    const job = (await addJob({ location_id: ground.id, date: day(3), start_minutes: 1080, end_minutes: 1170, staff: [{ staff_id: sam.id }] })).body.job;
    const r = await jobPATCH(req(`/api/admin/planner/jobs/${job.id}`, { method: 'PATCH', body: { staff: [{ staff_id: pri.id, covering_for_staff_id: sam.id, cover_reason: 'Away at a meeting' }] }, cookie: await adminCookie('manager') }), ctx(job.id));
    assert.equal(r.status, 200);
    const [a] = (await getWeek()).body.jobs[0].assignments;
    assert.equal(a.staff_id, pri.id);
    assert.equal(a.covering_for_staff_id, sam.id);
    assert.equal(a.cover_reason, 'Away at a meeting');

    const copied = await post(copyPOST, '/api/admin/planner/copy', { from: WEEK, to: addDays(WEEK, 7) });
    assert.equal(copied.status, 201);
    assert.equal(copied.body.copied, 1);
    const next = (await getWeek('owner', addDays(WEEK, 7))).body;
    assert.equal(next.jobs[0].date, addDays(day(3), 7));
    assert.deepEqual(next.jobs[0].assignments.map((x: { staff_id: string; covering_for_staff_id: string | null }) => [x.staff_id, x.covering_for_staff_id]), [[sam.id, null]]);
    assert.equal((await post(copyPOST, '/api/admin/planner/copy', { from: WEEK, to: addDays(WEEK, 7) })).status, 409, 'never copies on top of an existing week');
  });
});

describe('Staff planner – several days and repeating weeks', () => {
  beforeEach(() => freshDb());

  it('works out the dates: chosen weekdays of the week, then every week until the end date', () => {
    const mon = '2026-11-30';
    assert.deepEqual(expandDates('2026-12-02'), ['2026-12-02'], 'no days or repeat: just the day');
    assert.deepEqual(expandDates('2026-12-02', [1, 3, 5]), ['2026-11-30', '2026-12-02', '2026-12-04'], 'all chosen days of that week');
    assert.deepEqual(expandDates(mon, [2, 4], '2026-12-17'), ['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10', '2026-12-15', '2026-12-17']);
    assert.deepEqual(expandDates(mon, null, '2026-12-21'), ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21'], 'same weekday every week');
    assert.equal(expandDates(mon, [1, 2, 3, 4, 5], '2027-02-26').length, 65, 'a school term of weekdays');
    assert.throws(() => expandDates(mon, null, '2028-01-01'), /a year at most/);
  });

  it('adds a repeating job as one series, and changes or deletes "this and following"', async () => {
    const { sam, pri, ground } = await setup();
    const r = await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }], days: [1, 3, 5], repeat_until: addDays(WEEK, 27) });
    assert.equal(r.status, 201);
    assert.equal(r.body.created, 12, '3 days x 4 weeks');
    const all = await db().list('planner_jobs', { orderBy: 'starts_at', ascending: true });
    assert.equal(all.length, 12);
    assert.ok(all.every((j) => j.series_id && j.series_id === all[0].series_id));
    assert.equal((await getWeek()).body.jobs.length, 3);
    assert.equal((await getWeek('owner', addDays(WEEK, 21))).body.jobs.length, 3);

    // From week 2 on, Priya takes over and it starts later. Week 1 is untouched.
    const wk2wed = all[4];
    const p = await jobPATCH(req(`/api/admin/planner/jobs/${wk2wed.id}`, { method: 'PATCH', body: { start_minutes: 420, end_minutes: 510, staff: [{ staff_id: pri.id }], scope: 'following' }, cookie: await adminCookie('owner') }), ctx(wk2wed.id));
    assert.equal((await p.json()).updated, 8, 'Wed of week 2 to the end');
    const after = (await getWeek('owner', addDays(WEEK, 7))).body.jobs as { date: string; start_minutes: number; assignments: { staff_id: string }[] }[];
    assert.deepEqual(after.map((j) => [j.date, j.start_minutes, j.assignments[0].staff_id]), [
      [addDays(WEEK, 7), 390, sam.id],
      [addDays(WEEK, 9), 420, pri.id],
      [addDays(WEEK, 11), 420, pri.id],
    ]);
    assert.equal((await getWeek()).body.jobs[0].start_minutes, 390);

    // Changing just one leaves the rest alone.
    const one = all[0];
    await jobPATCH(req(`/api/admin/planner/jobs/${one.id}`, { method: 'PATCH', body: { title: 'Changed once' }, cookie: await adminCookie('owner') }), ctx(one.id));
    assert.equal((await db().list('planner_jobs')).filter((j) => j.title === 'Changed once').length, 1);

    // Delete the last two weeks only.
    const wk3mon = (await db().list('planner_jobs', { orderBy: 'starts_at', ascending: true }))[6];
    const d = await jobDELETE(req(`/api/admin/planner/jobs/${wk3mon.id}?scope=following`, { method: 'DELETE', cookie: await adminCookie('owner') }), ctx(wk3mon.id));
    assert.equal((await d.json()).deleted, 6);
    assert.equal((await db().list('planner_jobs')).length, 6);
    assert.equal((await db().list('planner_assignments')).length, 6);
  });

  it('refuses to add more than 200 jobs at once', async () => {
    const { sam, ground } = await setup();
    const r = await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }], days: [1, 2, 3, 4, 5, 6, 7], repeat_until: addDays(WEEK, 7 * 30) });
    assert.equal(r.status, 422);
    assert.match(r.body.error, /the most at once is 200/);
    assert.equal((await db().list('planner_jobs')).length, 0);
  });
});

describe('Staff planner – telling staff', () => {
  beforeEach(() => freshDb(RESEND));

  it('publishes a week to everyone on it, then sends only changes to the people affected', async () => {
    const { sam, pri, alex, home, ground } = await setup();
    const j1 = (await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, notes: 'Bring GPS vests', staff: [{ staff_id: sam.id }, { staff_id: pri.id }] })).body.job;
    await addJob({ title: 'Massage clinic', job_type: 'massage_clinic', location_id: home.id, date: day(1), start_minutes: 960, end_minutes: 1200, staff: [{ staff_id: alex.id }] });
    let week = (await getWeek()).body;
    assert.equal(week.published_at, null);
    assert.equal(week.pending_changes, 0, 'drafts do not collect changes');

    let calls = resend();
    let r = await post(publishPOST, '/api/admin/planner/publish', { week_start: WEEK });
    assert.equal(r.status, 200);
    assert.equal(r.body.mode, 'published');
    assert.equal(r.body.sent, 2);
    assert.deepEqual(r.body.no_email, ['Alex Therapist']);
    const toSam = calls.map(mail).find((m) => m.to[0] === 'sam@example.com')!;
    assert.match(toSam.subject, /^Your ASPARC week/);
    assert.match(toSam.text, /Pre-season S&C/);
    assert.match(toSam.text, /Club ground, 1 Test St/);
    assert.match(toSam.text, /Access: Gate code 1234/);
    assert.match(toSam.text, /With: Priya Coach/);
    assert.match(toSam.text, /Bring GPS vests/);
    assert.match(toSam.text, /\/api\/planner\/confirm\//);
    assert.match(toSam.text, /\/api\/calendar\/staff\/[A-Za-z0-9_-]{40,}\.ics/);
    assert.ok(!toSam.text.includes('Massage clinic'), 'each person only gets their own jobs');
    assert.equal((await post(publishPOST, '/api/admin/planner/publish', { week_start: WEEK })).status, 422, 'nothing new to send');

    // Swap Priya for Alex on the first job, and move it later.
    await jobPATCH(req(`/api/admin/planner/jobs/${j1.id}`, { method: 'PATCH', body: { start_minutes: 420, end_minutes: 510, staff: [{ staff_id: sam.id }, { staff_id: alex.id }] }, cookie: await adminCookie('owner') }), ctx(j1.id));
    week = (await getWeek()).body;
    assert.deepEqual(new Set(week.pending_staff_ids), new Set([sam.id, pri.id, alex.id]));

    calls = resend();
    r = await post(publishPOST, '/api/admin/planner/publish', { week_start: WEEK });
    assert.equal(r.body.mode, 'updates');
    assert.equal(r.body.recipients, 3);
    const priMail = calls.map(mail).find((m) => m.to[0] === 'priya@example.com')!;
    assert.match(priMail.subject, /^Change to your ASPARC week/);
    assert.match(priMail.text, /Taken off: .*Pre-season S&C/);
    assert.match(priMail.text, /You have no jobs left this week/);
    const samMail = calls.map(mail).find((m) => m.to[0] === 'sam@example.com')!;
    assert.match(samMail.text, /Changed: .*7:00 am/);
    assert.equal((await getWeek()).body.pending_changes, 0);

    // Deleting a job tells the people who were on it.
    await jobDELETE(req(`/api/admin/planner/jobs/${j1.id}`, { method: 'DELETE', cookie: await adminCookie('owner') }), ctx(j1.id));
    assert.deepEqual(new Set((await getWeek()).body.pending_staff_ids), new Set([sam.id, alex.id]));
  });

  it('lets staff confirm from the email link, which needs a button press and a valid signature', async () => {
    const { sam, ground } = await setup();
    await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] });
    const token = confirmToken(sam.id, WEEK);
    const c = { params: Promise.resolve({ token }) };
    const page = await confirmGET(req(`/api/planner/confirm/${token}`), c);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<form method="post">/);
    assert.equal((await getWeek()).body.jobs[0].assignments[0].acknowledged_at, null, 'opening the link alone confirms nothing');
    const done = await confirmPOST(req(`/api/planner/confirm/${token}`, { method: 'POST' }), { params: Promise.resolve({ token }) });
    assert.match(await done.text(), /1 job confirmed/);
    assert.ok((await getWeek()).body.jobs[0].assignments[0].acknowledged_at);

    const forged = token.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    assert.equal((await confirmPOST(req('/x', { method: 'POST' }), { params: Promise.resolve({ token: forged }) })).status, 410);
    const expired = confirmToken(sam.id, WEEK, Date.now() - 30 * 86400000);
    assert.equal((await confirmGET(req('/x'), { params: Promise.resolve({ token: expired }) })).status, 410);
  });

  it('serves each person a calendar feed of published weeks only, and a rotated link stops working', async () => {
    const { sam, ground } = await setup();
    await addJob({ title: 'Match day, U18s; away', location_id: ground.id, date: day(5), start_minutes: 480, end_minutes: 720, staff: [{ staff_id: sam.id }] });
    const token = (await db().get('staff_members', sam.id))!.calendar_token;
    const feed = async (t = token) => calendarGET(req(`/api/calendar/staff/${t}.ics`), { params: Promise.resolve({ token: `${t}.ics` }) });
    let r = await feed();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/calendar; charset=utf-8');
    assert.ok(!(await r.text()).includes('BEGIN:VEVENT'), 'a draft week is not in anyone’s calendar');

    resend();
    await post(publishPOST, '/api/admin/planner/publish', { week_start: WEEK });
    const ics = await (await feed()).text();
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /SUMMARY:Match day\\, U18s\\; away\r\n/);
    assert.match(ics, new RegExp(`DTSTART:${localToUtc(day(5), 480).toISOString().replace(/[-:]/g, '').replace('.000', '')}`));
    assert.match(ics, /LOCATION:Club ground\\, 1 Test St/);
    assert.match(ics.replace(/\r\n /g, ''), new RegExp(`UID:[0-9a-f-]+-${sam.id}@asparc.com.au`), 'long lines unfold to the full UID');
    assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines are folded');

    await staffPATCH(req(`/api/admin/planner/staff/${sam.id}`, { method: 'PATCH', body: { rotate_calendar_link: true }, cookie: await adminCookie('owner') }), ctx(sam.id));
    assert.equal((await feed()).status, 404);
    assert.equal(await buildCalendarFeed('short'), null);
  });

  it('sends the evening-before reminder once, at 6 pm Melbourne time, for published weeks', async () => {
    const { sam, pri, ground } = await setup();
    await addJob({ location_id: ground.id, date: day(2), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] });
    await addJob({ location_id: ground.id, date: day(3), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: pri.id }] });
    const sixPm = localToUtc(day(1), 18 * 60 + 2);
    let calls = resend();
    assert.equal((await runDayBeforeReminders(sixPm)).skipped, 'week not published');
    await post(publishPOST, '/api/admin/planner/publish', { week_start: WEEK });

    calls = resend();
    assert.equal((await runDayBeforeReminders(localToUtc(day(1), 17 * 60 + 2))).skipped, 'not reminder time');
    const r = await runDayBeforeReminders(sixPm);
    assert.equal(r.sent, 1);
    assert.equal(calls.length, 1);
    assert.equal(mail(calls[0]).to[0], 'sam@example.com');
    assert.match(mail(calls[0]).subject, /^Tomorrow at ASPARC: Club ground/);
    assert.equal((await runDayBeforeReminders(sixPm)).sent, 0, 'never twice for the same day');

    // The cron route needs the secret.
    freshDb({ ...RESEND, CRON_SECRET: 'cron-secret' });
    assert.equal((await cronGET(req('/api/cron/staff-reminders'))).status, 401);
    assert.equal((await cronGET(req('/api/cron/staff-reminders', { headers: { authorization: 'Bearer cron-secret' } }))).status, 200);
  });
});

describe('Staff planner – My week', () => {
  beforeEach(() => freshDb());

  it('shows people their own jobs once their login is linked, and lets them confirm', async () => {
    const { sam, pri, ground } = await setup();
    await addJob({ location_id: ground.id, date: day(0), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: sam.id }] });
    await addJob({ location_id: ground.id, date: day(1), start_minutes: 390, end_minutes: 480, staff: [{ staff_id: pri.id }] });
    const login = await db().insert('admin_users', { email: 'sam.login@asparc.com.au', role: 'staff' });
    const cookie = await cookieFor('staff', login.id, 'sam.login@asparc.com.au');

    let r = await json(await myWeekGET(req(`/api/admin/planner/my-week?week=${WEEK}`, { cookie })));
    assert.equal(r.body.linked, false);
    assert.equal((await json(await myWeekPOST(req('/api/admin/planner/my-week', { body: { week_start: WEEK }, cookie })))).status, 409);

    // Only planners can link logins, and one login can't belong to two people.
    assert.equal((await staffPATCH(req(`/api/admin/planner/staff/${sam.id}`, { method: 'PATCH', body: { admin_user_id: login.id }, cookie: await adminCookie('staff') }), ctx(sam.id))).status, 403);
    assert.equal((await staffPATCH(req(`/api/admin/planner/staff/${sam.id}`, { method: 'PATCH', body: { admin_user_id: login.id }, cookie: await adminCookie('owner') }), ctx(sam.id))).status, 200);
    assert.equal((await staffPATCH(req(`/api/admin/planner/staff/${pri.id}`, { method: 'PATCH', body: { admin_user_id: login.id }, cookie: await adminCookie('owner') }), ctx(pri.id))).status, 422);

    r = await json(await myWeekGET(req(`/api/admin/planner/my-week?week=${WEEK}&staff=${pri.id}`, { cookie })));
    assert.equal(r.body.me.id, sam.id, 'staff can’t open someone else’s week');
    assert.equal(r.body.jobs.length, 1);
    assert.match(r.body.calendar_url, /\/api\/calendar\/staff\/.+\.ics$/);
    const confirmed = await json(await myWeekPOST(req('/api/admin/planner/my-week', { body: { week_start: WEEK }, cookie })));
    assert.equal(confirmed.body.confirmed, 1);

    const manager = await json(await myWeekGET(req(`/api/admin/planner/my-week?week=${WEEK}&staff=${pri.id}`, { cookie: await adminCookie('manager') })));
    assert.equal(manager.body.me.id, pri.id, 'planners can look at anyone’s week');
    assert.equal(manager.body.jobs.length, 1);

    const list = await json(await staffGET(req('/api/admin/planner/staff', { cookie })));
    assert.equal(list.body.logins, undefined);
    assert.equal(list.body.staff[0].calendar_url, undefined);
  });
});
