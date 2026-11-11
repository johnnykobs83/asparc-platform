import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkInbound, checkOutbound, redactPaymentData } from '../lib/ai/guardrails';
import { qualifyLead } from '../lib/leads/qualify';
import { melbourneDate, melbourneDayRange, offsetMinutes } from '../lib/time/melbourne';
import { can } from '../lib/auth/rbac';
import { signSession, verifySession } from '../lib/auth/session';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/auth/password';
import { contactProperties, splitName } from '../lib/integrations/hubspot';
import { formatPrice, searchKnowledgeItems } from '../lib/kb/service';
import { DEFAULT_KNOWLEDGE, DEFAULT_SERVICES } from '../lib/kb/defaults';
import type { Customer, KnowledgeItem, Lead } from '../lib/db/types';
import { freshDb } from './helpers';

describe('guardrails – inbound', () => {
  it('detects emergencies', () => assert.ok(checkInbound('my teammate collapsed and is unconscious').emergency));
  it('detects self-harm language', () => assert.ok(checkInbound('I want to kill myself').selfHarm));
  it('detects complaints', () => assert.ok(checkInbound('I want to make a complaint about my session').complaint));
  it('detects medical questions', () => assert.ok(checkInbound('I think I tore my hamstring, is it torn?').medical));
  it('detects "are you human"', () => assert.ok(checkInbound('are you a real person?').askingIfHuman));
  it('detects requests for a human', () => assert.ok(checkInbound('can I speak to someone from the team').wantsHuman));
  it('does not flag ordinary questions', () => {
    const c = checkInbound('How much is the academy for my 12 year old?');
    assert.equal(c.emergency || c.selfHarm || c.complaint || c.medical, false);
  });
  it('redacts Luhn-valid card numbers and CVV', () => {
    const r = redactPaymentData('my card is 4111 1111 1111 1111 cvv 123 thanks');
    assert.ok(r.found);
    assert.ok(!r.text.includes('4111'));
    assert.ok(!r.text.includes('123 thanks') || r.text.includes('[removed]'));
  });
  it('does not redact phone numbers', () => {
    const r = redactPaymentData('call me on 0412 345 678');
    assert.equal(r.found, false);
    assert.ok(r.text.includes('0412 345 678'));
  });
});

describe('guardrails – outbound', () => {
  const ctx = { knownPrices: [380, 60, 80, 100] };
  it('replaces false booking confirmations', () => {
    const r = checkOutbound("Great news, you're booked in for Tuesday at 4pm!", ctx);
    assert.ok(r.violations.includes('false_confirmation'));
    assert.ok(!/booked in/i.test(r.reply));
  });
  it('replaces claims payment was received', () => {
    assert.ok(checkOutbound('Your payment has been received.', ctx).violations.includes('false_confirmation'));
  });
  it('blocks invented prices', () => {
    const r = checkOutbound('Personal training is $95 per session.', ctx);
    assert.ok(r.violations[0].startsWith('unknown_price'));
    assert.ok(!r.reply.includes('$95'));
  });
  it('allows known prices', () => {
    const r = checkOutbound('The Academy is $380 per 10-week program (draft pricing).', ctx);
    assert.equal(r.violations.length, 0);
  });
});

describe('lead qualification', () => {
  it('qualifies a contactable, specific academy enquiry', () => {
    const q = qualifyLead({ leadType: 'academy', source: 'academy_form', hasEmail: true, hasPhone: true, consentContact: true, ageGroup: '11-13', isGuardian: true });
    assert.ok(q.isQualified);
    assert.ok(q.score >= 60);
  });
  it('never qualifies a complaint, but flags attention + high priority', () => {
    const q = qualifyLead({ leadType: 'complaint', source: 'contact_form', hasEmail: true, hasPhone: true, consentContact: true, details: 'Very unhappy with the session' });
    assert.equal(q.isQualified, false);
    assert.equal(q.priority, 'high');
    assert.ok(q.needsAttention);
  });
  it('marks club partnerships high priority', () => {
    assert.equal(qualifyLead({ leadType: 'club_partnership', source: 'club_form', hasEmail: true, hasPhone: false, consentContact: true }).priority, 'high');
  });
  it('booking intent moves stage to booking_requested', () => {
    assert.equal(qualifyLead({ leadType: 'booking', source: 'booking_form', hasEmail: true, hasPhone: false, consentContact: true }).stage, 'booking_requested');
  });
  it('general enquiry without detail is not qualified', () => {
    assert.equal(qualifyLead({ leadType: 'general', source: 'website_chat', hasEmail: true, hasPhone: false, consentContact: true }).isQualified, false);
  });
});

describe('Melbourne time', () => {
  it('uses AEDT (+11) in summer and AEST (+10) in winter', () => {
    assert.equal(offsetMinutes(new Date('2026-01-15T00:00:00Z')), 660);
    assert.equal(offsetMinutes(new Date('2026-07-15T00:00:00Z')), 600);
  });
  it('computes the Melbourne date', () => {
    assert.equal(melbourneDate(new Date('2026-11-09T14:00:00Z')), '2026-11-10'); // 1am AEDT next day
  });
  it('day range starts at local midnight', () => {
    assert.deepEqual(melbourneDayRange('2026-11-10'), { start: '2026-11-09T13:00:00.000Z', end: '2026-11-10T13:00:00.000Z' });
    assert.deepEqual(melbourneDayRange('2026-07-01'), { start: '2026-06-30T14:00:00.000Z', end: '2026-07-01T14:00:00.000Z' });
  });
  it('handles the DST change day (first Sunday of October is 23h long)', () => {
    const r = melbourneDayRange('2026-10-04');
    assert.equal((Date.parse(r.end) - Date.parse(r.start)) / 3600_000, 23);
  });
});

