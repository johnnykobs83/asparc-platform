import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { POST as chatPOST } from '../app/api/chat/route';
import { POST as enquiryPOST } from '../app/api/enquiries/route';
import { POST as loginPOST } from '../app/api/auth/login/route';
import { GET as meGET } from '../app/api/auth/me/route';
import { GET as overviewGET } from '../app/api/admin/overview/route';
import { GET as leadsGET } from '../app/api/admin/leads/route';
import { GET as leadGET, PATCH as leadPATCH } from '../app/api/admin/leads/[id]/route';
import { GET as bookingsGET } from '../app/api/admin/bookings/route';
import { PATCH as bookingPATCH } from '../app/api/admin/bookings/[id]/route';
import { GET as academyGET } from '../app/api/admin/academy/route';
import { GET as kbGET } from '../app/api/admin/knowledge/route';
import { PATCH as kbPATCH } from '../app/api/admin/knowledge/[id]/route';
import { GET as servicesGET } from '../app/api/admin/services/route';
import { PATCH as servicePATCH } from '../app/api/admin/services/[id]/route';
import { GET as notificationsGET } from '../app/api/admin/notifications/route';
import { GET as integrationsGET } from '../app/api/admin/integrations/route';
import { GET as revenueGET } from '../app/api/admin/revenue/route';
import { GET as usersGET, POST as usersPOST } from '../app/api/admin/users/route';
import { DELETE as customerDELETE } from '../app/api/admin/customers/[id]/route';
import { GET as cronGET } from '../app/api/cron/daily-summary/route';
import { POST as reportRunPOST } from '../app/api/admin/reports/run/route';
import { GET as waGET } from '../app/api/webhooks/whatsapp/route';
import { middleware } from '../middleware';
import { db } from '../lib/db';
import { getPublicSiteData } from '../lib/kb/service';
import { VISITOR, adminCookie, ctx, freshDb, mockFetch, req, validEnquiry } from './helpers';

describe('public enquiry API', () => {
  beforeEach(() => freshDb());

  it('creates customer, lead, event and dashboard notification', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry() }));
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.match(body.message, /not a booking or payment confirmation/);
    const [lead] = await db().list('leads');
    assert.equal(lead.source, 'contact_form');
    assert.equal(lead.hubspot_sync_status, 'not_configured'); // honest status when HubSpot absent
    assert.equal((await db().list('customers'))[0].consent_contact, true);
    assert.equal((await db().list('lead_events')).length, 1);
    assert.equal((await db().list('notifications')).length, 1);
    assert.ok((await db().list('integration_logs')).some((l) => l.integration === 'hubspot' && l.status === 'skipped'));
  });

  it('rejects submissions without contact consent', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ consent_contact: false }) }));
    assert.equal(r.status, 422);
    assert.ok((await r.json()).fields.consent_contact);
    assert.equal((await db().list('leads')).length, 0);
  });

  it('requires email or phone', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ email: '', phone: '' }) }));
    assert.equal(r.status, 422);
  });

  it('academy registrations must come from a parent/guardian', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'academy', athlete_age_group: '11-13', athlete_first_name: 'Alex' }) }));
    assert.equal(r.status, 422);
    assert.ok((await r.json()).fields.is_guardian);
  });

  it('academy registration creates a registration with guardian consent and an academy notification', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'academy', is_guardian: true, athlete_age_group: '11-13', athlete_first_name: 'Alex', service_interest: undefined }) }));
    assert.equal(r.status, 201);
    const [reg] = await db().list('academy_registrations');
    assert.equal(reg.guardian_consent, true);
    assert.equal(reg.athlete_age_group, '11-13');
    assert.ok((await db().list('notifications')).some((n) => n.type === 'academy_enquiry'));
  });

  it('booking request is stored as "requested" – never confirmed', async () => {
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'booking', service_interest: 'Strength & Conditioning', preferred_days: 'Tue, Thu', preferred_times: 'After 4pm' }) }));
    const [b] = await db().list('booking_requests');
    assert.equal(b.status, 'requested');
    assert.ok(b.service_id);
    const [lead] = await db().list('leads');
    assert.equal(lead.stage, 'booking_requested');
  });

  it('repeat enquiries update the same customer (no duplicates)', async () => {
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry() }));
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ email: 'TEST.PERSON@example.com', consent_marketing: true }) }));
    const customers = await db().list('customers');
    assert.equal(customers.length, 1);
    assert.equal(customers[0].consent_marketing, true);
    assert.equal((await db().list('leads')).length, 2);
  });

  it('honeypot submissions are dropped silently', async () => {
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ website: 'spam.example' }) }));
    assert.equal(r.status, 200);
    assert.equal((await db().list('leads')).length, 0);
  });

  it('rate limits enquiry spam', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ email: `p${i}@example.com` }) }))).status;
    assert.equal(last, 429);
  });

  it('public site data hides unapproved contact details', async () => {
    const d = await getPublicSiteData();
    assert.equal(d.contact.email, '');
    assert.equal(d.hours.confirmed, false);
    assert.ok(d.services.length > 10);
  });
});

