import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { POST as apptPOST } from '../app/api/admin/appointments/route';
import { DELETE as customerDELETE } from '../app/api/admin/customers/[id]/route';
import { GET as clientsGET, POST as clientsPOST } from '../app/api/admin/clients/route';
import { GET as clientGET, PATCH as clientPATCH } from '../app/api/admin/clients/[id]/route';
import { POST as notesPOST } from '../app/api/admin/clients/[id]/notes/route';
import { POST as formPOST } from '../app/api/admin/clients/[id]/pre-visit-form/route';
import { PATCH as reviewPATCH } from '../app/api/admin/intake/[id]/route';
import { PATCH as practitionerPATCH } from '../app/api/admin/practitioners/[id]/route';
import { GET as intakeGET, POST as intakePOST } from '../app/api/intake/[token]/route';
import { melbourneLocalToUtc } from '../lib/bookings/service';
import { addMonths, formFlag, readIntakeToken } from '../lib/clients/intake';
import { SCREENING_QUESTIONS } from '../lib/clients/screening';
import { db } from '../lib/db';
import type { Practitioner, Service } from '../lib/db/types';
import { listServices } from '../lib/kb/service';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, mockFetch, req, type FetchCall } from './helpers';

const ALL_WEEK = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: 360, end: 1200 }]]));
const DAY = addDays(melbourneDate(), 3);
const RESEND = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'ASPARC <bookings@asparc.com.au>' };
const STAFF_SUB = '00000000-0000-4000-8000-000000000005'; // adminCookie('staff')

type Mail = { to: string[]; subject: string; text: string; html: string };
const mail = (c: FetchCall) => c.body as Mail;
const resend = () => mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'email_1' } })]]);
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const linkIn = (m: Mail) => m.text.match(/https:\/\/www\.asparc\.com\.au\/pre-visit\/(\S+)/)![1];

async function setup(): Promise<{ p: Practitioner; s60: Service }> {
  const all = await listServices();
  const s60 = (await db().update('services', all.find((x) => x.slug === 'remedial-massage-60')!.id, { availability: 'available' }))!;
  const p = await db().insert('practitioners', { name: 'Test Therapist', service_ids: [s60.id], weekly_hours: ALL_WEEK });
  return { p, s60 };
}
const book = async (body: Record<string, unknown>, role: 'owner' | 'manager' | 'staff' = 'staff') => apptPOST(req('/api/admin/appointments', { body, cookie: await adminCookie(role) }));
const as = async (role: 'owner' | 'manager' | 'staff') => adminCookie(role);

const allNo = Object.fromEntries(SCREENING_QUESTIONS.map((q) => [q.key, false]));
const goodForm = (over: Record<string, unknown> = {}) => ({
  for_whom: 'self',
  full_name: 'Jess Runner',
  email: 'jess@example.com',
  phone: '0400 123 456',
  date_of_birth: '1995-04-02',
  address: 'Epping VIC',
  emergency_contact_name: 'Sam Runner',
  emergency_contact_phone: '0400 999 888',
  sport: 'Football',
  club: 'Avondale FC',
  goals: 'Get back to full training',
  heard_about: 'club',
  screening: allNo,
  injuries: 'Left hamstring strain in September',
  medications: 'None',
  consent_health: true,
  consent_risk: true,
  consent_marketing: true,
  signature_name: 'Jess Runner',
  ...over,
});

/** Books Jess, returns the emailed form link's token. */
async function bookJess() {
  const { p, s60 } = await setup();
  const calls = resend();
  const r = await (await book({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600, full_name: 'Jess Runner', email: 'jess@example.com', phone: '0400 123 456' })).json();
  const formMail = calls.map(mail).find((m) => /pre-visit form/.test(m.subject))!;
  const customer = (await db().findOne('customers', { email: 'jess@example.com' }))!;
  return { p, s60, r, calls, formMail, token: linkIn(formMail), customer };
}

