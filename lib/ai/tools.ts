import { db } from '../db';
import type { Conversation } from '../db/types';
import { searchKnowledgeItems } from '../kb/service';
import { submitEnquiry } from '../leads/service';
import { notify } from '../notifications/service';
import type { AiContext } from './context';
import { priceLine } from './context';
import type { ChatAction, EnquiryForm } from './types';

/**
 * Controlled function calling: these are the ONLY actions the model can take.
 * Each tool validates its own input and returns facts from the database –
 * the model never writes to the database directly.
 */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search approved ASPARC FAQs, policies and business information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What the person is asking about' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'List ASPARC services with current pricing status and availability.',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string', enum: ['performance', 'academy', 'rehabilitation', 'recovery', 'testing', 'all'] } },
        required: ['category'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_enquiry_form',
      description:
        'Show a secure enquiry form in the chat so the person can share their contact details with consent. Use for general enquiries, academy registration (parents/guardians), booking requests, club partnerships and massage enquiries.',
      parameters: {
        type: 'object',
        properties: {
          form: { type: 'string', enum: ['contact', 'academy', 'booking', 'club', 'massage'] },
          service_interest: { type: 'string', description: 'Service name if known' },
          age_group: { type: 'string', enum: ['8-10', '11-13', '14-16', '16-18'] },
          lead_type: {
            type: 'string',
            enum: ['general', 'sports_performance', 'academy', 'rehabilitation', 'massage', 'testing', 'club_partnership', 'booking', 'complaint'],
          },
        },
        required: ['form'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description:
        'Record contact details the person has typed in chat. ONLY call when they have given their name plus email or phone AND explicitly agreed to be contacted. For academy enquiries the person must confirm they are the parent/guardian.',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          preferred_contact: { type: 'string', enum: ['email', 'phone', 'sms', 'whatsapp'] },
          lead_type: {
            type: 'string',
            enum: ['general', 'sports_performance', 'academy', 'rehabilitation', 'massage', 'testing', 'club_partnership', 'booking', 'complaint'],
          },
          service_interest: { type: 'string' },
          athlete_age_group: { type: 'string', enum: ['8-10', '11-13', '14-16', '16-18'] },
          is_guardian: { type: 'boolean' },
          details: { type: 'string', description: 'Brief summary of the enquiry – no medical details' },
          consent_to_contact: { type: 'boolean', description: 'true only if the person explicitly agreed to be contacted' },
          consent_to_marketing: { type: 'boolean', description: 'true only if they explicitly opted in to marketing' },
        },
        required: ['full_name', 'lead_type', 'consent_to_contact'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_management',
      description: 'Flag the conversation for ASPARC management: complaints, sensitive matters, complex enquiries, or a request to speak with a person.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['complaint', 'complex', 'sensitive', 'human_requested', 'urgent'] },
          reason: { type: 'string' },
        },
        required: ['category', 'reason'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_unanswered_question',
      description: 'Record a question the knowledge base cannot answer so management can add the answer.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payment_link',
      description: 'Get the approved secure payment link for a service, if one exists.',
      parameters: {
        type: 'object',
        properties: { service_slug: { type: 'string' } },
        required: ['service_slug'],
        additionalProperties: false,
      },
    },
  },
] as const;

export interface ToolRuntime {
  ctx: AiContext;
  conversation: Conversation;
  actions: ChatAction[];
}

export async function flagConversation(conversation: Conversation, reason: string, escalate = false) {
  await db().update('conversations', conversation.id, {
    needs_attention: true,
    attention_reason: reason.slice(0, 300),
    ...(escalate ? { status: 'escalated' as const } : {}),
  });
}

export async function logUnanswered(conversation: Conversation, question: string) {
  await flagConversation(conversation, `Unanswered: ${question}`);
  await notify({
    type: 'unresolved_question',
    title: 'AI could not answer a question',
    body: `"${question.slice(0, 500)}"\n\nAdd the answer in Knowledge Base so the assistant can answer next time.`,
    severity: 'info',
    linkPath: `/admin/conversations?id=${conversation.id}`,
    conversationId: conversation.id,
  });
}

