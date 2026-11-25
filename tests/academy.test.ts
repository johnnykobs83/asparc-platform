import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GET as academyGET, POST as enrolPOST } from '../app/api/academy/route';
import { GET as staffGET } from '../app/api/admin/football-academy/route';
import { PATCH as enrolmentPATCH } from '../app/api/admin/football-academy/enrolments/[id]/route';
import { PATCH as sessionPATCH } from '../app/api/admin/football-academy/sessions/[id]/route';
import { DELETE as customerDELETE } from '../app/api/admin/customers/[id]/route';
import { POST as stripePOST } from '../app/api/webhooks/stripe/route';
import { createHmac } from 'node:crypto';
import { ageOn, groupsForAge } from '../lib/academy/config';
import { db } from '../lib/db';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, mockFetch, req, type FetchCall } from './helpers';

const RESEND = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'ASPARC <bookings@asparc.com.au>' };
const resend = () => mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'email_1' } })]]);
const mail = (c: FetchCall) => c.body as { to: string[]; subject: string; text: string };
const dobForAge = (age: number) => addDays(melbourneDate(), -(age * 365 + 120));

type Session = { id: string; group_key: string; weekday: number; start_minutes: number; places_left: number; full: boolean };
const timetable = async () => (await academyGET(req('/api/academy'))).json() as Promise<{ sessions: Session[]; packages: { key: string; price_cents: number | null }[]; term: string }>;
const pick = async (group: string, weekday?: number) => (await timetable()).sessions.find((s) => s.group_key === group && (weekday == null || s.weekday === weekday))!;
const enrol = async (over: Record<string, unknown>) =>
  enrolPOST(
    req('/api/academy', {
      body: {
        parent_name: 'Pat Parent',
        email: 'pat@example.com',
        phone: '0400 123 456',
        athlete_name: 'Alex Athlete',
        athlete_dob: dobForAge(9),
        group_key: 'foundation',
        package: 'term_1x',
        session_ids: [(await pick('foundation', 1)).id],
        guardian_consent: true,
        ...over,
      },
    }),
  );