describe('Client database', () => {
  beforeEach(() => freshDb(RESEND));

  it('lists every client with visits, next visit and form status, and searches by name, email or mobile', async () => {
    const { customer } = await bookJess();
    await db().insert('customers', { full_name: 'Other Person', email: 'other@example.com', phone: '0411 000 111', source: 'other' });
    const list = (await (await clientsGET(req('/api/admin/clients', { cookie: await as('staff') }))).json()).clients;
    assert.equal(list.length, 2);
    const jess = list.find((c: { id: string }) => c.id === customer.id);
    assert.equal(jess.bookings, 1);
    assert.equal(jess.form, 'sent');
    assert.ok(jess.next_visit);
    for (const q of ['jess', 'JESS@EXAMPLE', '0400123', '0400 123']) {
      const hits = (await (await clientsGET(req(`/api/admin/clients?q=${encodeURIComponent(q)}&limit=8`, { cookie: await as('staff') }))).json()).clients;
      assert.deepEqual(hits.map((c: { id: string }) => c.id), [customer.id], q);
    }
  });

  it('staff can add and edit a client, and duplicates by email are refused', async () => {
    const cookie = await as('staff');
    const r = await clientsPOST(req('/api/admin/clients', { body: { full_name: 'Walk In', phone: '0422 333 444', sport: 'Netball' }, cookie }));
    assert.equal(r.status, 201);
    const id = (await r.json()).client.id;
    assert.equal((await clientsPOST(req('/api/admin/clients', { body: { full_name: 'No Contact' }, cookie }))).status, 422);
    const p = await clientPATCH(req(`/api/admin/clients/${id}`, { method: 'PATCH', body: { email: 'walkin@example.com', club: 'Epping Netball', date_of_birth: '2001-01-31' }, cookie }), ctx(id));
    assert.equal(p.status, 200);
    const c = (await db().get('customers', id))!;
    assert.deepEqual([c.email, c.club, c.date_of_birth, c.sport], ['walkin@example.com', 'Epping Netball', '2001-01-31', 'Netball']);
    await db().insert('customers', { full_name: 'Taken', email: 'taken@example.com', source: 'other' });
    assert.equal((await clientPATCH(req(`/api/admin/clients/${id}`, { method: 'PATCH', body: { email: 'taken@example.com' }, cookie }), ctx(id))).status, 409);
    assert.equal((await clientPATCH(req(`/api/admin/clients/${id}`, { method: 'PATCH', body: { email: null, phone: null }, cookie }), ctx(id))).status, 422);
  });

  it('a booking for a client picked from the database keeps one record', async () => {
    const { p, s60, customer } = await bookJess();
    const before = (await db().list('customers')).length;
    const r = await book({ practitioner_id: p.id, service_id: s60.id, date: addDays(DAY, 1), minutes: 600, full_name: 'Jess R', phone: '0499 999 999', customer_id: customer.id });
    assert.equal(r.status, 201);
    assert.equal((await db().list('customers')).length, before);
    const appts = await db().list('appointments', { eq: { customer_id: customer.id } });
    assert.equal(appts.length, 2);
    assert.equal((await db().get('customers', customer.id))!.phone, '0400 123 456'); // existing details are kept
    assert.equal((await book({ practitioner_id: p.id, service_id: s60.id, date: addDays(DAY, 2), minutes: 600, full_name: 'Ghost', phone: '0499 999 999', customer_id: '11111111-1111-4111-8111-111111111111' })).status, 404);
  });
});

