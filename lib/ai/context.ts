import type { KnowledgeItem, Service } from '../db/types';
import { formatPrice, listKnowledge, listServices } from '../kb/service';

export interface AiContext {
  services: Service[];
  knowledge: KnowledgeItem[];
  knownPrices: number[];
  style: string;
}

export async function loadAiContext(): Promise<AiContext> {
  const [services, knowledge] = await Promise.all([listServices({ publicOnly: true }), listKnowledge()]);
  const knownPrices = services
    .filter((s) => s.price_cents !== null && s.price_status !== 'on_enquiry')
    .map((s) => s.price_cents! / 100);
  const style = knowledge.find((k) => k.key === 'ai.style' && k.status === 'approved')?.content ?? '';
  return { services, knowledge, knownPrices, style };
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
  return `${s.name}: ${price}${status}${avail}`;
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

  return [
    '# SERVICES & PRICING (only source of truth for prices)',
    svcBlock,
    '# APPROVED BUSINESS INFORMATION',
    ...approved.map((k) => `### ${k.title}\n${k.content}`),
    '# NOT YET CONFIRMED (say these are being finalised; do not guess)',
    ...pending.map((k) => `- ${k.title}`),
  ].join('\n\n');
}
