import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { handleChatMessage } from '../lib/ai/receptionist';
import { db } from '../lib/db';
import { VISITOR, freshDb, mockFetch } from './helpers';

const send = (message: string, conversationId?: string) => handleChatMessage({ visitorId: VISITOR, message, conversationId, channel: 'website' });

describe('receptionist – guided mode (no OpenAI key)', () => {
  beforeEach(() => freshDb());

  it('first reply discloses it is an AI and never claims to be human', async () => {
    const r = await send('hello');
    assert.equal(r.mode, 'guided');
    assert.match(r.reply, /AI assistant/);
    assert.match(r.reply, /not a person/);
    const human = await send('are you a real person?', r.conversationId);
    assert.match(human.reply, /AI assistant, not a person/);
  });

  it('answers academy questions with draft pricing and shows the parent registration form', async () => {
    const r = await send('My son is 12, tell me about the academy');
    assert.match(r.reply, /10-week/);
    assert.match(r.reply, /\$380/);
    assert.match(r.reply, /draft pricing – subject to confirmation/);
    assert.match(r.reply, /parent or guardian/);
    assert.ok(r.actions.some((a) => a.type === 'enquiry_form' && a.form === 'academy'));
  });

  it('massage prices are marked draft and availability pending', async () => {
    const r = await send('how much is a remedial massage?');
    assert.match(r.reply, /\$60/);
    assert.match(r.reply, /\$100/);
    assert.match(r.reply, /draft pricing/);
    assert.match(r.reply, /availability being confirmed/);
  });

  it('never diagnoses – redirects medical questions to a practitioner', async () => {
    const r = await send('I think I have a torn hamstring, what should I do?');
    assert.match(r.reply, /can't diagnose/);
    assert.match(r.reply, /doctor|physiotherapist/);
  });

  it('directs emergencies to 000 and alerts management', async () => {
    const r = await send('someone just collapsed at training and is not breathing');
    assert.match(r.reply, /000/);
    const n = await db().list('notifications');
    assert.ok(n.some((x) => x.severity === 'urgent'));
    const c = await db().get('conversations', r.conversationId);
    assert.ok(c?.needs_attention);
  });

  it('escalates complaints', async () => {
    const r = await send('I want to make a complaint, the coach was rude');
    assert.match(r.reply, /management/);
    const c = await db().get('conversations', r.conversationId);
    assert.equal(c?.status, 'escalated');
    assert.ok((await db().list('notifications')).some((n) => n.type === 'complaint'));
  });

  it('removes card numbers before storing the message', async () => {
    const r = await send('can I pay now? my card is 4242 4242 4242 4242');
    assert.match(r.reply, /don’t share card/);
    const msgs = await db().list('messages', { eq: { conversation_id: r.conversationId } });
    assert.ok(msgs.every((m) => !m.content.includes('4242 4242')));
  });

  it('does not claim testing equipment is available', async () => {
    const r = await send('do you have force plate testing?');
    // Answers with the confirmed testing menu and an enquiry prompt – never an equipment claim.
    assert.match(r.reply, /enquiry/i);
    assert.doesNotMatch(r.reply, /force plate|VALD|ForceDecks/i);
  });

  it('logs unanswered questions for management', async () => {
    const r = await send('Do you sell protein powder supplements?');
    assert.match(r.reply, /passed your question/);
    assert.ok((await db().list('notifications')).some((n) => n.type === 'unresolved_question'));
  });

  it('booking enquiries say online booking is not live and offer a request form', async () => {
    const r = await send('can I book a session for Thursday?');
    assert.match(r.reply, /not available yet|not live/i);
    assert.ok(r.actions.some((a) => a.type === 'enquiry_form' && a.form === 'booking'));
  });

  it('records the full conversation', async () => {
    const a = await send('hi');
    await send('tell me about speed training', a.conversationId);
    const msgs = await db().list('messages', { eq: { conversation_id: a.conversationId } });
    assert.equal(msgs.length, 4);
  });

  it('a different visitor cannot continue someone else’s conversation', async () => {
    const a = await send('hi');
    const b = await handleChatMessage({ visitorId: 'someone_else_123456789', message: 'hi', conversationId: a.conversationId });
    assert.notEqual(a.conversationId, b.conversationId);
  });
});

describe('receptionist – OpenAI mode (mocked API)', () => {
  beforeEach(() => freshDb({ OPENAI_API_KEY: 'sk-test' }));

  it('runs controlled function calls and captures a lead only with consent', async () => {
    let round = 0;
    const calls = mockFetch([
      [
        /POST https:\/\/api\.openai\.com\/v1\/chat\/completions/,
        (c) => {
          round++;
          const body = c.body as { messages: { role: string; content: string }[]; tools: unknown[] };
          if (round === 1) {
            assert.match(body.messages[0].content, /HARD RULES/);
            assert.match(body.messages[0].content, /\$380 per 10-week program \(draft pricing/);
            return {
              body: {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'call_1',
                          type: 'function',
                          function: {
                            name: 'capture_lead',
                            arguments: JSON.stringify({ full_name: 'Sam Parent', email: 'sam@example.com', lead_type: 'academy', athlete_age_group: '11-13', is_guardian: true, consent_to_contact: true }),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            };
          }
          const toolMsg = body.messages.find((m) => m.role === 'tool');
          assert.match(toolMsg!.content, /"saved":true/);
          return { body: { choices: [{ message: { role: 'assistant', content: "Thanks Sam – I've passed your details to the team." } }] } };
        },
      ],
    ]);
    const r = await send("I'm Sam, sam@example.com, my daughter is 12 and I'd like the academy – yes you can contact me");
    assert.equal(r.mode, 'openai');
    assert.match(r.reply, /AI assistant/); // disclosure prepended in code
    assert.equal(calls.length, 2);
    const leads = await db().list('leads');
    assert.equal(leads.length, 1);
    assert.equal(leads[0].lead_type, 'academy');
    assert.equal(leads[0].source, 'website_chat');
    assert.equal(leads[0].conversation_id, r.conversationId);
    const tool = (await db().list('messages')).find((m) => m.role === 'tool')!;
    assert.equal((tool.metadata.arguments as Record<string, string>).email, '[recorded]');
  });

  it('refuses capture_lead without consent', async () => {
    let round = 0;
    mockFetch([
      [
        /chat\/completions/,
        (c) => {
          round++;
          if (round === 1)
            return { body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'capture_lead', arguments: JSON.stringify({ full_name: 'No Consent', email: 'n@example.com', lead_type: 'general', consent_to_contact: false }) } }] } }] } };
          const t = (c.body as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'tool')!;
          assert.match(t.content, /Consent to contact has not been given/);
          return { body: { choices: [{ message: { role: 'assistant', content: 'May I have your permission to contact you?' } }] } };
        },
      ],
    ]);
    await send('my email is n@example.com');
    assert.equal((await db().list('leads')).length, 0);
  });

  it('corrects a model that falsely confirms a booking', async () => {
    mockFetch([[/chat\/completions/, () => ({ body: { choices: [{ message: { role: 'assistant', content: "You're booked in for Tuesday 5pm!" } }] } })]]);
    const r = await send('book me tuesday 5pm');
    assert.doesNotMatch(r.reply, /booked in/);
    assert.match(r.reply, /Nothing is confirmed/);
    const c = await db().get('conversations', r.conversationId);
    assert.match(c!.attention_reason!, /false_confirmation/);
  });

  it('blocks invented prices from the model', async () => {
    mockFetch([[/chat\/completions/, () => ({ body: { choices: [{ message: { role: 'assistant', content: 'Personal training is $85 per hour.' } }] } })]]);
    const r = await send('how much is PT?');
    assert.doesNotMatch(r.reply, /\$85/);
  });

  it('falls back to guided mode if OpenAI fails, and logs the error', async () => {
    mockFetch([[/chat\/completions/, () => ({ status: 500, body: { error: 'down' } })]]);
    const r = await send('tell me about the academy');
    assert.equal(r.mode, 'guided');
    assert.match(r.reply, /10-week/);
    assert.ok((await db().list('integration_logs')).some((l) => l.integration === 'openai' && l.status === 'error'));
  });

  it('safety rules run before the model is ever called', async () => {
    const calls = mockFetch([]);
    const r = await send('my friend has severe bleeding call an ambulance');
    assert.match(r.reply, /000/);
    assert.equal(calls.length, 0);
  });
});