describe('Pre-visit form – sending', () => {
  beforeEach(() => freshDb(RESEND));

  it('is emailed with a first booking: just a personal link, no health detail', async () => {
    const { r, formMail } = await bookJess();
    assert.equal(r.pre_visit_form, 'sent');
    assert.deepEqual(formMail.to, ['jess@example.com']);
    assert.match(formMail.text, /five minutes/);
    assert.match(formMail.html, /Fill in the form/);
    assert.ok(readIntakeToken(linkIn(formMail)));
  });

  it('is not sent again while one is waiting, or while a completed form is still current', async () => {
    const { p, s60, token } = await bookJess();
    const again = await (await book({ practitioner_id: p.id, service_id: s60.id, date: addDays(DAY, 1), minutes: 600, full_name: 'Jess Runner', email: 'jess@example.com' })).json();
    assert.equal(again.pre_visit_form, 'not_due');
    assert.equal((await intakePOST(req(`/api/intake/${token}`, { body: goodForm() }), tokenCtx(token))).status, 201);
    const third = await (await book({ practitioner_id: p.id, service_id: s60.id, date: addDays(DAY, 2), minutes: 600, full_name: 'Jess Runner', email: 'jess@example.com' })).json();
    assert.equal(third.pre_visit_form, 'not_due');
  });

  it('asks again once the last form is more than a year old', async () => {
    const { p, s60, token, customer } = await bookJess();
    await intakePOST(req(`/api/intake/${token}`, { body: goodForm() }), tokenCtx(token));
    const form = (await db().list('intake_forms', { eq: { customer_id: customer.id, status: 'submitted' } }))[0];
    await db().update('intake_forms', form.id, { valid_until: addDays(melbourneDate(), -1) });
    const calls = resend();
    const r = await (await book({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 900, full_name: 'Jess Runner', email: 'jess@example.com' })).json();
    assert.equal(r.pre_visit_form, 'sent');
    assert.match(calls.map(mail).find((m) => /health form/.test(m.subject))!.subject, /update your ASPARC health form/);
    const newest = (await db().list('intake_forms', { eq: { customer_id: customer.id, status: 'sent' } }))[0];
    assert.equal(newest.reason, 'yearly_recheck');
  });

  it('online bookings send it too', async () => {
    const { s60 } = await setup();
    const { POST: bookPOST } = await import('../app/api/bookings/route');
    const calls = resend();
    const r = await bookPOST(req('/api/bookings', { body: { service_id: s60.id, start: melbourneLocalToUtc(DAY, 600).toISOString(), full_name: 'Online Person', email: 'online@example.com', phone: '0400 111 222', consent_contact: true } }));
    assert.equal(r.status, 201);
    assert.ok(calls.map(mail).some((m) => /pre-visit form/.test(m.subject) && m.to[0] === 'online@example.com'));
  });

  it('staff can resend or copy a new link; the old link stops working', async () => {
    const { customer, token } = await bookJess();
    resend();
    const r = await formPOST(req(`/api/admin/clients/${customer.id}/pre-visit-form`, { body: { email: false }, cookie: await as('staff') }), ctx(customer.id));
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.email, 'no_email');
    assert.match(body.link, /\/pre-visit\//);
    assert.equal((await (await intakeGET(req(`/api/intake/${token}`), tokenCtx(token))).json()).state, 'expired');
    const fresh = body.link.split('/pre-visit/')[1];
    assert.equal((await (await intakeGET(req(`/api/intake/${fresh}`), tokenCtx(fresh))).json()).state, 'open');
  });
});

describe('Pre-visit form – filling it in', () => {
  beforeEach(() => freshDb(RESEND));

  it('opens with contact details pre-filled, never health answers', async () => {
    const { token } = await bookJess();
    const r = await (await intakeGET(req(`/api/intake/${token}`), tokenCtx(token))).json();
    assert.equal(r.state, 'open');
    assert.deepEqual(Object.keys(r.prefill).sort(), ['club', 'consent_marketing', 'email', 'full_name', 'phone', 'sport']);
    assert.equal(r.prefill.full_name, 'Jess Runner');
  });

  it('rejects tampered or made-up links', async () => {
    const { token } = await bookJess();
    const bad = `${token.slice(0, -2)}xx`;
    assert.equal((await (await intakeGET(req(`/api/intake/${bad}`), tokenCtx(bad))).json()).state, 'expired');
    assert.equal((await intakePOST(req(`/api/intake/${bad}`, { body: goodForm() }), tokenCtx(bad))).status, 410);
  });

  it('needs every screening question answered, both agreements and a signature', async () => {
    const { token } = await bookJess();
    const { heart: _h, ...missingOne } = allNo;
    const r = await intakePOST(req(`/api/intake/${token}`, { body: goodForm({ screening: missingOne, consent_risk: false, signature_name: '' }) }), tokenCtx(token));
    assert.equal(r.status, 422);
    const fields = (await r.json()).fields;
    assert.ok(fields['screening.heart']);
    assert.ok(fields.consent_risk);
    assert.ok(fields.signature_name);
    const child = await intakePOST(req(`/api/intake/${token}`, { body: goodForm({ for_whom: 'child', date_of_birth: undefined }) }), tokenCtx(token));
    assert.ok((await child.json()).fields.athlete_name);
  });

  it('saves contact details on the client record and health answers only on the form', async () => {
    const { token, customer } = await bookJess();
    const r = await intakePOST(req(`/api/intake/${token}`, { body: goodForm() }), tokenCtx(token));
    assert.equal(r.status, 201);
    assert.equal((await r.json()).needs_review, false);
    const c = (await db().get('customers', customer.id))!;
    assert.deepEqual([c.date_of_birth, c.emergency_contact_name, c.emergency_contact_phone, c.club, c.consent_marketing], ['1995-04-02', 'Sam Runner', '0400 999 888', 'Avondale FC', true]);
    assert.ok(c.consent_marketing_at);
    assert.ok(!JSON.stringify(c).includes('hamstring'));
    const f = (await db().list('intake_forms', { eq: { customer_id: customer.id, status: 'submitted' } }))[0];
    assert.equal(f.review_status, 'not_needed');
    assert.equal(f.health.injuries, 'Left hamstring strain in September');
    assert.equal(f.valid_until, addMonths(melbourneDate(), 12));
    // Only once.
    assert.equal((await intakePOST(req(`/api/intake/${token}`, { body: goodForm() }), tokenCtx(token))).status, 409);
    assert.equal((await (await intakeGET(req(`/api/intake/${token}`), tokenCtx(token))).json()).state, 'submitted');
  });

  it('any “yes” flags the form for review and tells the team without health detail', async () => {
    const { token, customer } = await bookJess();
    const calls = resend();
    const r = await intakePOST(req(`/api/intake/${token}`, { body: goodForm({ screening: { ...allNo, chest_pain: true }, screening_details: 'Tightness on hard runs' }) }), tokenCtx(token));
    assert.equal((await r.json()).needs_review, true);
    const n = (await db().list('notifications')).find((x) => /Pre-visit form needs review/.test(x.title))!;
    assert.equal(n.link_path, `/admin/clients?id=${customer.id}`);
    for (const text of [n.title, n.body, ...calls.map((c) => JSON.stringify(c.body))]) {
      assert.ok(!/chest|Tightness|hamstring/i.test(text), text);
    }
    const list = (await (await clientsGET(req('/api/admin/clients', { cookie: await as('staff') }))).json()).clients;
    assert.equal(list[0].form, 'needs_review');
  });

  it('a parent can fill it in for a child', async () => {
    const { token, customer } = await bookJess();
    const r = await intakePOST(req(`/api/intake/${token}`, { body: goodForm({ for_whom: 'child', date_of_birth: undefined, athlete_name: 'Kid Runner', athlete_dob: '2013-06-01' }) }), tokenCtx(token));
    assert.equal(r.status, 201);
    const f = (await db().list('intake_forms', { eq: { customer_id: customer.id, status: 'submitted' } }))[0];
    assert.deepEqual([f.for_whom, f.athlete_name, f.athlete_dob], ['child', 'Kid Runner', '2013-06-01']);
    const c = (await db().get('customers', customer.id))!;
    assert.equal(c.is_guardian, true);
    assert.equal(c.date_of_birth, null);
  });
});