describe('HubSpot + Resend (mocked APIs)', () => {
  beforeEach(() => freshDb({ HUBSPOT_ACCESS_TOKEN: 'pat-test', HUBSPOT_PIPELINE_ID: 'p1', HUBSPOT_STAGE_NEW_ENQUIRY: 's-new', HUBSPOT_STAGE_CONTACTED: 's-contacted', RESEND_API_KEY: 're_test', RESEND_FROM: 'ASPARC <n@asparc.com.au>', NOTIFY_EMAIL_TO: 'owner@asparc.com.au' }));

  it('syncs contact + note + deal, emails management, and re-syncs on stage change', async () => {
    const calls = mockFetch([
      [/POST https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/contacts\/search/, () => ({ body: { results: [] } })],
      [/POST https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/contacts$/, () => ({ body: { id: 'hs-c-1' } })],
      [/PATCH https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/contacts\/hs-c-1/, () => ({ body: { id: 'hs-c-1' } })],
      [/POST https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/notes/, () => ({ body: { id: 'n1' } })],
      [/POST https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/deals$/, () => ({ body: { id: 'hs-d-1' } })],
      [/PATCH https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/deals\/hs-d-1/, () => ({ body: { id: 'hs-d-1' } })],
      [/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'email_1' } })],
    ]);
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'club', club_name: 'Test FC', club_role: 'President' }) }));
    assert.equal(r.status, 201);
    const [lead] = await db().list('leads');
    assert.equal(lead.hubspot_sync_status, 'synced');
    assert.equal(lead.hubspot_deal_id, 'hs-d-1');
    const createContact = calls.find((c) => c.url.endsWith('/contacts') && c.method === 'POST')!;
    assert.equal((createContact.body as { properties: Record<string, string> }).properties.asparc_lead_type, 'club_partnership');
    assert.equal(createContact.headers.Authorization, 'Bearer pat-test');
    const email = calls.find((c) => c.url.includes('resend'))!;
    assert.match((email.body as { subject: string }).subject, /Club partnership/);
    const [n] = await db().list('notifications');
    assert.equal(n.email_status, 'sent');

    const cookie = await adminCookie('staff');
    const p = await leadPATCH(req(`/api/admin/leads/${lead.id}`, { method: 'PATCH', body: { stage: 'contacted', note: 'Called the president' }, cookie }), ctx(lead.id));
    assert.equal(p.status, 200);
    assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.includes('/deals/hs-d-1') && (c.body as { properties: { dealstage: string } }).properties.dealstage === 's-contacted'));
    const events = await db().list('lead_events', { eq: { lead_id: lead.id } });
    assert.ok(events.some((e) => e.event_type === 'stage_changed'));
    assert.ok(events.some((e) => e.event_type === 'note'));
  });

  it('marks lead failed (not synced) when HubSpot errors, without breaking the enquiry', async () => {
    mockFetch([
      [/hubapi/, () => ({ status: 401, body: { message: 'bad token' } })],
      [/resend/, () => ({ body: { id: 'e' } })],
    ]);
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry() }));
    assert.equal(r.status, 201);
    assert.equal((await db().list('leads'))[0].hubspot_sync_status, 'failed');
  });
});

