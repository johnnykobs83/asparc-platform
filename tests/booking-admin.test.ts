import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PATCH as apptPATCH } from '../app/api/admin/appointments/[id]/route';
import { GET as apptGET } from '../app/api/admin/appointments/route';
import { POST as bookPOST } from '../app/api/bookings/route';
import { getAvailability, melbourneLocalToUtc } from '../lib/bookings/service';
import { db } from '../lib/db';
import type { Practitioner, Service } from '../lib/db/types';
import { listServices } from '../lib/kb/service';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, req } from './helpers';

const ALL_WEEK = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: 360, end: 1200 }]]));
const DAY = addDays(melbourneDate(), 3);
const NEXT = addDays(melbourneDate(), 4);
const at = (minutes: number, day = DAY) => melbourneLocalToUtc(day, minutes).toISOString();

async function setup(): Promise<{ p: Practitioner; s60: Service; s30: Service }> {
  const all = await listServices();
  const s60 = (await db().update('services', all.find((x) => x.slug === 'remedial-massage-60')!.id, { availability: 'available' }))!;
  const s30 = (await db().update('services', all.find((x) => x.slug === 'remedial-massage-30')!.id, { availability: 'available' }))!;
  const p = await db().insert('practitioners', { name: 'Test Therapist', service_ids: [s60.id, s30.id], weekly_hours: ALL_WEEK });
  return { p, s60, s30 };
}
const book = async (serviceId: string, minutes: number, email = 'one@example.com') =>
  (await bookPOST(req('/api/bookings', { body: { service_id: serviceId, start: at(minutes), full_name: 'Booking Person', email, phone: '0400 111 222', consent_contact: true } }))).json();
const only = async () => (await db().list('appointments'))[0];
const patch = async (id: string, body: Record<string, unknown>, role: 'owner' | 'manager' | 'staff' | null = 'staff') =>
  apptPATCH(req(`/api/admin/appointments/${id}`, { method: 'PATCH', body, cookie: role ? await adminCookie(role) : undefined }), ctx(id));
const adminList = async () => (await (await apptGET(req('/api/admin/appointments', { cookie: await adminCookie('staff') }))).json()).appointments;

describe('Bookings – moving a booking', () => {
  beforeEach(() => freshDb());

  it('moves to another day and time, keeps the length, and frees the old time', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    const a = await only();
    const r = await patch(a.id, { move: { date: NEXT, minutes: 615 } });
    assert.equal(r.status, 200);
    const moved = await only();
    assert.equal(moved.starts_at, at(615, NEXT));
    assert.equal(moved.ends_at, at(675, NEXT));
    assert.equal(moved.status, 'confirmed');
    const oldDay = (await getAvailability(s60.id, DAY, 1)).days[0].slots.map((x) => x.start);
    assert.ok(oldDay.includes(at(600)), 'old time is bookable again');
    const newDay = (await getAvailability(s60.id, NEXT, 1)).days[0].slots.map((x) => x.start);
    assert.ok(!newDay.includes(at(600, NEXT)) && !newDay.includes(at(630, NEXT)), 'new time is blocked for customers');
  });

  it('refuses to drop a booking on top of another, and leaves it where it was', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    await book(s60.id, 720, 'two@example.com');
    const first = (await db().list('appointments')).find((x) => x.starts_at === at(600))!;
    const r = await patch(first.id, { move: { date: DAY, minutes: 690 } }); // 11:30–12:30 overlaps 12:00–13:00
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /overlaps another booking/);
    assert.equal((await db().get('appointments', first.id))?.starts_at, at(600));
    assert.equal((await patch(first.id, { move: { date: DAY, minutes: 660 } })).status, 200); // 11:00–12:00 is back-to-back: fine
  });

  it('lets staff place a booking outside the usual hours, but only confirmed bookings can move', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    const a = await only();
    assert.equal((await patch(a.id, { move: { date: DAY, minutes: 1230 } })).status, 200); // 8:30pm, after closing
    await patch(a.id, { status: 'cancelled' });
    const r = await patch(a.id, { move: { date: DAY, minutes: 600 } });
    assert.equal(r.status, 422);
    assert.match((await r.json()).error, /Only confirmed bookings/);
  });

  it('needs a signed-in admin and a valid request', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    const a = await only();
    assert.equal((await patch(a.id, { move: { date: NEXT, minutes: 600 } }, null)).status, 401);
    assert.equal((await patch(a.id, { move: { date: 'tomorrow', minutes: 600 } })).status, 422);
    assert.equal((await patch(a.id, { move: { date: NEXT, minutes: 2000 } })).status, 422);
    assert.equal((await patch(a.id, { status: 'completed', move: { date: NEXT, minutes: 600 } })).status, 422); // one change per request
    assert.equal((await patch('00000000-0000-4000-8000-000000000000', { move: { date: NEXT, minutes: 600 } })).status, 404);
    assert.equal((await only()).starts_at, at(600));
  });
});

