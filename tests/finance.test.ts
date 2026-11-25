import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { PATCH as agreementPATCH } from '../app/api/admin/finance/agreements/[id]/route';
import { POST as agreementPOST } from '../app/api/admin/finance/agreements/route';
import { GET as clientGET, PATCH as clientPATCH } from '../app/api/admin/finance/clients/[id]/route';
import { GET as clientsGET, POST as clientsPOST } from '../app/api/admin/finance/clients/route';
import { PATCH as invoicePATCH } from '../app/api/admin/finance/invoices/[id]/route';
import { POST as invoicePOST } from '../app/api/admin/finance/invoices/route';
import { GET as weekGET } from '../app/api/admin/planner/week/route';
import { POST as stripePOST } from '../app/api/webhooks/stripe/route';
import { db } from '../lib/db';
import type { Role } from '../lib/db/types';
import { financeOverview, gstOf, invoiceState } from '../lib/finance/service';
import { localToUtc, mondayOf } from '../lib/planner/time';
import { addDays, melbourneDate } from '../lib/time/melbourne';
import { adminCookie, ctx, freshDb, req } from './helpers';

const TODAY = melbourneDate();
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });
const call = async (fn: (r: Request, c: any) => Promise<Response>, path: string, opts: { method?: string; body?: unknown; role?: Role | null; id?: string } = {}) =>
  json(await fn(req(path, { method: opts.method, body: opts.body, cookie: opts.role === null ? undefined : await adminCookie(opts.role ?? 'owner') }), ctx(opts.id ?? '')));

async function club(name = 'Club A – NPL Men', extra: Record<string, unknown> = {}) {
  return (await call(clientsPOST, '/api/admin/finance/clients', { body: { name, kind: 'club', billing_email: 'accounts@club.example', ...extra } })).body.client;
}
const invoice = async (body: Record<string, unknown>) => call(invoicePOST, '/api/admin/finance/invoices', { body });

