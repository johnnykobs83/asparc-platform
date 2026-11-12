import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PATCH as apptPATCH } from '../app/api/admin/appointments/[id]/route';
import { GET as apptGET, POST as apptPOST } from '../app/api/admin/appointments/route';
import { POST as bookPOST } from '../app/api/bookings/route';
import { getAvailability, melbourneLocalToUtc } from '../lib/bookings/service';
import { db } from '../lib/db';
import type { Practitioner, Service } from '../lib/db/types';
import { listServices } from '../lib/kb/service';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, mockFetch, req, type FetchCall } from './helpers';

const ALL_WEEK = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: 360, end: 1200 }]]));
const DAY = addDays(melbourneDate(), 3);
const NEXT = addDays(melbourneDate(), 4);
const at = (minutes: number, day = DAY) => melbourneLocalToUtc(day, minutes).toISOString();
const RESEND = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'ASPARC <bookings@asparc.com.au>' };

async function setup(): Promise<{ p: Practitioner; s60: Service }> {
  const all = await listServices();
  const s60 = (await db().update('services', all.find((x) => x.slug === 'remedial-massage-60')!.id, { availability: 'available' }))!;
  const p = await db().insert('practitioners', { name: 'Test Therapist', service_ids: [s60.id], weekly_hours: ALL_WEEK });
  return { p, s60 };
}
const resend = () => mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'email_1' } })]]);
const mail = (c: FetchCall) => c.body as { to: string[]; subject: string; text: string; html: string; from: string };
const add = async (body: Record<string, unknown>, role: 'owner' | 'manager' | 'staff' | null = 'staff') => apptPOST(req('/api/admin/appointments', { body, cookie: role ? await adminCookie(role) : undefined }));
const patch = async (id: string, body: Record<string, unknown>) => apptPATCH(req(`/api/admin/appointments/${id}`, { method: 'PATCH', body, cookie: await adminCookie('staff') }), ctx(id));
const customerBooks = async (serviceId: string, minutes: number) =>
  bookPOST(req('/api/bookings', { body: { service_id: serviceId, start: at(minutes), full_name: 'Online Customer', email: 'online@example.com', phone: '0400 111 222', consent_contact: true } }));

describe('Staff add a booking on the schedule', () => {
  beforeEach(() => freshDb());

  it('books a listed service at its usual length and price, and blocks that time online', async () => {
    const { p, s60 } = await setup();
    const r = await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600, full_name: 'Phone Customer', phone: '0400 555 666' });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.customer_email, 'no_email');
    const a = (await db().list('appointments'))[0];
    assert.deepEqual([a.starts_at, a.ends_at, a.status, a.price_cents, a.final_price_cents], [at(600), at(660), 'confirmed', 10000, null]);
    assert.equal(a.source, 'staff:staff@asparc.test');
    const c = await db().get('customers', a.customer_id);
    assert.deepEqual([c?.full_name, c?.phone, c?.consent_contact, c?.consent_marketing], ['Phone Customer', '0400 555 666', true, false]);
    const online = (await getAvailability(s60.id, DAY, 1)).days[0].slots.map((x) => x.start);
    assert.ok(!online.includes(at(600)) && !online.includes(at(630)));
  });

  it('allows a one-off booking with its own name, length and price, outside normal hours', async () => {
    const { p } = await setup();
    const r = await add({ practitioner_id: p.id, service_name: 'Team testing session', duration_minutes: 90, date: DAY, minutes: 1230, full_name: 'Club Coach', email: 'Coach@Example.com', price_cents: 25000 });
    assert.equal(r.status, 201);
    const a = (await db().list('appointments'))[0];
    assert.deepEqual([a.service_name, a.service_id, a.starts_at, a.ends_at, a.final_price_cents], ['Team testing session', null, at(1230), at(1320), 25000]);
    assert.equal((await db().get('customers', a.customer_id))?.email, 'coach@example.com');
  });

  it('applies a discount entered when booking', async () => {
    const { p, s60 } = await setup();
    await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600, full_name: 'Member', email: 'member@example.com', price_cents: 8000 });
    const row = (await (await apptGET(req('/api/admin/appointments', { cookie: await adminCookie('staff') }))).json()).appointments[0];
    assert.deepEqual([row.list_price_cents, row.final_price_cents, row.charge_cents], [10000, 8000, 8000]);
  });

  it('never double-books, and reuses an existing customer by email', async () => {
    const { p, s60 } = await setup();
    await customerBooks(s60.id, 600);
    const clash = await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 630, full_name: 'Someone Else', phone: '0400 999 888' });
    assert.equal(clash.status, 409);
    assert.match((await clash.json()).error, /overlaps another booking/);
    assert.equal((await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 660, full_name: 'Online Customer', email: 'ONLINE@example.com' })).status, 201);
    assert.equal((await db().list('customers')).length, 1);
    assert.equal((await db().list('appointments')).length, 2);
  });

  it('requires sign-in and enough detail to reach the customer', async () => {
    const { p, s60 } = await setup();
    const base = { practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600 };
    assert.equal((await add({ ...base, full_name: 'X Y', phone: '0400 555 666' }, null)).status, 401);
    const noContact = await add({ ...base, full_name: 'No Contact' });
    assert.equal(noContact.status, 422);
    assert.ok((await noContact.json()).fields.email);
    const other = await add({ practitioner_id: p.id, date: DAY, minutes: 600, full_name: 'No Service', phone: '0400 555 666' });
    assert.deepEqual(Object.keys((await other.json()).fields).sort(), ['duration_minutes', 'service_name']);
    assert.equal((await add({ ...base, practitioner_id: '00000000-0000-4000-8000-000000000000', full_name: 'X Y', phone: '0400 555 666' })).status, 404);
    assert.equal((await db().list('appointments')).length, 0);
  });
});

