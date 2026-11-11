import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PATCH as apptPATCH } from '../app/api/admin/appointments/[id]/route';
import { GET as apptGET } from '../app/api/admin/appointments/route';
import { PATCH as practitionerPATCH } from '../app/api/admin/practitioners/[id]/route';
import { GET as practitionerGET, POST as practitionerPOST } from '../app/api/admin/practitioners/route';
import { GET as availabilityGET } from '../app/api/bookings/availability/route';
import { GET as servicesGET, POST as bookPOST } from '../app/api/bookings/route';
import { handleChatMessage } from '../lib/ai/receptionist';
import { BOOKING_RULES, getAvailability, melbourneLocalToUtc, slotsForDay } from '../lib/bookings/service';
import { db } from '../lib/db';
import type { Appointment, Practitioner, Service } from '../lib/db/types';
import { listServices } from '../lib/kb/service';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, req, VISITOR } from './helpers';

const ALL_WEEK = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: 360, end: 1200 }]])); // 6am–8pm every day
const DAY = addDays(melbourneDate(), 3); // always inside the booking window and past the minimum notice

async function massage(minutes: 30 | 45 | 60 = 60): Promise<Service> {
  const s = (await listServices()).find((x) => x.slug === `remedial-massage-${minutes}`)!;
  return (await db().update('services', s.id, { availability: 'available' }))!;
}
async function practitioner(over: Partial<Practitioner> = {}): Promise<Practitioner> {
  const s60 = await massage(60);
  const s30 = await massage(30);
  return db().insert('practitioners', { name: 'Test Therapist', title: 'Remedial massage therapist', service_ids: [s60.id, s30.id], weekly_hours: ALL_WEEK, ...over });
}
const startAt = (minutes: number, day = DAY) => melbourneLocalToUtc(day, minutes).toISOString();
const details = (over: Record<string, unknown> = {}) => ({ full_name: 'Booking Person', email: 'Booking.Person@Example.com', phone: '0400 111 222', consent_contact: true, ...over });
const book = (body: Record<string, unknown>) => bookPOST(req('/api/bookings', { body }));
const slotsOn = async (serviceId: string, day = DAY, practitionerId: string | null = null) => (await getAvailability(serviceId, day, 1, practitionerId)).days[0].slots;

describe('Online booking – what can be booked', () => {
  beforeEach(() => freshDb());

  it('offers nothing until a practitioner with hours and a service exists', async () => {
    assert.deepEqual((await (await servicesGET(req('/api/bookings'))).json()).services, []);
    await practitioner({ weekly_hours: {} });
    assert.deepEqual((await (await servicesGET(req('/api/bookings'))).json()).services, []);
    await practitioner({ name: 'Inactive', active: false });
    assert.deepEqual((await (await servicesGET(req('/api/bookings'))).json()).services, []);
  });

  it('lists only available, public services with a duration that a practitioner delivers', async () => {
    const p = await practitioner();
    const s45 = await massage(45); // available, has a duration, but nobody is assigned to it
    const { services } = await (await servicesGET(req('/api/bookings'))).json();
    assert.deepEqual(services.map((s: { name: string }) => s.name).sort(), ['Remedial Massage – 30 minutes', 'Remedial Massage – 60 minutes']);
    assert.ok(!services.some((s: { id: string }) => s.id === s45.id));
    assert.equal(services[0].practitioners[0].name, 'Test Therapist');
    // marking a service unavailable removes it from online booking
    await db().update('services', p.service_ids[0], { availability: 'pending_confirmation' });
    assert.equal((await (await servicesGET(req('/api/bookings'))).json()).services.length, 1);
  });
});

