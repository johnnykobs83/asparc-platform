import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { POST as integrationTestPOST } from '../app/api/admin/integrations/test/route';
import { chatRequestBody, isReasoningModel } from '../lib/ai/openai';
import { env } from '../lib/config/env';
import { db } from '../lib/db';
import { emailSubject, notify } from '../lib/notifications/service';
import { adminCookie, freshDb, mockFetch, req } from './helpers';

const TOOLS = [{ type: 'function', function: { name: 't', parameters: { type: 'object', properties: {} } } }];
const MSGS = [{ role: 'user' as const, content: 'Hi' }];

describe('OpenAI model change (gpt-4o-mini is removed on 14 Jan 2027)', () => {
  beforeEach(() => freshDb());

  it('defaults to gpt-6-luna and can still be overridden with OPENAI_MODEL', () => {
    assert.equal(env.openaiModel, 'gpt-6-luna');
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    assert.equal(env.openaiModel, 'gpt-4o-mini');
    delete process.env.OPENAI_MODEL;
  });

  it('sends reasoning models reasoning_effort "none" and max_completion_tokens, with no temperature', () => {
    for (const m of ['gpt-6-luna', 'gpt-6-sol', 'gpt-5.6-mini', 'o4-mini']) assert.ok(isReasoningModel(m), m);
    const body = chatRequestBody('gpt-6-luna', MSGS, TOOLS) as Record<string, unknown>;
    assert.equal(body.reasoning_effort, 'none', 'Luna only allows function calling on Chat Completions with reasoning off');
    assert.equal(body.max_completion_tokens, 1000);
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.temperature, undefined);
    assert.equal(body.tool_choice, 'auto');
  });

  it('keeps the old settings for older chat models, and leaves tools out when there are none', () => {
    const old = chatRequestBody('gpt-4o-mini', MSGS, TOOLS) as Record<string, unknown>;
    assert.deepEqual([old.temperature, old.max_tokens, old.reasoning_effort], [0.3, 500, undefined]);
    const noTools = chatRequestBody('gpt-6-luna', MSGS, []) as Record<string, unknown>;
    assert.equal(noTools.tools, undefined);
    assert.equal(noTools.tool_choice, undefined);
  });

  it('the dashboard connection test now sends a real chat request with the configured model', async () => {
    freshDb({ OPENAI_API_KEY: 'sk-test' });
    const calls = mockFetch([[/POST https:\/\/api\.openai\.com\/v1\/chat\/completions/, () => ({ body: { choices: [{ message: { role: 'assistant', content: 'OK' } }] } })]]);
    const r = await integrationTestPOST(req('/api/admin/integrations/test', { body: { integration: 'openai' }, cookie: await adminCookie('owner') }));
    const body = (await r.json()) as { ok: boolean; message: string };
    assert.equal(body.ok, true);
    assert.match(body.message, /gpt-6-luna.*OK/);
    const sent = calls[0].body as Record<string, unknown>;
    assert.equal(sent.model, 'gpt-6-luna');
    assert.equal(sent.reasoning_effort, 'none');

    mockFetch([[/POST https:\/\/api\.openai\.com/, () => ({ status: 400, body: { error: { message: 'bad parameter' } } })]]);
    const bad = (await (await integrationTestPOST(req('/api/admin/integrations/test', { body: { integration: 'openai' }, cookie: await adminCookie('owner') }))).json()) as { ok: boolean; message: string };
    assert.equal(bad.ok, false);
    assert.match(bad.message, /gpt-6-luna: OpenAI 400/);
  });
});

describe('Notification email subjects', () => {
  beforeEach(() => freshDb({ RESEND_API_KEY: 're_test', RESEND_FROM: 'ASPARC <performance@asparc.com.au>', NOTIFY_EMAIL_TO: 'performance@asparc.com.au' }));

  it('no longer repeats the label ("New qualified lead: Qualified lead: …")', async () => {
    assert.equal(emailSubject('qualified_lead', 'Qualified lead: Jane Smith'), '[ASPARC] New qualified lead: Jane Smith');
    assert.equal(emailSubject('payment_confirmation', 'Invoice paid: $2,400 – Club A'), '[ASPARC] Payment confirmation: Invoice paid: $2,400 – Club A');
    assert.equal(emailSubject('complaint', 'Jane is unhappy'), '[ASPARC] Complaint: Jane is unhappy');

    const calls = mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'e1' } })]]);
    await notify({ type: 'qualified_lead', title: 'Qualified lead: Jane Smith', body: 'x', email: true });
    assert.equal((calls[0].body as { subject: string }).subject, '[ASPARC] New qualified lead: Jane Smith');
    assert.equal((await db().list('notifications'))[0].title, 'Qualified lead: Jane Smith', 'the dashboard title is unchanged');
  });
});
