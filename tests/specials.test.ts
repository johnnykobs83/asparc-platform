import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { offerProblem } from '../lib/admin/schemas';
import { loadAiContext, offerText, onSpecial, priceLine, renderKnowledgeForPrompt } from '../lib/ai/context';
import { checkOutbound } from '../lib/ai/guardrails';
import { DEFAULT_SERVICES } from '../lib/kb/defaults';
import type { Service } from '../lib/db/types';
import { freshDb } from './helpers';

const SLUG = 'individual-high-performance-6-week';
const asService = (s: (typeof DEFAULT_SERVICES)[number]) => ({ ...s, id: 'x', created_at: '', updated_at: '' }) as Service;

describe('Individual 6-Week High-Performance Program special', () => {
  it('is seeded with the owner-confirmed offer: $770, standard $990, first 10 athletes', () => {
    const s = DEFAULT_SERVICES.find((x) => x.slug === SLUG)!;
    assert.equal(s.category, 'performance');
    assert.equal(s.price_cents, 77000);
    assert.equal(s.price_status, 'approved');
    assert.equal(s.standard_price_cents, 99000);
    // ASPARC isn't GST-registered yet (26 Nov 2026), so no "incl. GST" wording.
    assert.doesNotMatch(`${s.price_unit} ${s.offer_terms}`, /GST/);
    assert.match(s.offer_terms ?? '', /first 10 athletes/);
    assert.equal(s.is_featured, true);
    assert.match(s.summary, /one 1-on-1 training session a week/);
    assert.match(s.summary, /6 sessions in total/);
    assert.match(s.summary, /detailed weekly program/);
    // no invented session length, and it is arranged by enquiry rather than self-booked
    assert.equal(s.duration_minutes, null);
    assert.equal(s.bookable, false);
  });

  it('is the only featured service, and no other service carries a standard price', () => {
    assert.deepEqual(DEFAULT_SERVICES.filter((s) => s.is_featured).map((s) => s.slug), [SLUG]);
    assert.ok(DEFAULT_SERVICES.filter((s) => s.slug !== SLUG).every((s) => s.standard_price_cents == null));
  });

  it('describes the offer for ASPARC AI', () => {
    const s = asService(DEFAULT_SERVICES.find((x) => x.slug === SLUG)!);
    assert.ok(onSpecial(s));
    assert.match(offerText(s), /SPECIAL \(Introductory offer\): standard price \$990, save \$220\./);
    assert.match(priceLine(s), /^Individual 6-Week High-Performance Program: \$770 for the 6-week program – SPECIAL/);
  });
});

describe('special offer rules', () => {
  it('a standard price needs an approved offer price below it', () => {
    assert.equal(offerProblem({ price_cents: 77000, price_status: 'approved', standard_price_cents: 99000 }), null);
    assert.equal(offerProblem({ price_cents: 77000, price_status: 'approved', standard_price_cents: null }), null);
    assert.match(offerProblem({ price_cents: 77000, price_status: 'approved', standard_price_cents: 77000 })!, /higher/);
    assert.match(offerProblem({ price_cents: 77000, price_status: 'draft', standard_price_cents: 99000 })!, /approved/);
    assert.match(offerProblem({ price_cents: null, price_status: 'on_enquiry', standard_price_cents: 99000 })!, /approved/);
  });
  it('a service without a genuine saving is not on special', () => {
    const base = asService(DEFAULT_SERVICES.find((x) => x.slug === SLUG)!);
    assert.equal(onSpecial({ ...base, standard_price_cents: null }), false);
    assert.equal(onSpecial({ ...base, price_status: 'draft' }), false);
    assert.equal(offerText({ ...base, standard_price_cents: 70000 }), '');
  });
});

describe('ASPARC AI and the special', () => {
  beforeEach(() => freshDb());

  it('knows the offer, standard and saving amounts so the price guardrail allows them', async () => {
    const ctx = await loadAiContext();
    for (const p of [770, 990, 220]) assert.ok(ctx.knownPrices.includes(p), `knows $${p}`);
    const r = checkOutbound('Our Individual 6-Week High-Performance Program is $770 (standard price $990, so you save $220) for the first 10 athletes.', ctx);
    assert.deepEqual(r.violations, []);
    assert.ok(checkOutbound('It is $700 this week only.', ctx).violations[0].startsWith('unknown_price'));
  });

  it('lists the special in its own prompt section with its conditions', async () => {
    const prompt = renderKnowledgeForPrompt(await loadAiContext());
    assert.match(prompt, /# CURRENT SPECIAL OFFERS/);
    assert.ok(prompt.indexOf("# CURRENT SPECIAL OFFERS") < prompt.indexOf("# SERVICES & PRICING"), "specials come first");
    assert.match(prompt, /ALWAYS mention the offer below first/);
    assert.match(prompt, /Never invent extra discounts or deadlines/);
    assert.match(prompt, /first 10 athletes/);
  });
});