describe('Client billing – owner only', () => {
  beforeEach(() => freshDb());

  it('is invisible to managers and staff (404), and needs a sign-in', async () => {
    const c = await club();
    for (const role of ['manager', 'staff'] as const) {
      assert.equal((await call(clientsGET, '/api/admin/finance/clients', { role })).status, 404);
      assert.equal((await call(clientsPOST, '/api/admin/finance/clients', { role, body: { name: 'Sneaky' } })).status, 404);
      assert.equal((await call(clientGET, `/api/admin/finance/clients/${c.id}`, { role, id: c.id })).status, 404);
      assert.equal((await call(clientPATCH, `/api/admin/finance/clients/${c.id}`, { role, id: c.id, method: 'PATCH', body: { name: 'Renamed' } })).status, 404);
      assert.equal((await call(agreementPOST, '/api/admin/finance/agreements', { role, body: {} })).status, 404);
      assert.equal((await call(invoicePOST, '/api/admin/finance/invoices', { role, body: {} })).status, 404);
      assert.equal((await call(invoicePATCH, '/api/admin/finance/invoices/x', { role, id: 'x', method: 'PATCH', body: {} })).status, 404);
      assert.equal((await call(agreementPATCH, '/api/admin/finance/agreements/x', { role, id: 'x', method: 'PATCH', body: {} })).status, 404);
    }
    assert.equal((await call(clientsGET, '/api/admin/finance/clients', { role: null })).status, 401);
    assert.equal((await call(clientsGET, '/api/admin/finance/clients')).status, 200);
  });

  it('managers can tag a job with a client name, but never see money', async () => {
    const c = await club();
    await call(agreementPOST, '/api/admin/finance/agreements', { body: { client_id: c.id, title: 'Season S&C', billing_model: 'monthly_retainer', rate_cents: 240000, agreed_value_cents: 2400000, start_date: TODAY } });
    const week = await json(await weekGET(req('/api/admin/planner/week', { cookie: await adminCookie('manager') })));
    assert.deepEqual(week.body.clients, [{ id: c.id, name: c.name }]);
    assert.ok(!JSON.stringify(week.body).includes('2400000'));
    const staffWeek = await json(await weekGET(req('/api/admin/planner/week', { cookie: await adminCookie('staff') })));
    assert.deepEqual(staffWeek.body.clients, []);
  });

  it('adds up agreed, invoiced, paid, outstanding and overdue, and ages what is owed', async () => {
    const a = await club('Club A');
    const b = await club('Club B');
    await club('Club C (prospect)', { status: 'prospect' });
    const ag = (await call(agreementPOST, '/api/admin/finance/agreements', { body: { client_id: a.id, title: 'Season S&C', billing_model: 'monthly_retainer', rate_cents: 240000, agreed_value_cents: 2400000, start_date: addDays(TODAY, -60), end_date: addDays(TODAY, 240), inclusions: '3 sessions a week' } })).body.agreement;
    assert.equal((await call(agreementPOST, '/api/admin/finance/agreements', { body: { client_id: b.id, title: 'Juniors', billing_model: 'per_session', rate_cents: 18000, start_date: TODAY, end_date: addDays(TODAY, -1) } })).status, 422);
    await call(agreementPOST, '/api/admin/finance/agreements', { body: { client_id: b.id, title: 'Juniors', billing_model: 'per_session', rate_cents: 18000, agreed_value_cents: 720000, start_date: TODAY } });

    const paid = (await invoice({ client_id: a.id, agreement_id: ag.id, number: 'INV-0007', issued_on: addDays(TODAY, -40), due_on: addDays(TODAY, -26), amount_cents: 240000 })).body.invoice;
    assert.equal(paid.gst_cents, gstOf(240000));
    assert.equal(gstOf(38000), 3455);
    const late = (await invoice({ client_id: b.id, number: 'INV-0009', issued_on: addDays(TODAY, -45), due_on: addDays(TODAY, -35), amount_cents: 72000 })).body.invoice;
    const due = (await invoice({ client_id: a.id, agreement_id: ag.id, number: 'INV-0011', issued_on: TODAY, due_on: addDays(TODAY, 14), amount_cents: 240000 })).body.invoice;
    assert.equal((await invoice({ client_id: a.id, number: 'INV-0011', issued_on: TODAY, due_on: TODAY, amount_cents: 1 })).status, 422, 'invoice numbers are unique per client');
    assert.equal((await invoice({ client_id: a.id, agreement_id: (await db().list('client_agreements', { eq: { client_id: b.id } }))[0].id, number: 'X', issued_on: TODAY, due_on: TODAY, amount_cents: 1 })).status, 422, 'agreement must belong to the client');

    // Bank transfer for the first invoice, part payment on the late one.
    assert.equal((await call(invoicePATCH, `/api/admin/finance/invoices/${paid.id}`, { id: paid.id, method: 'PATCH', body: { payment: { method: 'bank_transfer' } } })).body.invoice.status, 'paid');
    const part = (await call(invoicePATCH, `/api/admin/finance/invoices/${late.id}`, { id: late.id, method: 'PATCH', body: { payment: { amount_cents: 30000, method: 'cash' } } })).body.invoice;
    assert.equal(part.status, 'open');
    assert.equal(invoiceState(part, TODAY), 'overdue');
    assert.equal(invoiceState(due, TODAY), 'due');
    assert.equal((await call(invoicePATCH, `/api/admin/finance/invoices/${paid.id}`, { id: paid.id, method: 'PATCH', body: { payment: {} } })).status, 422, 'nothing owing');

    const o = (await call(clientsGET, '/api/admin/finance/clients')).body;
    assert.deepEqual(o.totals, { agreed_cents: 3120000, invoiced_cents: 552000, paid_cents: 270000, outstanding_cents: 282000, overdue_cents: 42000 });
    assert.deepEqual(o.aged, { current: 240000, d1_30: 0, d31_60: 42000, d61_plus: 0 });
    const byName = Object.fromEntries(o.clients.map((c: { client: { name: string }; status: string }) => [c.client.name, c.status]));
    assert.deepEqual(byName, { 'Club A': 'due', 'Club B': 'overdue', 'Club C (prospect)': 'no_invoices' });
    assert.equal(o.clients.find((c: { client: { name: string } }) => c.client.name === 'Club B').oldest_overdue_days, 35);

    // Voiding removes it from what is owed.
    await call(invoicePATCH, `/api/admin/finance/invoices/${late.id}`, { id: late.id, method: 'PATCH', body: { void: true } });
    assert.equal((await financeOverview(TODAY)).totals.overdue_cents, 0);
  });

  it('shows the sessions delivered for a client from the planner', async () => {
    const c = await club();
    const loc = await db().insert('work_locations', { name: 'Club ground' });
    const past = addDays(TODAY, -3);
    const future = addDays(TODAY, 3);
    for (const d of [past, addDays(past, -1)]) await db().insert('planner_jobs', { title: 'S&C', location_id: loc.id, client_id: c.id, starts_at: localToUtc(d, 390).toISOString(), ends_at: localToUtc(d, 480).toISOString() });
    await db().insert('planner_jobs', { title: 'S&C', location_id: loc.id, client_id: c.id, starts_at: localToUtc(future, 390).toISOString(), ends_at: localToUtc(future, 480).toISOString() });
    const d = (await call(clientGET, `/api/admin/finance/clients/${c.id}`, { id: c.id })).body;
    assert.equal(d.sessions.upcoming, 1);
    assert.equal(d.sessions.by_month.reduce((s: number, m: { count: number }) => s + m.count, 0), 2);
    assert.equal(mondayOf('2026-12-06'), '2026-11-30');
  });
});

