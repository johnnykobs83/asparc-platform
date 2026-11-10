import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { GET as metaGET, POST as metaPOST } from '../app/api/webhooks/meta/route';
import { POST as stripePOST } from '../app/api/webhooks/stripe/route';
import { POST as waPOST } from '../app/api/webhooks/whatsapp/route';
import { PATCH as convoPATCH } from '../app/api/admin/conversations/[id]/route';
import { POST as replyPOST } from '../app/api/admin/conversations/[id]/reply/route';
import { GET as revenueGET } from '../app/api/admin/revenue/route';
import { OPT_IN_REPLY, OPT_OUT_REPLY } from '../lib/channels/inbound';
import { chunkText } from '../lib/channels/messenger';
import { db } from '../lib/db';
import { integrationStatuses } from '../lib/config/env';
import { verifyStripeSignature } from '../lib/integrations/stripe';
import { REPLY_WINDOW_MS, sendStaffReply } from '../lib/channels/handover';
import { adminCookie, ctx, freshDb, mockFetch, req, type FetchCall } from './helpers';

const raw = (path: string, body: string, headers: Record<string, string>) =>
  new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', host: 'localhost', ...headers }, body });

// ---------------------------------------------------------------- Stripe
const WHSEC = 'whsec_test_secret_value';
const stripeSig = (body: string, t = Math.floor(Date.now() / 1000), secret = WHSEC) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const stripeReq = (event: unknown, sig?: string) => {
  const body = JSON.stringify(event);
  return raw('/api/webhooks/stripe', body, { 'stripe-signature': sig ?? stripeSig(body) });
};
const checkout = (over: Record<string, unknown> = {}, type = 'checkout.session.completed') => ({
  id: 'evt_1',
  type,
  created: 1_800_000_000,
  data: { object: { id: 'cs_test_1', payment_intent: 'pi_test_1', amount_total: 38000, currency: 'aud', payment_status: 'paid', customer_details: { email: 'Parent@Example.com' }, ...over } },
});