describe('Online booking – available times', () => {
  beforeEach(() => freshDb());

  it('offers half-hour starts that fit inside working hours', async () => {
    const p = await practitioner();
    const slots = await slotsOn(p.service_ids[0]); // 60 minutes, 6am–8pm
    assert.equal(slots[0].start, startAt(360));
    assert.equal(slots[slots.length - 1].start, startAt(1140)); // 7pm is the last start that finishes by 8pm
    assert.equal(slots.length, 27);
    assert.equal((await slotsOn(p.service_ids[1])).length, 28); // 30 minutes: last start 7:30pm
  });

  it('respects minimum notice and never offers the past', () => {
    const p = { id: 'p1', weekly_hours: ALL_WEEK, buffer_minutes: 0 } as unknown as Practitioner;
    const now = melbourneLocalToUtc(DAY, 600).getTime(); // 10:00am on the day
    const slots = slotsForDay(DAY, 60, p, [], now);
    assert.equal(slots[0].start, startAt(600 + BOOKING_RULES.minNoticeMinutes));
  });

  it('handles daylight saving: 9am Melbourne is the right instant on both sides of the change', () => {
    // Daylight saving starts on Sunday 4 October 2026 (UTC+10 -> UTC+11).
    assert.equal(melbourneLocalToUtc('2026-10-03', 540).toISOString(), '2026-10-02T23:00:00.000Z');
    assert.equal(melbourneLocalToUtc('2026-10-05', 540).toISOString(), '2026-10-04T22:00:00.000Z');
  });

  it('does not offer days the practitioner does not work, or days beyond four weeks', async () => {
    const weekday = String(new Date(`${DAY}T00:00:00Z`).getUTCDay());
    const hours = { ...ALL_WEEK };
    delete hours[weekday];
    const p = await practitioner({ weekly_hours: hours });
    assert.equal((await slotsOn(p.service_ids[0])).length, 0);
    const far = await getAvailability(p.service_ids[0], addDays(melbourneDate(), BOOKING_RULES.horizonDays + 1), 7);
    assert.equal(far.days.length, 0);
  });

  it('the public availability endpoint exposes free times only – never who has booked', async () => {
    const p = await practitioner();
    await book(details({ service_id: p.service_ids[0], start: startAt(600) }));
    const r = await availabilityGET(req(`/api/bookings/availability?service=${p.service_ids[0]}&from=${DAY}&days=1`));
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(!/booking person|example\.com|0400/i.test(text));
    assert.ok(!JSON.parse(text).days[0].slots.some((s: { start: string }) => s.start === startAt(600)));
    assert.equal((await availabilityGET(req('/api/bookings/availability?service=not-a-uuid'))).status, 400);
  });
});

