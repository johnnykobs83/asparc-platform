import { onlineBookingEnabled } from '../bookings/service';
import { env } from '../config/env';
import type { KnowledgeItem, Service } from '../db/types';
import { formatPrice, listKnowledge, listServices } from '../kb/service';

export interface AiContext {
  services: Service[];
  knowledge: KnowledgeItem[];
  knownPrices: number[];
  style: string;
  /** URL of the self-service booking page, or null when online booking is not set up. */
  bookingUrl: string | null;
}

export async function loadAiContext(): Promise<AiContext> {
  const [services, knowledge, bookable] = await Promise.all([listServices({ publicOnly: true }), listKnowledge(), onlineBookingEnabled().catch(() => false)]);
  const priced = services.filter((s) => s.price_cents !== null && s.price_status !== 'on_enquiry');
  const knownPrices = [
    ...priced.map((s) => s.price_cents! / 100),
    // a special's standard price and the saving may also be quoted
    ...priced.filter(onSpecial).flatMap((s) => [s.standard_price_cents! / 100, (s.standard_price_cents! - s.price_cents!) / 100]),
  ];
  const style = knowledge.find((k) => k.key === 'ai.style' && k.status === 'approved')?.content ?? '';
  return { services, knowledge, knownPrices, style, bookingUrl: bookable ? `${env.siteUrl}/book` : null };
}

/** Approved offer price below a genuine standard price. */
export function onSpecial(s: Service): boolean {
  return s.price_status === 'approved' && s.price_cents != null && s.standard_price_cents != null && s.standard_price_cents > s.price_cents;
}

const dollars = (cents: number) => (Number.isInteger(cents / 100) ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** e.g. " – SPECIAL (Introductory offer): standard price $990, save $220. For the first 10 athletes." */
export function offerText(s: Service): string {
  if (!onSpecial(s)) return '';
  const label = s.offer_label ? ` (${s.offer_label})` : '';
  const terms = s.offer_terms ? ` ${s.offer_terms}` : '';
  return ` – SPECIAL${label}: standard price ${dollars(s.standard_price_cents!)}, save ${dollars(s.standard_price_cents! - s.price_cents!)}.${terms}`;
}

export function priceLine(s: Service): string {
  const price = formatPrice(s);
  const status =
    s.price_status === 'draft' ? ' (draft pricing – subject to confirmation)' : s.price_status === 'approved' ? '' : '';
  const avail =
    s.availability === 'pending_confirmation'
      ? ' [availability being confirmed – register interest]'
      : s.availability === 'unavailable'
        ? ' [not currently available]'
        : '';
  return `${s.name}: ${price}${status}${offerText(s)}${avail}`;
}

/** Plain-text knowledge base snapshot injected into the model's system prompt. */
export function renderKnowledgeForPrompt(ctx: AiContext): string {
  const byCat = (c: Service['category']) => ctx.services.filter((s) => s.category === c);
  const svcBlock = (['performance', 'academy', 'rehabilitation', 'recovery', 'testing'] as const)
    .map((c) => {
      const rows = byCat(c);
      if (!rows.length) return '';
      return `## ${c.toUpperCase()}\n${rows.map((s) => `- [${s.slug}] ${priceLine(s)} — ${s.summary}`).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n');

  const approved = ctx.knowledge.filter((k) => k.status === 'approved' && ['business', 'faq', 'policy', 'hours'].includes(k.category));
  const pending = ctx.knowledge.filter((k) => k.status === 'draft' && ['business', 'policy', 'hours'].includes(k.category));

  const featured = ctx.services.filter((s) => s.is_featured && s.availability !== 'unavailable');

  return [
    '# SERVICES & PRICING (only source of truth for prices)',
    svcBlock,
    ...(featured.length
      ? [
          `# CURRENT SPECIAL OFFERS\nWhen someone asks about training, individual programs, sports performance, pricing or what ASPARC offers, mention these briefly and invite them to enquire. Quote the offer exactly as listed above, including any conditions. Never invent extra discounts or deadlines.\n${featured.map((s) => `- ${priceLine(s)}`).join('\n')}`,
        ]
      : []),
    '# APPROVED BUSINESS INFORMATION',
    ...approved.map((k) => `### ${k.title}\n${k.content}`),
    ...(ctx.bookingUrl
      ? [`# ONLINE BOOKING\nCustomers can book an appointment themselves at ${ctx.bookingUrl} – they choose a service and a time there, and that page shows them their confirmation. You cannot see availability or make a booking, and you must never describe a booking as confirmed; point people to that page.`]
      : []),
    '# NOT YET CONFIRMED (say these are being finalised; do not guess)',
    ...pending.map((k) => `- ${k.title}`),
  ].join('\n\n');
}
