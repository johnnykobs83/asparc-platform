import { searchKnowledgeItems } from '../kb/service';
import type { AiContext } from './context';
import { priceLine } from './context';
import type { ChatAction } from './types';

/**
 * Guided mode: a deterministic receptionist that runs without any AI API key.
 * It answers strictly from the knowledge base, so it can never invent facts.
 */

export interface GuidedResult {
  reply: string;
  actions: ChatAction[];
  /** side effects for the orchestrator */
  unanswered?: string;
  escalate?: { category: string; reason: string };
}

const MAIN_MENU: ChatAction = {
  type: 'quick_replies',
  options: ['Sports performance', 'Performance Academy', 'Remedial massage', 'Return to performance', 'Performance testing', 'Club partnerships'],
};

const has = (t: string, re: RegExp) => re.test(t);

const INTENTS = {
  greeting: /^(hi|hello|hey|g'?day|good (morning|afternoon|evening)|yo)\b/i,
  thanks: /\b(thanks|thank you|cheers|ta)\b/i,
  bye: /\b(bye|goodbye|see ya|that'?s all)\b/i,
  club: /\b(club|clubs|partnership|partner|squad|association|whole team|our team)\b/i,
  academy: /\b(academy|junior|juniors|kids?|child|children|son|daughter|youth|teen\w*|under ?1\d|u1\d|age group|8.?10|11.?13|14.?16|16.?18)\b/i,
  massage: /\b(massage|remedial|soft tissue|myotherapy|recovery)\b/i,
  rehab: /\b(rehab\w*|return to (play|sport|performance|training)|return-to-performance|injur\w*|post[- ]?surgery|recovering from)\b/i,
  testing: /\b(test|testing|tests|assessment|profil\w*|benchmark|force ?plate|forcedecks|vald|jump test)\b/i,
  booking: /\b(book|booking|appointment|available|availability|schedule|slot|session time|when can i)\b/i,
  pricing: /\b(price|prices|pricing|cost|costs|how much|fee|fees|rate|rates|\$)\b/i,
  payment: /\b(pay|payment|card|invoice|deposit|afterpay)\b/i,
  location: /\b(where|location|located|address|suburb|venue|parking)\b/i,
  hours: /\b(hours|open|opening|closing|times|what time)\b/i,
  contact: /\b(phone|call you|email|contact|number|instagram|facebook)\b/i,
  performance: /\b(strength|conditioning|s&c|speed|sprint\w*|acceleration|agility|change of direction|power|football|soccer|personal train\w*|pt|gym|fitness|fitter|stronger|faster|athlete|athletic|pre-?season|training)\b/i,
  privacy: /\b(privacy|my data|delete my|personal information)\b/i,
};

export function guidedRespond(text: string, ctx: AiContext, opts: { firstMessage: boolean }): GuidedResult {
  const t = text.trim();
  const svc = (cat: string) => ctx.services.filter((s) => s.category === cat);
  const faq = (key: string) => ctx.knowledge.find((k) => k.key === key && k.status === 'approved')?.content;
  const lines = (cat: string) => svc(cat).map((s) => `• ${priceLine(s)}`).join('\n');

  if (has(t, INTENTS.club)) {
    return {
      reply: `${faq('faq.clubs') ?? 'Club partnership enquiries are handled by management.'}\n\nShare a few details below and the team will be in touch.`,
      actions: [{ type: 'enquiry_form', form: 'club', leadType: 'club_partnership', serviceInterest: 'Club partnership' }],
    };
  }
  if (has(t, INTENTS.academy)) {
    const academy = svc('academy')[0];
    return {
      reply: [
        faq('faq.academy_format') ?? 'The Performance Academy runs for junior athletes in four age groups.',
        academy ? `Price: ${priceLine(academy)}.` : '',
        'Academy enquiries are completed by a parent or guardian – you can register interest below.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [{ type: 'enquiry_form', form: 'academy', leadType: 'academy', serviceInterest: academy?.name }],
    };
  }
  if (has(t, INTENTS.massage)) {
    return {
      reply: `Remedial massage options:\n${lines('recovery')}\n\nSend an appointment enquiry and the team will contact you to arrange a time.`,
      actions: [{ type: 'enquiry_form', form: 'massage', leadType: 'massage', serviceInterest: 'Remedial massage' }],
    };
  }
  if (has(t, INTENTS.rehab)) {
    const rtp = svc('rehabilitation')[0];
    return {
      reply: [
        rtp ? `${rtp.name}: ${rtp.summary}` : '',
        "I can't assess or diagnose injuries – please see your doctor or a registered physiotherapist for that. ASPARC can then support your return to training alongside them.",
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [{ type: 'enquiry_form', form: 'contact', leadType: 'rehabilitation', serviceInterest: rtp?.name ?? 'Return-to-performance training' }],
    };
  }
  if (has(t, INTENTS.testing)) {
    return {
      reply: `${faq('faq.testing') ?? 'The performance testing menu is being finalised.'}`,
      actions: [{ type: 'enquiry_form', form: 'contact', leadType: 'testing', serviceInterest: 'Performance testing' }],
    };
  }
  if (has(t, INTENTS.payment)) {
    return { reply: faq('faq.payment') ?? 'Online payment is not yet available.', actions: [MAIN_MENU] };
  }
  if (has(t, INTENTS.booking)) {
    return {
      reply: `${faq('faq.booking') ?? 'Online booking is not live yet.'}`,
      actions: [{ type: 'enquiry_form', form: 'booking', leadType: 'booking' }],
    };
  }
  if (has(t, INTENTS.pricing)) {
    const priced = ctx.services.filter((s) => s.price_status !== 'on_enquiry');
    return {
      reply: [
        priced.length ? `Current pricing:\n${priced.map((s) => `• ${priceLine(s)}`).join('\n')}` : '',
        'Sports performance, strength & conditioning and personal training are priced on enquiry.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [MAIN_MENU],
    };
  }
  if (has(t, INTENTS.location) || has(t, INTENTS.hours)) {
    const loc = ctx.knowledge.find((k) => k.key === 'business.location');
    const hours = ctx.knowledge.find((k) => k.key === 'hours.opening');
    return {
      reply: [
        loc?.content ?? 'Melbourne, Victoria.',
        hours?.status === 'approved' ? hours.content : 'Opening hours are being confirmed – sessions are by appointment.',
      ].join('\n\n'),
      actions: [MAIN_MENU],
    };
  }
  if (has(t, INTENTS.contact)) {
    const c = ctx.knowledge.find((k) => k.key === 'business.contact');
    const d = (c?.status === 'approved' ? c.data : {}) as Record<string, string>;
    const parts = [d.phone ? `Phone: ${d.phone}` : '', d.email ? `Email: ${d.email}` : ''].filter(Boolean);
    return {
      reply: parts.length
        ? `${parts.join('\n')}\n\nOr leave your details and the team will contact you.`
        : 'The quickest way to reach the team is to leave your details here – they will contact you directly.',
      actions: [{ type: 'enquiry_form', form: 'contact', leadType: 'general' }],
    };
  }
  if (has(t, INTENTS.privacy)) {
    return { reply: `${faq('policy.privacy_summary') ?? ''}\n\nTo access or delete your information, leave a request and the team will action it.`.trim(), actions: [] };
  }
  if (has(t, INTENTS.performance)) {
    return {
      reply: `ASPARC sports performance services:\n${lines('performance')}\n\nWould you like to request a session or ask the team a question?`,
      actions: [
        { type: 'enquiry_form', form: 'booking', leadType: 'sports_performance' },
        { type: 'quick_replies', options: ['Performance Academy', 'Performance testing', 'Pricing'] },
      ],
    };
  }
  if (has(t, INTENTS.greeting) || opts.firstMessage && t.length < 12) {
    return { reply: 'Hi! What can I help you with today?', actions: [MAIN_MENU] };
  }
  if (has(t, INTENTS.thanks) || has(t, INTENTS.bye)) {
    return { reply: "You're welcome! If anything else comes up, I'm here 24/7.", actions: [] };
  }

  const hits = searchKnowledgeItems(ctx.knowledge, t, 1);
  if (hits.length) return { reply: hits[0].content, actions: [MAIN_MENU] };

  return {
    reply:
      "I don't have an answer to that yet, so I've passed your question to the ASPARC team. If you leave your details they can get back to you directly.",
    actions: [{ type: 'enquiry_form', form: 'contact', leadType: 'general' }],
    unanswered: t,
  };
}
