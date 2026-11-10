/**
 * Deterministic safety layer applied to EVERY message, before and after the
 * language model (and in guided mode without a model). These rules are in
 * code on purpose: they cannot be weakened from the editable knowledge base.
 */

const EMERGENCY =
  /\b(can'?t breathe|cannot breathe|not breathing|chest pain|unconscious|passed out|collapsed|seizure|severe bleeding|bleeding heavily|broken bone|bone sticking|head injury|concussion|knocked out|heart attack|stroke|anaphyla|emergency|ambulance)\b/i;
const SELF_HARM = /\b(suicid\w*|kill myself|end my life|self[- ]?harm|hurt myself|want to die)\b/i;
const COMPLAINT =
  /\b(complain\w*|complaint|unhappy|disappointed|unacceptable|terrible service|rude|refund|ripped off|speak to (a |the )?manager|not happy|poor service|formal feedback)\b/i;
const MEDICAL =
  /\b(diagnos\w*|what'?s wrong with|is it (torn|broken|fractured)|torn|tear|sprain\w*|strain\w*|fractur\w*|dislocat\w*|tendon\w*|ligament|acl|mcl|hamstring injury|should i see a (doctor|physio)|medication|painkiller|prescri\w*|treat(ment)? for|swelling|swollen|numb\w*|tingling)\b/i;
const HUMAN_Q = /\b(are you (a )?(human|real|person|bot|robot|ai)|is this (a )?(bot|robot|human|real person)|am i (talking|speaking|chatting) (to|with) (a )?(human|person|bot|robot|real))\b/i;
const HUMAN_REQUEST = /\b(speak|talk|chat) (to|with) (a |someone|somebody|real |the )?(person|human|staff|someone|somebody|team|manager|owner|john)\b/i;

export const EMERGENCY_RESPONSE =
  'If this is an emergency or someone is seriously hurt, please call **000** now (Australia). ASPARC AI cannot provide medical help. Once everyone is safe, the ASPARC team is happy to help with training questions.';

export const SELF_HARM_RESPONSE =
  "I'm really sorry you're going through this. If you are in immediate danger, please call **000**. You can also talk to someone at Lifeline any time on **13 11 14**. I'm an AI assistant and not able to help with this, but I've let the ASPARC team know you reached out.";

export const MEDICAL_REDIRECT =
  "I can't diagnose injuries or give medical advice – please see your doctor or a registered physiotherapist for an assessment. Once you've been assessed, ASPARC can support you with exercise-based return-to-performance training alongside your treating practitioner.";

export const AI_DISCLOSURE =
  "I'm ASPARC AI – an AI assistant, not a person. I can answer questions about ASPARC and pass your details to the team, who will follow up personally.";

export const CARD_WARNING =
  'For your security, please don’t share card or bank details here – I’ve removed them from this conversation. ASPARC never takes payment details through chat.';

export interface InboundCheck {
  emergency: boolean;
  selfHarm: boolean;
  complaint: boolean;
  medical: boolean;
  askingIfHuman: boolean;
  wantsHuman: boolean;
  containedCardNumber: boolean;
  /** text safe to store and send to the model */
  sanitized: string;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Removes payment card numbers (Luhn-valid 13–19 digit sequences) and CVV-style codes after them. */
export function redactPaymentData(text: string): { text: string; found: boolean } {
  let found = false;
  const out = text.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      found = true;
      return '[card number removed]';
    }
    return m;
  });
  const out2 = found ? out.replace(/\b(cvv|cvc|security code)\s*[:#]?\s*\d{3,4}\b/gi, '$1 [removed]') : out;
  return { text: out2, found };
}

export function checkInbound(raw: string): InboundCheck {
  const { text, found } = redactPaymentData(raw.slice(0, 2000));
  return {
    emergency: EMERGENCY.test(text),
    selfHarm: SELF_HARM.test(text),
    complaint: COMPLAINT.test(text),
    medical: MEDICAL.test(text),
    askingIfHuman: HUMAN_Q.test(text),
    wantsHuman: HUMAN_REQUEST.test(text),
    containedCardNumber: found,
    sanitized: text.trim(),
  };
}

const FALSE_CONFIRMATION =
  /\b(you(?:'re| are) (?:now )?(?:booked|registered|enrolled|confirmed)|(?:your )?(?:booking|appointment|session|registration|enrolment|enrollment|place) (?:is|has been) (?:confirmed|booked|locked in|secured|reserved)|i(?:'ve| have) (?:booked|reserved|confirmed|registered|enrolled) you|payment (?:has been |was )?(?:received|processed|taken|completed|successful))\b/i;

export interface OutboundContext {
  /** Every price (in whole dollars or dollars.cents) the knowledge base contains. */
  knownPrices: number[];
}

/**
 * Validates model output. If it contains a false confirmation or a price
 * that does not exist in the knowledge base, the reply is replaced with a
 * safe alternative and the reason returned (so it can be logged/escalated).
 */
export function checkOutbound(reply: string, ctx: OutboundContext): { reply: string; violations: string[] } {
  const violations: string[] = [];
  let out = reply;

  if (FALSE_CONFIRMATION.test(out)) {
    violations.push('false_confirmation');
    out =
      "I've passed your request to the ASPARC team. Nothing is confirmed until a team member contacts you directly to confirm it.";
  }

  const prices = [...out.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const unknown = prices.filter((p) => !ctx.knownPrices.some((k) => Math.abs(k - p) < 0.005));
  if (unknown.length) {
    violations.push(`unknown_price:${unknown.join(',')}`);
    out =
      "I don't have confirmed pricing for that yet. I can pass your enquiry to the ASPARC team so they can give you accurate pricing.";
  }

  return { reply: out, violations };
}