describe('Pre-visit form – who can see health information', () => {
  beforeEach(() => freshDb(RESEND));

  async function flagged() {
    const ctxData = await bookJess();
    await intakePOST(req(`/api/intake/${ctxData.token}`, { body: goodForm({ screening: { ...allNo, heart: true } }) }), tokenCtx(ctxData.token));
    return ctxData;
  }
  const detail = async (id: string, role: 'owner' | 'manager' | 'staff') => (await clientGET(req(`/api/admin/clients/${id}`, { cookie: await as(role) }), ctx(id))).json();

  it('other staff see the booking history and the form status, not the answers', async () => {
    const { customer } = await flagged();
    const d = await detail(customer.id, 'staff');
    assert.equal(d.health_access, false);
    assert.equal(d.form, 'needs_review');
    assert.equal(d.appointments.length, 1);
    assert.equal(d.forms[0].screening, undefined);
    assert.equal(d.forms[0].health, undefined);
    assert.ok(!JSON.stringify(d).includes('hamstring'));
    assert.equal((await notesPOST(req(`/api/admin/clients/${customer.id}/notes`, { body: { body: 'x' }, cookie: await as('staff') }), ctx(customer.id))).status, 403);
    const f = d.forms.find((x: { status: string }) => x.status === 'submitted');
    assert.equal((await reviewPATCH(req(`/api/admin/intake/${f.id}`, { method: 'PATCH', body: { decision: 'cleared' }, cookie: await as('staff') }), ctx(f.id))).status, 403);
  });

  it('managers see everything and record the review', async () => {
    const { customer } = await flagged();
    const d = await detail(customer.id, 'manager');
    assert.equal(d.health_access, true);
    const f = d.forms.find((x: { status: string }) => x.status === 'submitted');
    assert.equal(f.screening.heart, true);
    assert.equal(f.health.injuries, 'Left hamstring strain in September');
    const r = await reviewPATCH(req(`/api/admin/intake/${f.id}`, { method: 'PATCH', body: { decision: 'cleared', note: 'GP letter received' }, cookie: await as('manager') }), ctx(f.id));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).form.review_status, 'cleared');
    assert.equal((await detail(customer.id, 'staff')).form, 'cleared');
    const n = await notesPOST(req(`/api/admin/clients/${customer.id}/notes`, { body: { body: 'Cleared for full training' }, cookie: await as('manager') }), ctx(customer.id));
    assert.equal(n.status, 201);
    assert.equal((await detail(customer.id, 'owner')).notes[0].body, 'Cleared for full training');
  });

  it('the practitioner on the client’s booking can see them once linked to their planner profile', async () => {
    const { customer, p } = await flagged();
    const me = await db().insert('staff_members', { full_name: 'Test Therapist', email: 'staff@asparc.test', admin_user_id: STAFF_SUB, calendar_token: 'tok_test_calendar_token_1234567890' });
    assert.equal((await detail(customer.id, 'staff')).health_access, false);
    const r = await practitionerPATCH(req(`/api/admin/practitioners/${p.id}`, { method: 'PATCH', body: { staff_member_id: me.id }, cookie: await as('owner') }), ctx(p.id));
    assert.equal(r.status, 200);
    const d = await detail(customer.id, 'staff');
    assert.equal(d.health_access, true);
    assert.equal(d.forms.find((x: { status: string }) => x.status === 'submitted').screening.heart, true);
    // A different client they have never seen stays hidden.
    const other = await db().insert('customers', { full_name: 'Not Theirs', email: 'nt@example.com', source: 'other' });
    assert.equal((await detail(other.id, 'staff')).health_access, false);
  });

  it('a privacy deletion removes the forms, notes and bookings too', async () => {
    const { customer } = await flagged();
    await notesPOST(req(`/api/admin/clients/${customer.id}/notes`, { body: { body: 'note' }, cookie: await as('owner') }), ctx(customer.id));
    const r = await customerDELETE(req(`/api/admin/customers/${customer.id}`, { method: 'DELETE', cookie: await as('owner') }), ctx(customer.id));
    assert.equal(r.status, 200);
    assert.equal((await db().list('intake_forms', { eq: { customer_id: customer.id } })).length, 0);
    assert.equal((await db().list('client_notes', { eq: { customer_id: customer.id } })).length, 0);
    assert.equal((await db().list('appointments', { eq: { customer_id: customer.id } })).length, 0);
  });
});