describe('Online booking – making a booking', () => {
  beforeEach(() => freshDb());

  it('confirms immediately, stores the customer, notifies staff and removes the time', async () => {
    const p = await practitioner();
    const r = await book(details({ service_id: p.service_ids[0], start: startAt(600), notes: 'First visit' }));
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.practitioner, 'Test Therapist');
    assert.match(body.when, /10:00/);
    assert.equal(body.reference.length, 8);

    const appts = await db().list('appointments');
    assert.equal(appts.length, 1);
    assert.equal(appts[0].status, 'confirmed');
    assert.equal(appts[0].starts_at, startAt(600));
    assert.equal(appts[0].ends_at, startAt(660));
    const customer = await db().get('customers', appts[0].customer_id);
    assert.equal(customer?.email, 'booking.person@example.com');
    assert.equal(customer?.consent_contact, true);
    assert.equal(customer?.consent_marketing, false);
    const note = (await db().list('notifications')).find((n) => /Booked online/.test(n.title));
    assert.ok(note && /confirmed – no action is needed/.test(note.body));

    const starts = (await slotsOn(p.service_ids[0])).map((s) => s.start);
    for (const m of [570, 600, 630]) assert.ok(!starts.includes(startAt(m)), `${m} should be blocked`);
    assert.ok(starts.includes(startAt(540)) && starts.includes(startAt(660)));
  });

  it('refuses a time that has just been taken, with a clear message', async () => {
    const p = await practitioner();
    assert.equal((await book(details({ service_id: p.service_ids[0], start: startAt(600) }))).status, 201);
    const again = await book(details({ service_id: p.service_ids[0], start: startAt(600), email: 'other@example.com' }));
    assert.equal(again.status, 409);
    assert.match((await again.json()).error, /just been taken/);
    assert.equal((await db().list('appointments')).length, 1);
  });

  it('"any practitioner" books whoever is free; a named practitioner is honoured', async () => {
    const a = await practitioner({ name: 'Alex' });
    const b = await practitioner({ name: 'Blake' });
    const sid = a.service_ids[0];
    const first = await (await book(details({ service_id: sid, start: startAt(600) }))).json();
    const second = await (await book(details({ service_id: sid, start: startAt(600), email: 'two@example.com' }))).json();
    assert.deepEqual([first.practitioner, second.practitioner].sort(), ['Alex', 'Blake']);
    assert.equal((await book(details({ service_id: sid, start: startAt(600), email: 'three@example.com' }))).status, 409);
    const named = await (await book(details({ service_id: sid, practitioner_id: b.id, start: startAt(720), email: 'four@example.com' }))).json();
    assert.equal(named.practitioner, 'Blake');
  });

  it('keeps the gap after an appointment free', async () => {
    const p = await practitioner({ buffer_minutes: 30 });
    await book(details({ service_id: p.service_ids[0], start: startAt(600) })); // 10:00–11:00 + 30 min gap
    const starts = (await slotsOn(p.service_ids[0])).map((s) => s.start);
    assert.ok(!starts.includes(startAt(660)));
    assert.ok(starts.includes(startAt(690)));
  });

  it('rejects times outside working hours, off the grid, too soon or too far ahead', async () => {
    const p = await practitioner();
    const sid = p.service_ids[0];
    assert.equal((await book(details({ service_id: sid, start: startAt(300) }))).status, 409); // 5am
    assert.equal((await book(details({ service_id: sid, start: startAt(1170) }))).status, 409); // 7:30pm start would finish after 8pm
    assert.equal((await book(details({ service_id: sid, start: startAt(605) }))).status, 409); // not on the half hour
    assert.equal((await book(details({ service_id: sid, start: new Date(Date.now() + 10 * 60000).toISOString() }))).status, 409);
    assert.equal((await book(details({ service_id: sid, start: startAt(600, addDays(melbourneDate(), 60)) }))).status, 422);
    assert.equal((await db().list('appointments')).length, 0);
  });

  it('requires name, email, mobile and contact consent; marketing stays opt-in', async () => {
    const p = await practitioner();
    const bad = await book({ service_id: p.service_ids[0], start: startAt(600), full_name: 'A', email: 'nope', phone: '12', consent_contact: false });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys((await bad.json()).fields).sort(), ['consent_contact', 'email', 'full_name', 'phone']);
    assert.equal((await db().list('customers')).length, 0);
    await book(details({ service_id: p.service_ids[0], start: startAt(600), consent_marketing: true }));
    assert.equal((await db().list('customers'))[0].consent_marketing, true);
  });

  it('silently drops bot submissions, redacts card numbers in notes, and refuses unknown services', async () => {
    const p = await practitioner();
    assert.equal((await book(details({ service_id: p.service_ids[0], start: startAt(600), website: 'http://spam.example' }))).status, 200);
    assert.equal((await db().list('appointments')).length, 0);
    await book(details({ service_id: p.service_ids[0], start: startAt(600), notes: 'my card is 4242 4242 4242 4242' }));
    assert.ok(!/4242 4242/.test((await db().list('appointments'))[0].notes ?? ''));
    assert.equal((await book(details({ service_id: '00000000-0000-4000-8000-000000000000', start: startAt(720) }))).status, 404);
  });
});