describe('Phase 4 – Stripe webhook', () => {
  beforeEach(() => freshDb());

  it('is inactive until STRIPE_WEBHOOK_SECRET is set', async () => {
    assert.equal((await stripePOST(stripeReq(checkout()))).status, 503);
  });

  it('rejects missing, wrong and stale signatures', async () => {
    freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC });
    const body = JSON.stringify(checkout());
    assert.equal((await stripePOST(raw('/api/webhooks/stripe', body, {}))).status, 401);
    assert.equal((await stripePOST(raw('/api/webhooks/stripe', body, { 'stripe-signature': stripeSig(body, undefined, 'whsec_wrong') }))).status, 401);
    const old = Math.floor(Date.now() / 1000) - 3600;
    assert.equal((await stripePOST(raw('/api/webhooks/stripe', body, { 'stripe-signature': stripeSig(body, old) }))).status, 401);
    // signature for a different body must not validate this one
    assert.equal(verifyStripeSignature(body + ' ', stripeSig(body)), false);
    assert.equal((await db().list('payments')).length, 0);
  });

  it('records a successful payment once, links the customer and notifies staff', async () => {
    freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC });
    const customer = await db().insert('customers', { full_name: 'Test Parent', email: 'parent@example.com', consent_contact: true });
    const r = await stripePOST(stripeReq(checkout()));
    assert.equal(r.status, 200);
    // Stripe redelivers events – the second delivery must not duplicate anything
    assert.equal((await stripePOST(stripeReq(checkout()))).status, 200);

    const payments = await db().list('payments');
    assert.equal(payments.length, 1);
    assert.equal(payments[0].provider_ref, 'pi_test_1');
    assert.equal(payments[0].amount_cents, 38000);
    assert.equal(payments[0].status, 'succeeded');
    assert.equal(payments[0].customer_id, customer.id);
    assert.ok(payments[0].paid_at);

    const notes = (await db().list('notifications')).filter((n) => n.type === 'payment_confirmation');
    assert.equal(notes.length, 1);
    assert.match(notes[0].body, /does not confirm a booking/);
  });

  it('keeps unpaid sessions pending and marks async failures', async () => {
    freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC });
    await stripePOST(stripeReq(checkout({ payment_status: 'unpaid' })));
    assert.equal((await db().list('payments'))[0].status, 'pending');
    assert.equal((await db().list('notifications')).length, 0);
    await stripePOST(stripeReq(checkout({ payment_status: 'unpaid' }, 'checkout.session.async_payment_failed')));
    const p = await db().list('payments');
    assert.equal(p.length, 1);
    assert.equal(p[0].status, 'failed');
  });

  it('marks full refunds, ignores partial refunds and unknown events', async () => {
    freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC });
    await stripePOST(stripeReq(checkout()));
    const refund = (refunded: boolean) => ({ id: 'evt_2', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_test_1', refunded } } });
    await stripePOST(stripeReq(refund(false)));
    assert.equal((await db().list('payments'))[0].status, 'succeeded');
    await stripePOST(stripeReq(refund(true)));
    assert.equal((await db().list('payments'))[0].status, 'refunded');
    const other = await stripePOST(stripeReq({ id: 'evt_3', type: 'customer.created', data: { object: {} } }));
    assert.equal(other.status, 200);
    assert.equal((await other.json()).handled, false);
  });

  it('revenue page reports only succeeded payments', async () => {
    freshDb({ STRIPE_WEBHOOK_SECRET: WHSEC });
    await stripePOST(stripeReq(checkout()));
    await stripePOST(stripeReq(checkout({ id: 'cs_2', payment_intent: 'pi_test_2', payment_status: 'unpaid', amount_total: 6000 })));
    const r = await (await revenueGET(req('/api/admin/revenue', { cookie: await adminCookie('owner') }))).json();
    assert.equal(r.connected, true);
    assert.equal(r.totalCents, 38000);
    assert.equal(r.payments.length, 2);
  });
});