/** Next date (YYYY-MM-DD) that falls on an ISO weekday (1 = Monday). */
const nextWeekday = (wd: number) => {
  for (let i = 1; i < 8; i++) {
    const d = addDays(melbourneDate(), i);
    if (((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 === wd) return d;
  }
  throw new Error('no date');
};

describe('Football Performance Academy – timetable and packages', () => {
  beforeEach(() => freshDb(RESEND));

  it('has the owner’s 16 weekly sessions, 12 places each, and the four packages with prices', async () => {
    const t = await timetable();
    assert.equal(t.sessions.length, 16);
    assert.ok(t.sessions.every((s) => s.places_left === 12));
    assert.deepEqual(
      t.sessions.filter((s) => s.weekday === 6).map((s) => [s.start_minutes, s.group_key]),
      [[490, 'foundation'], [540, 'athletic'], [590, 'performance']],
    );
    assert.deepEqual(t.packages.map((p) => [p.key, p.price_cents]), [['term_1x', 38000], ['term_2x', 60000], ['annual', 120000], ['casual', 4500]]);
    assert.equal(t.term, 'Term 1 2027');
  });

  it('works out the groups for an age, with 11-year-olds able to choose either', () => {
    assert.deepEqual(groupsForAge(9).map((g) => g.key), ['foundation']);
    assert.deepEqual(groupsForAge(11).map((g) => g.key), ['foundation', 'athletic']);
    assert.deepEqual(groupsForAge(15).map((g) => g.key), ['performance']);
    assert.deepEqual(groupsForAge(17), []);
    assert.equal(ageOn('2015-06-01', '2026-11-25'), 11);
    assert.equal(ageOn('2015-12-01', '2026-11-25'), 10);
  });
});

describe('Football Performance Academy – enrolling', () => {
  beforeEach(() => freshDb(RESEND));

  it('enrols a child, holds the place, emails the parent and tells the team', async () => {
    const calls = resend();
    const r = await enrol({});
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.status, 'awaiting_payment');
    assert.equal(body.price_cents, 38000);
    assert.equal((await pick('foundation', 1)).places_left, 11);
    const parentMail = calls.map(mail).find((m) => /place in the ASPARC Football Performance Academy/.test(m.subject))!;
    assert.deepEqual(parentMail.to, ['pat@example.com']);
    assert.match(parentMail.text, /Foundation Movers \(8–11\)/);
    assert.match(parentMail.text, /Monday 4:30pm–5:20pm/);
    assert.match(parentMail.text, /Starts Term 1 2027 at Avenger Park/);
    assert.ok(calls.map(mail).some((m) => /pre-visit form/.test(m.subject)), 'the health form goes out too');
    const n = (await db().list('notifications'))[0];
    assert.match(n.title, /New Academy enrolment: Alex Athlete – Foundation Movers/);
    const parent = (await db().findOne('customers', { email: 'pat@example.com' }))!;
    assert.equal(parent.is_guardian, true);
  });

  it('checks the age fits the group, two different days for 2× a week, and the date for a casual session', async () => {
    resend();
    let r = await enrol({ athlete_dob: dobForAge(15) });
    assert.equal(r.status, 422);
    assert.match((await r.json()).fields.group_key, /8–11 year olds/);

    const tue = await pick('foundation', 2);
    r = await enrol({ package: 'term_2x', session_ids: [tue.id] });
    assert.match((await r.json()).fields.session_ids, /two sessions/);
    r = await enrol({ package: 'term_2x', session_ids: [(await pick('athletic', 2)).id, tue.id] });
    assert.match((await r.json()).fields.session_ids, /Foundation Movers sessions/);
    r = await enrol({ package: 'term_2x', session_ids: [tue.id, (await pick('foundation', 4)).id] });
    assert.equal(r.status, 201);

    r = await enrol({ package: 'casual', session_ids: [tue.id], casual_date: nextWeekday(3) });
    assert.match((await r.json()).fields.casual_date, /isn’t a Tuesday/);
    r = await enrol({ package: 'casual', session_ids: [tue.id], casual_date: nextWeekday(2) });
    assert.equal(r.status, 201);
    assert.equal((await pick('foundation', 2)).places_left, 11, 'a casual visit doesn’t take a weekly place');
    assert.equal((await enrol({ guardian_consent: false })).status, 422);
  });

  it('puts the 13th child on the waitlist, and a cancelled place frees up', async () => {
    resend();
    const mon = await pick('foundation', 1);
    await db().update('academy_sessions', mon.id, { capacity: 2 });
    const a = await (await enrol({ athlete_name: 'Kid One' })).json();
    await enrol({ athlete_name: 'Kid Two', email: 'two@example.com' });
    assert.equal((await pick('foundation', 1)).full, true);
    const third = await (await enrol({ athlete_name: 'Kid Three', email: 'three@example.com' })).json();
    assert.equal(third.status, 'waitlist');
    assert.equal(third.pay_url, null);

    const cookie = await adminCookie('staff');
    await enrolmentPATCH(req(`/api/admin/football-academy/enrolments/${a.id}`, { method: 'PATCH', body: { status: 'cancelled' }, cookie }), ctx(a.id));
    assert.equal((await pick('foundation', 1)).places_left, 1);
  });

  it('adds the payment link with the enrolment reference when one is set up', async () => {
    resend();
    await timetable();
    const s = (await db().findOne('services', { slug: 'performance-academy' }))!;
    await db().update('services', s.id, { payment_link_url: 'https://buy.stripe.com/test_abc', price_status: 'approved' });
    const r = await (await enrol({})).json();
    assert.match(r.pay_url, /^https:\/\/buy\.stripe\.com\/test_abc\?client_reference_id=[0-9a-f-]{36}&prefilled_email=pat%40example\.com$/);
  });
});

describe('Football Performance Academy – dashboard', () => {
  beforeEach(() => freshDb(RESEND));

  it('shows places taken and enrolments to staff, lets them mark paid, and only managers change places', async () => {
    resend();
    const e = await (await enrol({})).json();
    assert.equal((await staffGET(req('/api/admin/football-academy'))).status, 401);
    const cookie = await adminCookie('staff');
    const data = await (await staffGET(req('/api/admin/football-academy', { cookie }))).json();
    assert.equal(data.enrolments.length, 1);
    assert.equal(data.enrolments[0].parent.email, 'pat@example.com');
    assert.equal(data.sessions.find((s: { weekday: number; group_key: string }) => s.weekday === 1).taken, 1);

    const paid = await (await enrolmentPATCH(req(`/api/admin/football-academy/enrolments/${e.id}`, { method: 'PATCH', body: { paid: true, payment_ref: 'Bank transfer 26/11' }, cookie }), ctx(e.id))).json();
    assert.equal(paid.enrolment.status, 'confirmed');
    assert.ok(paid.enrolment.paid_at);

    const sid = data.sessions[0].id;
    assert.equal((await sessionPATCH(req(`/api/admin/football-academy/sessions/${sid}`, { method: 'PATCH', body: { capacity: 14 }, cookie }), ctx(sid))).status, 403);
    assert.equal((await sessionPATCH(req(`/api/admin/football-academy/sessions/${sid}`, { method: 'PATCH', body: { capacity: 14 }, cookie: await adminCookie('manager') }), ctx(sid))).status, 200);
  });

  it('a privacy deletion removes the family’s enrolments', async () => {
    resend();
    await enrol({});
    const parent = (await db().findOne('customers', { email: 'pat@example.com' }))!;
    await customerDELETE(req(`/api/admin/customers/${parent.id}`, { method: 'DELETE', cookie: await adminCookie('owner') }), ctx(parent.id));
    assert.equal((await db().list('academy_enrolments')).length, 0);
  });
});

describe('Football Performance Academy – paying online', () => {
  const WHSEC = 'whsec_test_secret_value';
  const signed = (event: unknown) => {
    const body = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex');
    return new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' }, body });
  };
  beforeEach(() => freshDb({ ...RESEND, STRIPE_WEBHOOK_SECRET: WHSEC }));

  it('confirms the place when Stripe reports the payment for that enrolment, once', async () => {
    resend();
    const e = await (await enrol({})).json();
    const event = (id: string) => ({
      id,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_test_9', payment_intent: 'pi_test_9', client_reference_id: e.id, amount_total: 29900, currency: 'aud', payment_status: 'paid', customer_details: { email: 'pat@example.com' }, metadata: { service_slug: 'performance-academy' } } },
    });
    assert.equal((await stripePOST(signed(event('evt_1')))).status, 200);
    let row = (await db().get('academy_enrolments', e.id))!;
    assert.equal(row.status, 'confirmed');
    assert.ok(row.paid_at);
    assert.equal(row.payment_ref, 'pi_test_9');
    const n = (await db().list('notifications')).find((x) => /Payment received/.test(x.title))!;
    assert.match(n.body, /Academy place confirmed for Alex Athlete/);
    const firstPaid = row.paid_at;
    await stripePOST(signed(event('evt_2')));
    row = (await db().get('academy_enrolments', e.id))!;
    assert.equal(row.paid_at, firstPaid, 'a repeated event changes nothing');
    const payment = (await db().list('payments'))[0];
    assert.equal(payment.customer_id, row.customer_id);
  });
});
