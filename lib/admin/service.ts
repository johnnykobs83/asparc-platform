import { z } from 'zod';
import { db } from '../db';
import { AGE_GROUPS, LEAD_STAGES, LEAD_TYPES, type Customer, type Lead } from '../db/types';
import { changeLeadStage } from '../leads/service';

const lc = (s: string | null | undefined) => (s ?? '').toLowerCase();

export async function customersById(ids: string[]): Promise<Map<string, Customer>> {
  const want = new Set(ids);
  const all = await db().list('customers', { limit: 5000 });
  return new Map(all.filter((c) => want.has(c.id)).map((c) => [c.id, c]));
}

export async function listLeads(params: URLSearchParams) {
  const repo = db();
  const leads = await repo.list('leads', { limit: 2000 });
  const customers = await customersById(leads.map((l) => l.customer_id));
  const q = lc(params.get('q'));
  const stage = params.get('stage');
  const type = params.get('type');
  const source = params.get('source');
  const attention = params.get('attention') === '1';
  return leads
    .filter((l) => !stage || l.stage === stage)
    .filter((l) => !type || l.lead_type === type)
    .filter((l) => !source || l.source === source)
    .filter((l) => !attention || l.needs_attention)
    .map((l) => {
      const c = customers.get(l.customer_id);
      return { ...l, customer: c ? { id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, preferred_contact: c.preferred_contact, consent_marketing: c.consent_marketing, is_guardian: c.is_guardian } : null };
    })
    .filter((l) => !q || [l.customer?.full_name, l.customer?.email, l.customer?.phone, l.service_interest, l.enquiry_details].some((f) => lc(f).includes(q)));
}

export async function getLeadDetail(id: string) {
  const repo = db();
  const lead = await repo.get('leads', id);
  if (!lead) return null;
  const [customer, events, bookings, regs, messages] = await Promise.all([
    repo.get('customers', lead.customer_id),
    repo.list('lead_events', { eq: { lead_id: id } }),
    repo.list('booking_requests', { eq: { lead_id: id } }),
    repo.list('academy_registrations', { eq: { lead_id: id } }),
    lead.conversation_id ? repo.list('messages', { eq: { conversation_id: lead.conversation_id }, orderBy: 'created_at', ascending: true }) : Promise.resolve([]),
  ]);
  return { lead, customer, events, bookings, registrations: regs, messages: messages.filter((m) => m.role !== 'tool') };
}

export const LeadPatchSchema = z
  .object({
    stage: z.enum(LEAD_STAGES).optional(),
    lead_type: z.enum(LEAD_TYPES).optional(),
    follow_up_status: z.enum(['pending', 'in_progress', 'done']).optional(),
    follow_up_due: z.string().datetime({ offset: true }).nullable().optional(),
    needs_attention: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    athlete_age_group: z.enum(AGE_GROUPS).nullable().optional(),
    service_interest: z.string().max(200).nullable().optional(),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export async function patchLead(id: string, raw: unknown, actor: string) {
  const p = LeadPatchSchema.parse(raw);
  const repo = db();
  const lead = await repo.get('leads', id);
  if (!lead) return null;
  const { stage, note, ...rest } = p;
  const patch: Partial<Lead> = { ...rest };
  if (rest.needs_attention === false) patch.attention_reason = null;
  if (Object.keys(patch).length) {
    await repo.update('leads', id, patch);
    if (rest.follow_up_status || rest.follow_up_due !== undefined)
      await repo.insert('lead_events', { lead_id: id, event_type: 'follow_up', actor, detail: { follow_up_status: rest.follow_up_status, follow_up_due: rest.follow_up_due } });
  }
  if (note) await repo.insert('lead_events', { lead_id: id, event_type: 'note', actor, detail: { note } });
  if (stage) await changeLeadStage(id, stage, actor);
  return repo.get('leads', id);
}

export async function listConversations(params: URLSearchParams) {
  const repo = db();
  const convos = await repo.list('conversations', { orderBy: 'last_message_at', limit: 500 });
  const customers = await customersById(convos.map((c) => c.customer_id).filter((x): x is string => !!x));
  const status = params.get('status');
  const attention = params.get('attention') === '1';
  const q = lc(params.get('q'));
  return convos
    .filter((c) => c.message_count > 0)
    .filter((c) => !status || c.status === status)
    .filter((c) => !attention || c.needs_attention)
    .map((c) => ({ ...c, customer_name: c.customer_id ? customers.get(c.customer_id)?.full_name ?? null : null }))
    .filter((c) => !q || lc(c.customer_name).includes(q) || lc(c.attention_reason).includes(q) || lc(c.summary).includes(q));
}

export async function getConversationDetail(id: string) {
  const repo = db();
  const conversation = await repo.get('conversations', id);
  if (!conversation) return null;
  const [messages, customer, lead] = await Promise.all([
    repo.list('messages', { eq: { conversation_id: id }, orderBy: 'created_at', ascending: true }),
    conversation.customer_id ? repo.get('customers', conversation.customer_id) : null,
    conversation.lead_id ? repo.get('leads', conversation.lead_id) : null,
  ]);
  return { conversation, messages, customer, lead };
}

export async function listWithCustomer<T extends 'booking_requests' | 'academy_registrations'>(table: T) {
  const rows = await db().list(table, { limit: 1000 });
  const key = table === 'booking_requests' ? 'customer_id' : 'guardian_customer_id';
  const customers = await customersById(rows.map((r) => (r as unknown as Record<string, string>)[key]));
  return rows.map((r) => {
    const c = customers.get((r as unknown as Record<string, string>)[key]);
    return { ...r, customer: c ? { id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, preferred_contact: c.preferred_contact } : null };
  });
}

/**
 * Privacy request: permanently removes a customer and everything linked
 * (leads, events, bookings, registrations; conversations are deleted too).
 */
export async function deleteCustomerData(customerId: string) {
  const repo = db();
  const leads = await repo.list('leads', { eq: { customer_id: customerId } });
  const convos = await repo.list('conversations', { eq: { customer_id: customerId } });
  for (const c of convos) {
    for (const m of await repo.list('messages', { eq: { conversation_id: c.id } })) await repo.remove('messages', m.id);
    await repo.remove('conversations', c.id);
  }
  for (const l of leads) {
    for (const ev of await repo.list('lead_events', { eq: { lead_id: l.id } })) await repo.remove('lead_events', ev.id);
    for (const n of await repo.list('notifications', { eq: { lead_id: l.id } })) await repo.remove('notifications', n.id);
    await repo.remove('leads', l.id);
  }
  for (const b of await repo.list('booking_requests', { eq: { customer_id: customerId } })) await repo.remove('booking_requests', b.id);
  for (const r of await repo.list('academy_registrations', { eq: { guardian_customer_id: customerId } })) await repo.remove('academy_registrations', r.id);
  await repo.remove('customers', customerId);
  return { leads: leads.length, conversations: convos.length };
}