describe('Client billing – Stripe invoices update by themselves', () => {
  const WHSEC = 'whsec_test_secret_value';
  const event = (type: string, over: Record<string, unknown> = {}) => {
    const body = JSON.stringify({
      id: `evt_${type}`,
      type,
      created: 1_800_000_000,
      data: { object: { id: 'in_club_1', number: 'ASP-0042', customer: 'cus_ClubA', customer_name: 'Club A', customer_email: 'accounts@club.example', currency: 'aud', total: 240000, amount_paid: 0, total_taxes: [{ amount: 21818 }], due_date: 1_801_000_000, status_transitions: { finalized_at: 1_800_000_000 }, hosted_invoice_url: 'https://invoice.stripe.com/i/test', ...over } },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex')}`;
    return new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', host: 'localhost', 'stripe-signature': sig }, body });
  };
  beforeEach(() => freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC }));

  it('records invoices for linked clients, marks them paid, and ignores unlinked customers', async () => {
    assert.equal((await stripePOST(event('invoice.finalized'))).status, 200);
    assert.equal((await db().list('client_invoices')).length, 0, 'no client has that Stripe customer yet');

    const c = await club('Club A', { stripe_customer_id: 'cus_ClubA' });
    assert.equal((await call(clientsPOST, '/api/admin/finance/clients', { body: { name: 'Copy', stripe_customer_id: 'cus_ClubA' } })).status, 422);
    await stripePOST(event('invoice.finalized'));
    let [inv] = await db().list('client_invoices');
    assert.equal(inv.client_id, c.id);
    assert.equal(inv.number, 'ASP-0042');
    assert.equal(inv.status, 'open');
    assert.equal(inv.gst_cents, 21818);
    assert.equal(inv.hosted_invoice_url, 'https://invoice.stripe.com/i/test');
    assert.equal((await call(invoicePATCH, `/api/admin/finance/invoices/${inv.id}`, { id: inv.id, method: 'PATCH', body: { amount_cents: 1 } })).status, 422, 'Stripe invoices are changed in Stripe');

    await stripePOST(event('invoice.paid', { amount_paid: 240000, status_transitions: { finalized_at: 1_800_000_000, paid_at: 1_800_100_000 } }));
    await stripePOST(event('invoice.paid', { amount_paid: 240000, status_transitions: { finalized_at: 1_800_000_000, paid_at: 1_800_100_000 } }));
    const all = await db().list('client_invoices');
    assert.equal(all.length, 1, 'redelivery does not duplicate');
    [inv] = all;
    assert.equal(inv.status, 'paid');
    assert.equal(inv.method, 'stripe');
    assert.equal(inv.amount_paid_cents, 240000);
    assert.equal((await db().list('payments')).length, 1, 'Revenue still records the payment as before');

    await stripePOST(event('invoice.voided'));
    assert.equal((await db().list('client_invoices'))[0].status, 'void');
  });
});