describe('Customer emails when the schedule changes', () => {
  beforeEach(() => freshDb(RESEND));

  it('tells the dashboard whether email is set up', async () => {
    assert.equal((await (await apptGET(req('/api/admin/appointments', { cookie: await adminCookie('staff') }))).json()).email_ready, true);
    freshDb();
    assert.equal((await (await apptGET(req('/api/admin/appointments', { cookie: await adminCookie('staff') }))).json()).email_ready, false);
  });

  it('emails a confirmation when staff add a booking', async () => {
    const { p, s60 } = await setup();
    const calls = resend();
    const r = await (await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600, full_name: 'Email Customer', email: 'customer@example.com' })).json();
    assert.equal(r.customer_email, 'sent');
    assert.equal(calls.length, 1);
    const m = mail(calls[0]);
    assert.deepEqual(m.to, ['customer@example.com']);
    assert.match(m.subject, /booking is confirmed/);
    assert.match(m.text, /Remedial Massage – 60 minutes/);
    assert.match(m.text, /With Test Therapist/);
    assert.match(m.text, /10:00/);
    assert.match(m.text, /Price: \$100/);
    assert.equal(calls[0].headers.Authorization, 'Bearer re_test_key');
  });

  it('emails the old and new time when a booking is moved, but not for a move to the same time', async () => {
    const { s60 } = await setup();
    const calls = resend();
    await customerBooks(s60.id, 600); // the customer's own online booking sends its confirmation
    const a = (await db().list('appointments'))[0];
    const before = calls.length;
    const moved = await (await patch(a.id, { move: { date: NEXT, minutes: 690 } })).json();
    assert.equal(moved.customer_email, 'sent');
    const m = mail(calls[before]);
    assert.deepEqual(m.to, ['online@example.com']);
    assert.match(m.subject, /has moved to/);
    assert.match(m.text, /moved from .*10:00/);
    assert.match(m.text, /11:30/);
    const same = await (await patch(a.id, { move: { date: NEXT, minutes: 690 } })).json();
    assert.equal(same.customer_email, null);
    assert.equal(calls.length, before + 1);
  });

  it('emails when a booking is cancelled and when its price changes', async () => {
    const { s60 } = await setup();
    const calls = resend();
    await customerBooks(s60.id, 600);
    const a = (await db().list('appointments'))[0];
    const n = calls.length;
    assert.equal((await (await patch(a.id, { price: { final_price_cents: 8000, note: 'Club member' } })).json()).customer_email, 'sent');
    assert.match(mail(calls[n]).subject, /price updated/);
    assert.match(mail(calls[n]).text, /Price: \$80/);
    assert.ok(!/Club member/.test(mail(calls[n]).text), 'the internal reason is not sent to the customer');
    assert.equal((await (await patch(a.id, { price: { final_price_cents: 8000 } })).json()).customer_email, null); // unchanged price: no email
    assert.equal((await (await patch(a.id, { status: 'cancelled' })).json()).customer_email, 'sent');
    assert.match(mail(calls[n + 1]).subject, /has been cancelled/);
    assert.equal((await (await patch(a.id, { status: 'completed' })).json().catch(() => ({}))).customer_email ?? null, null);
    assert.equal(calls.length, n + 2);
  });

  it('reports honestly when no email goes out: not set up, no address, or a send failure', async () => {
    const { p, s60 } = await setup();
    mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ status: 500, body: { message: 'down' } })]]);
    const failed = await (await add({ practitioner_id: p.id, service_id: s60.id, date: DAY, minutes: 600, full_name: 'Email Customer', email: 'customer@example.com' })).json();
    assert.equal(failed.customer_email, 'failed');
    assert.equal((await db().list('appointments')).length, 1, 'the booking is still made');

    freshDb(); // email not configured
    const again = await setup();
    const calls = mockFetch([]);
    const none = await (await add({ practitioner_id: again.p.id, service_id: again.s60.id, date: DAY, minutes: 600, full_name: 'Email Customer', email: 'customer@example.com' })).json();
    assert.equal(none.customer_email, 'not_configured');
    assert.equal(calls.length, 0);
  });
});