// ---------------------------------------------------------------- Meta channels
const APP_SECRET = 'meta_app_secret_test';
const metaSig = (body: string, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const WA_ENV = { WHATSAPP_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'wa_token', WHATSAPP_PHONE_NUMBER_ID: '1234567890', WHATSAPP_VERIFY_TOKEN: 'verify_me', META_APP_SECRET: APP_SECRET };
const MSG_ENV = { META_MESSENGER_ENABLED: 'true', META_PAGE_ACCESS_TOKEN: 'page_token', META_VERIFY_TOKEN: 'verify_me', META_APP_SECRET: APP_SECRET };

const waText = (text: string, id: string, from = '61400000000') => ({ entry: [{ changes: [{ value: { messages: [{ id, from, type: 'text', text: { body: text } }] } }] }] });
const waReq = (payload: unknown, sig?: string) => {
  const body = JSON.stringify(payload);
  return raw('/api/webhooks/whatsapp', body, { 'x-hub-signature-256': sig ?? metaSig(body) });
};
const graph = () => mockFetch([[/POST https:\/\/graph\.facebook\.com\//, () => ({ body: { messages: [{ id: 'out' }] } })]]);
const sentText = (c: FetchCall) => {
  const b = c.body as { text?: { body: string }; interactive?: { body: { text: string } }; message?: { text: string } };
  return b.text?.body ?? b.interactive?.body.text ?? b.message?.text ?? '';
};

describe('Phase 2 – WhatsApp channel', () => {
  beforeEach(() => freshDb(WA_ENV));

  it('rejects unsigned or wrongly signed webhooks', async () => {
    const calls = graph();
    assert.equal((await waPOST(waReq(waText('hello', 'm1'), 'sha256=00'))).status, 401);
    assert.equal((await waPOST(waReq(waText('hello', 'm1'), metaSig(JSON.stringify(waText('hello', 'm1')), 'other')))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await db().list('conversations')).length, 0);
  });

  it('answers through the same receptionist, with AI disclosure, and never stores the phone number', async () => {
    const calls = graph();
    assert.equal((await waPOST(waReq(waText('Tell me about the Performance Academy', 'm1')))).status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/1234567890\/messages$/);
    assert.equal(calls[0].headers.Authorization, 'Bearer wa_token');
    assert.match(sentText(calls[0]), /AI assistant/);
    const convos = await db().list('conversations');
    assert.equal(convos.length, 1);
    assert.equal(convos[0].channel, 'whatsapp');
    assert.ok(!convos[0].visitor_id.includes('61400000000'));
  });

  it('applies the safety layer: emergencies get 000', async () => {
    const calls = graph();
    await waPOST(waReq(waText("I think I broke my leg and I can't breathe", 'm1')));
    assert.match(sentText(calls[0]), /000/);
  });

  it('processes a redelivered message only once', async () => {
    const calls = graph();
    await waPOST(waReq(waText('What are your massage prices?', 'm1')));
    await waPOST(waReq(waText('What are your massage prices?', 'm1')));
    assert.equal(calls.length, 1);
    assert.equal((await db().list('messages')).filter((m) => m.role === 'user').length, 1);
  });

  it('STOP opts out, further messages are ignored, START opts back in', async () => {
    const calls = graph();
    await waPOST(waReq(waText('hello', 'm1')));
    await waPOST(waReq(waText('STOP', 'm2')));
    assert.equal(sentText(calls[1]), OPT_OUT_REPLY);
    await waPOST(waReq(waText('are you there?', 'm3')));
    await waPOST(waReq(waText('stop', 'm4')));
    assert.equal(calls.length, 2, 'no replies while opted out');
    await waPOST(waReq(waText('Start', 'm5')));
    assert.equal(sentText(calls[2]), OPT_IN_REPLY);
    await waPOST(waReq(waText('Tell me about the Performance Academy', 'm6')));
    assert.equal(calls.length, 4);
    assert.equal((await db().list('conversations')).length, 1);
  });

  it('accepts a tap on a reply button as a message', async () => {
    const calls = graph();
    const payload = { entry: [{ changes: [{ value: { messages: [{ id: 'm1', from: '61400000000', type: 'interactive', interactive: { button_reply: { id: 'opt_0', title: 'Club partnerships' } } }] } }] }] };
    assert.equal((await waPOST(waReq(payload))).status, 200);
    assert.equal(calls.length, 1);
    assert.equal((await db().list('messages')).find((m) => m.role === 'user')?.content, 'Club partnerships');
  });

  it('never sends more than 3 buttons or over-long button titles', async () => {
    const calls = graph();
    for (const [i, text] of ['hello', 'Tell me about the Performance Academy', 'What are your massage prices?', 'club partnership'].entries()) {
      await waPOST(waReq(waText(text, `m${i}`, `6140000000${i}`)));
    }
    for (const c of calls) {
      const b = c.body as { type: string; interactive?: { action: { buttons: { reply: { title: string } }[] } } };
      if (b.type !== 'interactive') continue;
      assert.ok(b.interactive!.action.buttons.length <= 3);
      for (const btn of b.interactive!.action.buttons) assert.ok(btn.reply.title.length <= 20);
    }
  });
});

describe('Phase 3 – Messenger & Instagram channel', () => {
  beforeEach(() => freshDb());

  const metaReq = (payload: unknown, sig?: string) => {
    const body = JSON.stringify(payload);
    return raw('/api/webhooks/meta', body, { 'x-hub-signature-256': sig ?? metaSig(body) });
  };
  const dm = (object: string, text: string, mid: string, extra: Record<string, unknown> = {}) => ({ object, entry: [{ messaging: [{ sender: { id: 'PSID_123' }, message: { mid, text, ...extra } }] }] });

  it('is inactive until enabled and configured', async () => {
    assert.equal((await metaGET(req('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=42'))).status, 503);
    assert.equal((await metaPOST(metaReq(dm('page', 'hello', 'mid1')))).status, 503);
  });

  it('completes the verification handshake only with the right token', async () => {
    freshDb(MSG_ENV);
    const ok = await metaGET(req('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=42'));
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '42');
    assert.equal((await metaGET(req('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42'))).status, 403);
  });

  it('routes page → facebook and instagram → instagram, ignoring echoes and bad signatures', async () => {
    freshDb(MSG_ENV);
    const calls = graph();
    assert.equal((await metaPOST(metaReq(dm('page', 'hello', 'mid1'), 'sha256=00'))).status, 401);
    await metaPOST(metaReq(dm('page', 'Tell me about the Performance Academy', 'mid1')));
    await metaPOST(metaReq(dm('instagram', 'What are your massage prices?', 'mid2')));
    await metaPOST(metaReq(dm('page', 'our own reply', 'mid3', { is_echo: true })));
    assert.ok(calls.length >= 2);
    for (const c of calls) {
      assert.match(c.url, /\/me\/messages$/);
      assert.equal(c.headers.Authorization, 'Bearer page_token');
      const b = c.body as { recipient: { id: string }; messaging_type: string; message: { text: string; quick_replies?: { title: string }[] } };
      assert.equal(b.recipient.id, 'PSID_123');
      assert.equal(b.messaging_type, 'RESPONSE');
      assert.ok(b.message.text.length <= 2000);
      for (const q of b.message.quick_replies ?? []) assert.ok(q.title.length <= 20);
    }
    const channels = (await db().list('conversations')).map((c) => c.channel).sort();
    assert.deepEqual(channels, ['facebook', 'instagram']);
  });

  it('splits long replies to fit the platform limit without losing text', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about training and recovery.`).join(' ');
    const parts = chunkText(text, 1000);
    assert.ok(parts.length > 1);
    for (const p of parts) assert.ok(p.length <= 1000);
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  });
});

describe('Integration status for later phases', () => {
  const stateOf = (key: string) => integrationStatuses().find((i) => i.key === key)!;

  it('shows later phases as prepared until configured, and never as connected when partly set up', () => {
    freshDb();
    for (const k of ['whatsapp', 'messenger', 'stripe', 'cliniko']) assert.equal(stateOf(k).state, 'not_started');
    freshDb({ WHATSAPP_ACCESS_TOKEN: 'x' });
    assert.equal(stateOf('whatsapp').state, 'partially_configured');
    assert.ok(stateOf('whatsapp').missing.includes('WHATSAPP_ENABLED=true'));
    // all credentials but not switched on is still not "connected"
    freshDb({ ...WA_ENV, WHATSAPP_ENABLED: 'false' });
    assert.equal(stateOf('whatsapp').state, 'partially_configured');
  });

  it('shows connected only when everything is present and switched on', () => {
    freshDb({ ...WA_ENV, ...MSG_ENV, STRIPE_WEBHOOK_SECRET: WHSEC });
    assert.equal(stateOf('whatsapp').state, 'connected');
    assert.equal(stateOf('messenger').state, 'connected');
    assert.equal(stateOf('stripe').state, 'connected');
    assert.equal(stateOf('cliniko').state, 'not_started');
    assert.deepEqual(stateOf('stripe').missing, []);
  });
});

describe('Hand-over – staff replies from the dashboard', () => {
  beforeEach(() => freshDb(WA_ENV));
  const convo = async () => (await db().list('conversations'))[0];
  const reply = async (id: string, message: string, role: 'owner' | 'manager' | 'staff' = 'staff') =>
    replyPOST(req(`/api/admin/conversations/${id}/reply`, { body: { message }, cookie: await adminCookie(role) }), ctx(id));

  it('requires a signed-in admin', async () => {
    graph();
    await waPOST(waReq(waText('hello', 'm1')));
    const id = (await convo()).id;
    assert.equal((await replyPOST(req(`/api/admin/conversations/${id}/reply`, { body: { message: 'hi' } }), ctx(id))).status, 401);
  });

  it('sends the reply to the customer, labels it as staff and pauses the AI', async () => {
    const calls = graph();
    await waPOST(waReq(waText('Can someone call me about the Academy?', 'm1')));
    const id = (await convo()).id;
    const r = await reply(id, 'Hi, this is Sam from ASPARC – happy to help.');
    assert.equal(r.status, 201);
    assert.equal(sentText(calls[1]), 'Hi, this is Sam from ASPARC – happy to help.');
    assert.equal((calls[1].body as { to: string }).to, '61400000000');
    const msgs = await db().list('messages', { eq: { conversation_id: id }, orderBy: 'created_at', ascending: true });
    assert.equal((msgs[msgs.length - 1].metadata as { staff?: string }).staff, 'staff@asparc.test');

    // the customer's next message goes to staff, not the AI
    await waPOST(waReq(waText('Thanks, tomorrow morning works', 'm2')));
    assert.equal(calls.length, 2, 'AI stayed silent');
    const c = await convo();
    assert.equal(c.needs_attention, true);
    assert.match(c.attention_reason ?? '', /staff member is handling/);
    assert.equal((await db().list('conversations')).length, 1);
  });

  it('still answers emergencies with 000 while staff are handling the chat', async () => {
    const calls = graph();
    await waPOST(waReq(waText('hello', 'm1')));
    await reply((await convo()).id, 'Hi from the team');
    await waPOST(waReq(waText("My son collapsed and can't breathe", 'm2')));
    assert.equal(calls.length, 3);
    assert.match(sentText(calls[2]), /000/);
  });

  it('handing back lets ASPARC AI answer again', async () => {
    const calls = graph();
    await waPOST(waReq(waText('hello', 'm1')));
    const id = (await convo()).id;
    await reply(id, 'Hi from the team');
    const back = await convoPATCH(req(`/api/admin/conversations/${id}`, { method: 'PATCH', body: { human_takeover: false }, cookie: await adminCookie('staff') }), ctx(id));
    assert.equal(back.status, 200);
    await waPOST(waReq(waText('What are your massage prices?', 'm2')));
    assert.equal(calls.length, 3);
  });

  it('refuses outside the 24-hour window, after STOP, and for website chats', async () => {
    const calls = graph();
    await waPOST(waReq(waText('hello', 'm1')));
    const id = (await convo()).id;
    const late = await sendStaffReply(id, 'too late', 'staff@asparc.test', Date.now() + REPLY_WINDOW_MS + 60_000);
    assert.equal(late.ok, false);
    assert.match(late.ok ? '' : late.error, /24-hour/);

    await waPOST(waReq(waText('STOP', 'm2')));
    const n = calls.length;
    const stopped = await reply(id, 'hello again');
    assert.equal(stopped.status, 422);
    assert.match((await stopped.json()).error, /opted out/);

    const web = await db().insert('conversations', { channel: 'website', visitor_id: 'visitor_web_1', status: 'open', state: {} });
    assert.equal((await reply(web.id, 'hi')).status, 422);
    assert.equal(calls.length, n, 'nothing was sent');
    assert.equal((await reply('00000000-0000-4000-8000-000000000000', 'hi')).status, 404);
  });

  it('reports a failed send instead of pretending it was delivered', async () => {
    graph();
    await waPOST(waReq(waText('hello', 'm1')));
    const id = (await convo()).id;
    mockFetch([[/POST https:\/\/graph\.facebook\.com\//, () => ({ status: 500, body: { error: 'down' } })]]);
    const r = await reply(id, 'are you there?');
    assert.equal(r.status, 502);
    const msgs = await db().list('messages', { eq: { conversation_id: id } });
    assert.ok(!msgs.some((m) => m.content === 'are you there?'));
    assert.notEqual(((await convo()).state as { human_takeover?: boolean }).human_takeover, true);
  });
});