describe('Bookings – prices and discounts', () => {
  beforeEach(() => freshDb());

  it('stores the list price at booking time and shows it to the customer and staff', async () => {
    const { s60 } = await setup();
    const confirmation = await book(s60.id, 600);
    assert.equal(confirmation.price_cents, 10000);
    assert.equal((await only()).price_cents, 10000);
    const row = (await adminList())[0];
    assert.equal(row.list_price_cents, 10000);
    assert.equal(row.final_price_cents, null);
    assert.equal(row.charge_cents, 10000);
    assert.match((await db().list('notifications')).find((n) => /Booked online/.test(n.title))!.body, /\$100/);
  });

  it('a later change to the service price does not change existing bookings', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    await db().update('services', s60.id, { price_cents: 14000 });
    assert.equal((await adminList())[0].charge_cents, 10000);
  });

  it('staff can discount a booking with a reason, and reset it', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    const a = await only();
    const r = await patch(a.id, { price: { final_price_cents: 8000, note: 'Club member 20% off' } });
    assert.equal(r.status, 200);
    let row = (await adminList())[0];
    assert.deepEqual([row.list_price_cents, row.final_price_cents, row.charge_cents, row.price_note], [10000, 8000, 8000, 'Club member 20% off']);
    assert.equal((await patch(a.id, { price: { final_price_cents: 0, note: 'Complimentary' } })).status, 200);
    assert.equal((await adminList())[0].charge_cents, 0);
    await patch(a.id, { price: { final_price_cents: null } });
    row = (await adminList())[0];
    assert.deepEqual([row.final_price_cents, row.charge_cents, row.price_note], [null, 10000, null]);
  });

  it('rejects negative or non-numeric prices and requires sign-in', async () => {
    const { s60 } = await setup();
    await book(s60.id, 600);
    const a = await only();
    assert.equal((await patch(a.id, { price: { final_price_cents: -500 } })).status, 422);
    assert.equal((await patch(a.id, { price: { final_price_cents: 12.5 } })).status, 422);
    assert.equal((await patch(a.id, { price: { final_price_cents: 5000 } }, null)).status, 401);
    assert.equal((await only()).final_price_cents, null);
  });

  it('services priced on enquiry have no list price; staff can still set what they will charge', async () => {
    const { p, s60 } = await setup();
    await db().update('services', s60.id, { price_status: 'on_enquiry' });
    const confirmation = await book(s60.id, 600);
    assert.equal(confirmation.price_cents, null);
    let row = (await adminList())[0];
    assert.deepEqual([row.list_price_cents, row.charge_cents], [null, null]);
    await patch(row.id, { price: { final_price_cents: 9000 } });
    row = (await adminList())[0];
    assert.equal(row.charge_cents, 9000);
    assert.equal(p.name, 'Test Therapist');
  });
});