describe('auth', () => {
  it('signs and verifies sessions; rejects tampering', async () => {
    freshDb();
    const t = await signSession({ sub: 'u1', email: 'a@b.c', role: 'manager', name: null });
    assert.equal((await verifySession(t))?.role, 'manager');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u1', email: 'a@b.c', role: 'owner', name: null, exp: 9999999999 })).toString('base64url');
    assert.equal(await verifySession(`${forged}.${sig}`), null);
    assert.equal(await verifySession(`${body}.AAAA`), null);
  });
  it('rejects expired sessions', async () => {
    freshDb();
    assert.equal(await verifySession(await signSession({ sub: 'u', email: 'e', role: 'staff', name: null }, -10)), null);
  });
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('Correct-Horse-9');
    assert.ok(await verifyPassword('Correct-Horse-9', h));
    assert.equal(await verifyPassword('wrong', h), false);
  });
  it('enforces password strength', () => {
    assert.ok(validatePasswordStrength('short'));
    assert.equal(validatePasswordStrength('LongEnough123'), null);
  });
  it('RBAC matrix', () => {
    assert.ok(can('staff', 'leads:write'));
    assert.equal(can('staff', 'kb:write'), false);
    assert.ok(can('manager', 'services:write'));
    assert.equal(can('manager', 'users:manage'), false);
    assert.ok(can('owner', 'users:manage'));
  });
});

describe('knowledge base defaults honour the brief', () => {
  it('academy is $380 draft, massage 60/80/100 draft', () => {
    const a = DEFAULT_SERVICES.find((s) => s.slug === 'performance-academy')!;
    assert.equal(a.price_cents, 38000);
    assert.equal(a.price_status, 'draft');
    const m = DEFAULT_SERVICES.filter((s) => s.category === 'recovery').map((s) => [s.duration_minutes, s.price_cents, s.price_status]);
    assert.deepEqual(m, [[30, 6000, 'draft'], [45, 8000, 'draft'], [60, 10000, 'draft']]);
  });
  it('testing menu is the owner-confirmed list, priced on enquiry, and never mentions VALD/ForceDecks', () => {
    const t = DEFAULT_SERVICES.filter((s) => s.category === 'testing');
    assert.deepEqual(
      t.map((s) => s.name),
      ['Aerobic Fitness Testing', 'Anaerobic Fitness Testing', 'Functional Strength Testing', 'Jump Testing', 'Speed Testing', 'Acceleration Testing', 'Power Testing', 'Body Asymmetry Assessment', 'Athletic Profiling'],
    );
    assert.ok(t.every((s) => s.availability === 'available'));
    assert.ok(t.every((s) => s.price_status === 'on_enquiry' && s.price_cents == null));
    const all = JSON.stringify(DEFAULT_SERVICES) + JSON.stringify(DEFAULT_KNOWLEDGE.filter((k) => k.key !== 'faq.testing'));
    assert.ok(!/forcedecks|vald/i.test(all.replace(/"keywords":\[[^\]]*\]/g, '')));
  });
  it('no physiotherapy is advertised as a service', () => {
    assert.ok(!DEFAULT_SERVICES.some((s) => /physio/i.test(s.name + s.summary)));
  });
  it('contact details and hours are unconfirmed drafts with no invented values', () => {
    const c = DEFAULT_KNOWLEDGE.find((k) => k.key === 'business.contact')!;
    assert.equal(c.status, 'draft');
    assert.ok(Object.values(c.data).every((v) => v === ''));
    assert.equal(DEFAULT_KNOWLEDGE.find((k) => k.key === 'hours.opening')!.status, 'draft');
  });
  it('formats prices', () => {
    assert.equal(formatPrice({ price_cents: 38000, price_status: 'draft', price_unit: 'per 10-week program' }), '$380 per 10-week program');
    assert.equal(formatPrice({ price_cents: null, price_status: 'on_enquiry', price_unit: null }), 'Pricing on enquiry');
  });
  it('keyword search finds the physio FAQ', () => {
    const items = DEFAULT_KNOWLEDGE.map((k, i) => ({ ...k, id: String(i), created_at: '', updated_at: '', updated_by: null })) as KnowledgeItem[];
    assert.equal(searchKnowledgeItems(items, 'do you have a physio?')[0]?.key, 'faq.physio');
  });
});

describe('HubSpot mapping', () => {
  it('stays within the free CRM limit of 10 custom properties', async () => {
    const { HUBSPOT_PROPERTIES } = await import('../lib/integrations/hubspot');
    assert.ok(HUBSPOT_PROPERTIES.length <= 6);
  });
  it('splits names and maps properties without child data', () => {
    assert.deepEqual(splitName('Mary Jane Smith'), { firstname: 'Mary', lastname: 'Jane Smith' });
    const c = { full_name: 'Pat Parent', email: 'p@x.com', phone: null, preferred_contact: 'email', consent_contact: true, consent_marketing: false, is_guardian: true } as Customer;
    const l = { stage: 'new_enquiry', lead_type: 'academy', source: 'academy_form', is_qualified: true, service_interest: 'Academy', athlete_age_group: '11-13' } as Lead;
    const p = contactProperties(c, l);
    assert.equal(p.email, 'p@x.com');
    assert.equal(p.asparc_athlete_age_group, '11-13');
    assert.equal(p.hs_lead_status, 'NEW');
    assert.equal(p.asparc_marketing_consent, 'false');
    assert.ok(!('phone' in p));
    assert.ok(!JSON.stringify(p).includes('athlete_first_name'));
  });
});