describe('Online booking – dashboard', () => {
  beforeEach(() => freshDb());
  const patchAppt = async (id: string, body: Record<string, unknown>, role: 'owner' | 'manager' | 'staff' = 'staff') =>
    apptPATCH(req(`/api/admin/appointments/${id}`, { method: 'PATCH', body, cookie: await adminCookie(role) }), ctx(id));

  it('requires sign-in, and only managers and owners can change practitioners', async () => {
    assert.equal((await practitionerGET(req('/api/admin/practitioners'))).status, 401);
    assert.equal((await apptGET(req('/api/admin/appointments'))).status, 401);
    const body = { name: 'New Person', weekly_hours: { '1': [{ start: 540, end: 1020 }] }, service_ids: [(await massage(60)).id] };
    assert.equal((await practitionerPOST(req('/api/admin/practitioners', { body, cookie: await adminCookie('staff') }))).status, 403);
    const made = await practitionerPOST(req('/api/admin/practitioners', { body, cookie: await adminCookie('manager') }));
    assert.equal(made.status, 201);
    const { practitioner: p } = await made.json();
    assert.deepEqual(p.weekly_hours, { '1': [{ start: 540, end: 1020 }] });
    const bad = await practitionerPOST(req('/api/admin/practitioners', { body: { name: 'X', weekly_hours: { '9': [] } }, cookie: await adminCookie('owner') }));
    assert.equal(bad.status, 422);
    const off = await practitionerPATCH(req(`/api/admin/practitioners/${p.id}`, { method: 'PATCH', body: { active: false }, cookie: await adminCookie('owner') }), ctx(p.id));
    assert.equal((await off.json()).practitioner.active, false);
    assert.deepEqual((await (await servicesGET(req('/api/bookings'))).json()).services, []);
  });

  it('lists bookings with customer details for staff', async () => {
    const p = await practitioner();
    await book(details({ service_id: p.service_ids[0], start: startAt(600) }));
    const r = await (await apptGET(req('/api/admin/appointments', { cookie: await adminCookie('staff') }))).json();
    assert.equal(r.ready, true);
    assert.equal(r.appointments[0].customer.full_name, 'Booking Person');
    assert.equal(r.appointments[0].practitioner_name, 'Test Therapist');
  });

  it('cancelling frees the time; re-confirming is refused if someone else has taken it', async () => {
    const p = await practitioner();
    const sid = p.service_ids[0];
    await book(details({ service_id: sid, start: startAt(600) }));
    const appt = (await db().list('appointments'))[0] as Appointment;
    assert.equal((await patchAppt(appt.id, { status: 'cancelled', cancel_reason: 'Customer called' })).status, 200);
    assert.ok((await slotsOn(sid)).some((s) => s.start === startAt(600)));
    assert.equal((await book(details({ service_id: sid, start: startAt(600), email: 'next@example.com' }))).status, 201);
    assert.equal((await patchAppt(appt.id, { status: 'confirmed' })).status, 409);
    assert.equal((await patchAppt(appt.id, { status: 'bogus' })).status, 422);
    assert.equal((await patchAppt('00000000-0000-4000-8000-000000000000', { status: 'completed' })).status, 404);
  });
});

describe('Online booking – ASPARC AI', () => {
  beforeEach(() => freshDb());
  const ask = (message: string) => handleChatMessage({ visitorId: VISITOR, message });

  it('points people to the booking page only when online booking exists, and never claims to have booked', async () => {
    const before = await ask('Can I book a massage appointment?');
    assert.ok(!/\/book\b/.test(before.reply));
    await practitioner();
    const after = await handleChatMessage({ visitorId: `${VISITOR}2`, message: 'Can I book a massage appointment?' });
    assert.match(after.reply, /https:\/\/www\.asparc\.com\.au\/book/);
    assert.match(after.reply, /can't make the booking for you/);
    assert.doesNotMatch(after.reply, /you(?:'re| are) (?:now )?booked|booking (?:is|has been) confirmed/i);
  });
});