describe('admin auth & RBAC', () => {
  beforeEach(() => freshDb({ ADMIN_BOOTSTRAP_EMAIL: 'owner@asparc.test', ADMIN_BOOTSTRAP_PASSWORD: 'Bootstrap-Pass-2026' }));

  it('rejects unauthenticated admin API calls', async () => {
    assert.equal((await leadsGET(req('/api/admin/leads'))).status, 401);
    assert.equal((await overviewGET(req('/api/admin/overview'))).status, 401);
  });

  it('bootstrap owner can log in; wrong password cannot; session cookie is HttpOnly', async () => {
    assert.equal((await loginPOST(req('/api/auth/login', { body: { email: 'owner@asparc.test', password: 'nope' } }))).status, 401);
    const ok = await loginPOST(req('/api/auth/login', { body: { email: 'owner@asparc.test', password: 'Bootstrap-Pass-2026' } }));
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const me = await meGET(req('/api/auth/me', { cookie: cookie.split(';')[0] }));
    assert.equal((await me.json()).user.role, 'owner');
  });

  it('blocks cross-origin admin mutations', async () => {
    const cookie = await adminCookie('owner');
    const r = await usersPOST(req('/api/admin/users', { body: { email: 'x@y.z', password: 'StrongPass1234', role: 'staff' }, cookie, headers: { origin: 'https://evil.example' } }));
    assert.equal(r.status, 403);
  });

  it('staff cannot edit pricing, knowledge base or users; manager can edit pricing but not users', async () => {
    const staff = await adminCookie('staff');
    const manager = await adminCookie('manager');
    const services = (await (await servicesGET(req('/api/admin/services', { cookie: staff }))).json()).services;
    const academy = services.find((s: { slug: string }) => s.slug === 'performance-academy');
    assert.equal((await servicePATCH(req(`/api/admin/services/${academy.id}`, { method: 'PATCH', body: { price_status: 'approved' }, cookie: staff }), ctx(academy.id))).status, 403);
    assert.equal((await usersGET(req('/api/admin/users', { cookie: manager }))).status, 403);
    const ok = await servicePATCH(req(`/api/admin/services/${academy.id}`, { method: 'PATCH', body: { price_status: 'approved' }, cookie: manager }), ctx(academy.id));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).service.price_status, 'approved');
    const items = (await (await kbGET(req('/api/admin/knowledge', { cookie: staff }))).json()).items;
    assert.equal((await kbPATCH(req(`/api/admin/knowledge/${items[0].id}`, { method: 'PATCH', body: { content: 'x' }, cookie: staff }), ctx(items[0].id))).status, 403);
  });

  it('pricing rules: payment links only on approved prices; draft needs a price', async () => {
    const owner = await adminCookie('owner');
    const services = (await (await servicesGET(req('/api/admin/services', { cookie: owner }))).json()).services;
    const m = services.find((s: { slug: string }) => s.slug === 'remedial-massage-30');
    const r = await servicePATCH(req(`/api/admin/services/${m.id}`, { method: 'PATCH', body: { payment_link_url: 'https://buy.stripe.com/test' }, cookie: owner }), ctx(m.id));
    assert.equal(r.status, 422);
    const r2 = await servicePATCH(req(`/api/admin/services/${m.id}`, { method: 'PATCH', body: { price_cents: null }, cookie: owner }), ctx(m.id));
    assert.equal(r2.status, 422);
  });

  it('owner manages users with password policy', async () => {
    const owner = await adminCookie('owner');
    assert.equal((await usersPOST(req('/api/admin/users', { body: { email: 'coach@asparc.test', password: 'weak', role: 'staff' }, cookie: owner }))).status, 422);
    const ok = await usersPOST(req('/api/admin/users', { body: { email: 'coach@asparc.test', password: 'StrongPassword123', role: 'staff' }, cookie: owner }));
    assert.equal(ok.status, 201);
    assert.ok(!('password_hash' in (await ok.json()).user));
  });

  it('middleware redirects /admin to login without a session', async () => {
    const r = (await middleware(new Request('http://localhost/admin/leads')))!;
    assert.equal(r.status, 307);
    assert.match(r.headers.get('location')!, /\/admin\/login\?next=%2Fadmin%2Fleads/);
    assert.equal(await middleware(new Request('http://localhost/admin/leads', { headers: { cookie: await adminCookie('staff') } })), undefined);
  });
});