export async function escalate(conversation: Conversation, category: string, reason: string) {
  await flagConversation(conversation, `${category}: ${reason}`, true);
  await notify({
    type: category === 'complaint' ? 'complaint' : 'escalation',
    title: category === 'complaint' ? 'Complaint raised in chat' : `Chat escalated (${category.replace('_', ' ')})`,
    body: reason.slice(0, 1000),
    severity: category === 'complaint' || category === 'urgent' ? 'urgent' : 'important',
    linkPath: `/admin/conversations?id=${conversation.id}`,
    conversationId: conversation.id,
  });
}

export async function executeTool(name: string, rawArgs: string, rt: ToolRuntime): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}');
  } catch {
    return { error: 'Invalid arguments' };
  }
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : undefined);

  switch (name) {
    case 'search_knowledge_base': {
      const hits = searchKnowledgeItems(rt.ctx.knowledge, str('query') ?? '');
      return hits.length
        ? { results: hits.map((h) => ({ title: h.title, answer: h.content })) }
        : { results: [], note: 'No approved answer found. Offer to pass the question to the team and call log_unanswered_question.' };
    }
    case 'list_services': {
      const cat = str('category') ?? 'all';
      const rows = rt.ctx.services.filter((s) => cat === 'all' || s.category === cat);
      return { services: rows.map((s) => ({ slug: s.slug, line: priceLine(s), summary: s.summary })) };
    }
    case 'show_enquiry_form': {
      const form = (str('form') ?? 'contact') as EnquiryForm;
      if (!['contact', 'academy', 'booking', 'club', 'massage'].includes(form)) return { error: 'Unknown form' };
      rt.actions.push({ type: 'enquiry_form', form, serviceInterest: str('service_interest'), ageGroup: str('age_group'), leadType: str('lead_type') });
      return { shown: true, note: 'Form displayed to the person. Tell them to fill it in; do not say anything is booked.' };
    }
    case 'capture_lead': {
      if (args.consent_to_contact !== true) return { saved: false, error: 'Consent to contact has not been given. Ask for it or show the enquiry form.' };
      const leadType = str('lead_type') ?? 'general';
      if (leadType === 'academy' && args.is_guardian !== true)
        return { saved: false, error: 'Academy enquiries must come from a parent or guardian. Ask them to confirm.' };
      try {
        const res = await submitEnquiry({
          form: 'chat',
          lead_type: leadType,
          full_name: str('full_name') ?? '',
          email: str('email'),
          phone: str('phone'),
          preferred_contact: str('preferred_contact'),
          consent_contact: true,
          consent_marketing: args.consent_to_marketing === true,
          is_guardian: args.is_guardian === true,
          service_interest: str('service_interest'),
          athlete_age_group: str('athlete_age_group'),
          details: str('details'),
          conversation_id: rt.conversation.id,
        });
        return { saved: true, lead_reference: res.leadId.slice(0, 8), note: 'Details passed to the team. Nothing is booked or confirmed.' };
      } catch (e) {
        const msg = e instanceof Error && 'issues' in e ? JSON.stringify((e as { issues: unknown }).issues) : 'validation failed';
        return { saved: false, error: `Could not save: ${msg}. Show the enquiry form instead.` };
      }
    }
    case 'escalate_to_management': {
      await escalate(rt.conversation, str('category') ?? 'complex', str('reason') ?? 'Escalated by assistant');
      return { escalated: true, note: 'Management notified. Tell the person the team will follow up; offer the contact form so they can be reached.' };
    }
    case 'log_unanswered_question': {
      await logUnanswered(rt.conversation, str('question') ?? '');
      return { logged: true };
    }
    case 'get_payment_link': {
      const s = rt.ctx.services.find((x) => x.slug === str('service_slug'));
      if (s?.payment_link_url && s.price_status === 'approved') {
        rt.actions.push({ type: 'payment_link', url: s.payment_link_url, label: `Pay securely – ${s.name}` });
        return { available: true, note: 'Secure link shown. Do not say payment is complete.' };
      }
      return { available: false, note: 'Online payment is not yet available for this service.' };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