describe('Form status flag', () => {
  const base = { sent_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', submitted_at: null, valid_until: null, review_status: 'not_needed' as const };
  it('summarises a client’s forms in one safe label', () => {
    const today = '2026-11-25';
    assert.equal(formFlag([], today), 'missing');
    assert.equal(formFlag([{ ...base, status: 'sent' }], today), 'sent');
    assert.equal(formFlag([{ ...base, status: 'sent', expires_at: '2020-01-01T00:00:00Z' }], today), 'missing');
    const done = { ...base, status: 'submitted' as const, submitted_at: '2026-02-01T00:00:00Z', valid_until: '2027-02-01' };
    assert.equal(formFlag([done], today), 'complete');
    assert.equal(formFlag([{ ...done, review_status: 'needs_review' }], today), 'needs_review');
    assert.equal(formFlag([{ ...done, review_status: 'cleared' }], today), 'cleared');
    assert.equal(formFlag([{ ...done, review_status: 'not_cleared' }], today), 'not_cleared');
    assert.equal(formFlag([{ ...done, valid_until: '2026-11-24' }], today), 'expired');
    assert.equal(formFlag([{ ...done, valid_until: '2026-11-24' }, { ...base, status: 'sent' }], today), 'sent');
    assert.equal(addMonths('2026-11-25', 12), '2027-11-25');
  });
});

describe('Practitioner calendar colours', () => {
  beforeEach(() => freshDb());
  it('saves a chosen colour, clears it back to automatic, and refuses anything that is not a colour', async () => {
    const { p } = await setup();
    const patch = async (body: Record<string, unknown>) => practitionerPATCH(req(`/api/admin/practitioners/${p.id}`, { method: 'PATCH', body, cookie: await adminCookie('owner') }), ctx(p.id));
    assert.equal((await patch({ colour: '#c2185b' })).status, 200);
    assert.equal((await db().get('practitioners', p.id))!.colour, '#c2185b');
    assert.equal((await patch({ colour: null })).status, 200);
    assert.equal((await db().get('practitioners', p.id))!.colour, null);
    assert.equal((await patch({ colour: 'red; background:url(x)' })).status, 422);
  });
});