describe('admin data flows', () => {
  beforeEach(() => freshDb());

  it('overview, leads search, lead detail, bookings, academy reflect real records only', async () => {
    const cookie = await adminCookie('owner');
    const empty = await (await overviewGET(req('/api/admin/overview', { cookie }))).json();
    assert.equal(empty.kpis.totalEnquiries, 0);
    assert.equal(empty.kpis.revenue.connected, false);

    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'booking', full_name: 'Bobby Booker', email: 'bobby@example.com' }) }));
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'academy', email: 'parent@example.com', full_name: 'Pat Parent', is_guardian: true, athlete_age_group: '8-10', athlete_first_name: 'Jo', service_interest: undefined }) }));

    const o = await (await overviewGET(req('/api/admin/overview', { cookie }))).json();
    assert.equal(o.kpis.totalEnquiries, 2);
    assert.equal(o.kpis.bookingRequests, 1);
    assert.equal(o.kpis.academyRegistrations, 1);
    assert.equal(o.daily.length, 30);

    const found = (await (await leadsGET(req('/api/admin/leads?q=bobby', { cookie }))).json()).leads;
    assert.equal(found.length, 1);
    assert.equal(found[0].customer.full_name, 'Bobby Booker');
    const detail = await (await leadGET(req(`/api/admin/leads/${found[0].id}`, { cookie }), ctx(found[0].id))).json();
    assert.equal(detail.bookings.length, 1);

    const bookings = (await (await bookingsGET(req('/api/admin/bookings', { cookie }))).json()).bookings;
    const b = await bookingPATCH(req(`/api/admin/bookings/${bookings[0].id}`, { method: 'PATCH', body: { status: 'confirmed_by_staff' }, cookie }), ctx(bookings[0].id));
    assert.equal(b.status, 200);
    assert.equal((await db().get('leads', found[0].id))!.stage, 'converted');

    const academy = await (await academyGET(req('/api/admin/academy', { cookie }))).json();
    assert.equal(academy.registrations[0].customer.full_name, 'Pat Parent');
    assert.equal(academy.program.price_cents, 38000);
  });

  it('revenue reports "not connected" instead of showing figures without Stripe', async () => {
    const r = await (await revenueGET(req('/api/admin/revenue', { cookie: await adminCookie('owner') }))).json();
    assert.deepEqual(r, { connected: false, payments: [], totalCents: 0 });
  });

  it('integrations endpoint reports status without leaking secrets', async () => {
    process.env.OPENAI_API_KEY = 'sk-secret-value';
    const r = await (await integrationsGET(req('/api/admin/integrations', { cookie: await adminCookie('manager') }))).json();
    assert.ok(!JSON.stringify(r).includes('sk-secret-value'));
    assert.equal(r.integrations.find((i: { key: string }) => i.key === 'openai').state, 'connected');
    assert.equal(r.integrations.find((i: { key: string }) => i.key === 'hubspot').state, 'not_configured');
    assert.equal(r.integrations.find((i: { key: string }) => i.key === 'whatsapp').state, 'not_started');
  });

  it('notifications list unread counts', async () => {
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry() }));
    const n = await (await notificationsGET(req('/api/admin/notifications', { cookie: await adminCookie('staff') }))).json();
    assert.equal(n.unread, 1);
  });

  it('chat API validates input and returns an AI reply', async () => {
    assert.equal((await chatPOST(req('/api/chat', { body: { visitorId: 'bad', message: 'hi' } }))).status, 422);
    const r = await chatPOST(req('/api/chat', { body: { visitorId: VISITOR, message: 'what is the academy?' } }));
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.conversationId);
    assert.match(body.reply, /Academy|academy/);
  });

  it('chat → in-chat form → lead linked to the conversation', async () => {
    const c = await (await chatPOST(req('/api/chat', { body: { visitorId: VISITOR, message: 'I run a local football club' } }))).json();
    assert.ok(c.actions.some((a: { form: string }) => a.form === 'club'));
    const r = await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'club', club_name: 'Local FC', conversation_id: c.conversationId }) }));
    assert.equal(r.status, 201);
    const convo = await db().get('conversations', c.conversationId);
    assert.ok(convo!.lead_id);
    const msgs = await db().list('messages', { eq: { conversation_id: c.conversationId } });
    assert.ok(msgs.some((m) => /Nothing has been booked/.test(m.content)));
  });

  it('owner can delete a customer’s data (privacy request); staff cannot', async () => {
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry() }));
    const [cust] = await db().list('customers');
    assert.equal((await customerDELETE(req(`/api/admin/customers/${cust.id}`, { method: 'DELETE', cookie: await adminCookie('staff') }), ctx(cust.id))).status, 403);
    assert.equal((await customerDELETE(req(`/api/admin/customers/${cust.id}`, { method: 'DELETE', cookie: await adminCookie('owner') }), ctx(cust.id))).status, 200);
    assert.equal((await db().list('customers')).length, 0);
    assert.equal((await db().list('leads')).length, 0);
  });
});

describe('daily summary & cron', () => {
  beforeEach(() => freshDb({ CRON_SECRET: 'cron-test-secret' }));

  it('cron requires the secret', async () => {
    assert.equal((await cronGET(req('/api/cron/daily-summary'))).status, 401);
  });

  it('summarises a Melbourne day from real records, stores it and notifies', async () => {
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ form: 'academy', is_guardian: true, athlete_age_group: '14-16', athlete_first_name: 'Sam', service_interest: undefined }) }));
    await enquiryPOST(req('/api/enquiries', { body: validEnquiry({ email: 'b@example.com', form: 'booking', service_interest: 'Speed Development', preferred_days: 'Mon' }) }));
    const { melbourneDate } = await import('../lib/time/melbourne');
    const today = melbourneDate();
    const r = await cronGET(req(`/api/cron/daily-summary?date=${today}`, { headers: { authorization: 'Bearer cron-test-secret' } }));
    assert.equal(r.status, 200);
    const [s] = await db().list('daily_summaries');
    const data = s.data as { totalEnquiries: number; academyEnquiries: number; bookingRequests: number; timezone: string; payments: { connected: boolean } };
    assert.equal(data.totalEnquiries, 2);
    assert.equal(data.academyEnquiries, 1);
    assert.equal(data.bookingRequests, 1);
    assert.equal(data.timezone, 'Australia/Melbourne');
    assert.equal(data.payments.connected, false);
    assert.equal(s.email_status, 'not_configured');
    assert.ok((await db().list('notifications')).some((n) => n.type === 'daily_summary'));
    // re-running the same date updates rather than duplicates
    await reportRunPOST(req('/api/admin/reports/run', { body: { date: today }, cookie: await adminCookie('manager') }));
    assert.equal((await db().list('daily_summaries')).length, 1);
  });
});

describe('Phase 2 channel is inactive', () => {
  beforeEach(() => freshDb());
  it('WhatsApp webhook refuses until enabled & configured', async () => {
    assert.equal((await waGET(req('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1'))).status, 503);
  });
});
