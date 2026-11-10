import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../db';
import {
  AGE_GROUPS,
  LEAD_STAGE_LABELS,
  LEAD_TYPE_LABELS,
  type Customer,
  type Lead,
  type LeadSource,
  type LeadStage,
  type LeadType,
} from '../db/types';
import { syncLeadToHubSpot, type SyncResult } from '../integrations/hubspot';
import { emailLayout, escapeHtml, sendEmail } from '../integrations/resend';
import { listServices } from '../kb/service';
import { notify } from '../notifications/service';
import { qualifyLead } from './qualify';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Validated shape of every public enquiry (forms + chat). */
export const EnquirySchema = z
  .object({
    form: z.enum(['contact', 'academy', 'booking', 'club', 'massage', 'chat']),
    lead_type: z
      .enum(['general', 'sports_performance', 'academy', 'rehabilitation', 'massage', 'testing', 'club_partnership', 'booking', 'complaint'])
      .optional(),
    full_name: z.string().trim().min(2, 'Please enter your full name').max(160),
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : undefined))
      .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Please enter a valid email address'),
    phone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || /^[+()\d\s-]{8,20}$/.test(v), 'Please enter a valid phone number'),
    preferred_contact: z.enum(['email', 'phone', 'sms', 'whatsapp']).optional(),
    // Checked in superRefine (not z.literal) so ALL field errors are reported together.
    consent_contact: z.boolean().optional(),
    consent_marketing: z.boolean().optional().default(false),
    is_guardian: z.boolean().optional().default(false),
    service_interest: optionalText(200),
    details: optionalText(2000),
    // Academy
    athlete_age_group: z.enum(AGE_GROUPS).optional(),
    athlete_first_name: optionalText(80),
    athlete_last_name: optionalText(80),
    athlete_age: z.coerce.number().int().min(6).max(19).optional(),
    club_or_school: optionalText(120),
    // Booking
    preferred_days: optionalText(200),
    preferred_times: optionalText(200),
    // Club
    club_name: optionalText(160),
    club_role: optionalText(120),
    athlete_count: optionalText(40),
    // Linkage
    conversation_id: z.string().uuid().optional(),
    // Honeypot – must be empty
    website: z.string().max(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.consent_contact !== true) ctx.addIssue({ code: 'custom', path: ['consent_contact'], message: 'Please confirm we may contact you about your enquiry' });
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Please provide an email address or phone number' });
    if (v.form === 'academy') {
      if (!v.is_guardian) ctx.addIssue({ code: 'custom', path: ['is_guardian'], message: 'Academy registrations must be completed by a parent or guardian' });
      if (!v.athlete_age_group) ctx.addIssue({ code: 'custom', path: ['athlete_age_group'], message: 'Please select an age group' });
      if (!v.athlete_first_name) ctx.addIssue({ code: 'custom', path: ['athlete_first_name'], message: "Please enter the athlete's first name" });
    }
    if (v.form === 'booking' && !v.service_interest) ctx.addIssue({ code: 'custom', path: ['service_interest'], message: 'Please choose a service' });
    if (v.form === 'club' && !v.club_name) ctx.addIssue({ code: 'custom', path: ['club_name'], message: 'Please enter your club name' });
  });

export type EnquiryInput = z.input<typeof EnquirySchema>;
export type Enquiry = z.output<typeof EnquirySchema>;

const FORM_DEFAULTS: Record<Enquiry['form'], { leadType: LeadType; source: LeadSource }> = {
  contact: { leadType: 'general', source: 'contact_form' },
  academy: { leadType: 'academy', source: 'academy_form' },
  booking: { leadType: 'booking', source: 'booking_form' },
  club: { leadType: 'club_partnership', source: 'club_form' },
  massage: { leadType: 'massage', source: 'massage_form' },
  chat: { leadType: 'general', source: 'website_chat' },
};

export interface EnquiryResult {
  leadId: string;
  customerId: string;
  bookingRequestId: string | null;
  registrationId: string | null;
  qualified: boolean;
  crm: SyncResult['status'];
}

async function upsertCustomer(e: Enquiry, source: LeadSource): Promise<Customer> {
  const repo = db();
  const now = new Date().toISOString();
  const existing =
    (e.email ? await repo.findOne('customers', { email: e.email }) : null) ??
    (e.phone && !e.email ? await repo.findOne('customers', { phone: e.phone }) : null);

  if (existing) {
    const patch: Partial<Customer> = {
      full_name: e.full_name,
      phone: e.phone ?? existing.phone,
      preferred_contact: e.preferred_contact ?? existing.preferred_contact,
      is_guardian: existing.is_guardian || e.is_guardian,
      consent_contact: true,
      consent_contact_at: existing.consent_contact_at ?? now,
    };
    // Marketing consent is only ever granted by an explicit opt-in; it is never silently removed here.
    if (e.consent_marketing && !existing.consent_marketing) {
      patch.consent_marketing = true;
      patch.consent_marketing_at = now;
    }
    return (await repo.update('customers', existing.id, patch))!;
  }
  return repo.insert('customers', {
    full_name: e.full_name,
    email: e.email ?? null,
    phone: e.phone ?? null,
    preferred_contact: e.preferred_contact ?? (e.email ? 'email' : 'phone'),
    is_guardian: e.is_guardian,
    consent_contact: true,
    consent_contact_at: now,
    consent_marketing: e.consent_marketing,
    consent_marketing_at: e.consent_marketing ? now : null,
    source,
  });
}

function composeDetails(e: Enquiry): string | undefined {
  const parts = [
    e.details,
    e.club_name ? `Club: ${e.club_name}` : '',
    e.club_role ? `Role: ${e.club_role}` : '',
    e.athlete_count ? `Approx. athletes: ${e.athlete_count}` : '',
    e.preferred_days ? `Preferred days: ${e.preferred_days}` : '',
    e.preferred_times ? `Preferred times: ${e.preferred_times}` : '',
    e.club_or_school && e.form === 'academy' ? `Club/school: ${e.club_or_school}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : undefined;
}

/**
 * Single entry point for every enquiry (website forms and the AI receptionist).
 * Creates/updates the customer, creates the lead (+ booking request / academy
 * registration), notifies management and syncs to HubSpot.
 */
export async function submitEnquiry(raw: unknown, opts: { sourceOverride?: LeadSource } = {}): Promise<EnquiryResult> {
  const e = EnquirySchema.parse(raw);
  if (e.website) throw new Error('spam');
  if (e.consent_contact !== true) throw new Error('consent required'); // unreachable – enforced by schema
  const repo = db();
  const defaults = FORM_DEFAULTS[e.form];
  const leadType: LeadType = e.lead_type ?? defaults.leadType;
  const source = opts.sourceOverride ?? defaults.source;

  const customer = await upsertCustomer(e, source);
  const details = composeDetails(e);
  const q = qualifyLead({
    leadType,
    source,
    hasEmail: Boolean(e.email),
    hasPhone: Boolean(e.phone),
    consentContact: true,
    serviceInterest: e.service_interest ?? (e.form === 'club' ? 'Club partnership' : null),
    ageGroup: e.athlete_age_group ?? null,
    details,
    isGuardian: e.is_guardian,
    preferredTimesGiven: Boolean(e.preferred_days || e.preferred_times),
  });

  const followUpDue = new Date(Date.now() + (q.priority === 'high' ? 4 : 24) * 3600_000).toISOString();
  const lead = await repo.insert('leads', {
    customer_id: customer.id,
    conversation_id: e.conversation_id ?? null,
    lead_type: leadType,
    source,
    service_interest: e.service_interest ?? (leadType === 'club_partnership' ? 'Club partnership' : null),
    athlete_age_group: e.athlete_age_group ?? null,
    stage: q.stage,
    qualification_score: q.score,
    is_qualified: q.isQualified,
    priority: q.priority,
    needs_attention: q.needsAttention,
    attention_reason: q.attentionReason,
    enquiry_details: details ?? null,
    follow_up_status: 'pending',
    follow_up_due: followUpDue,
    hubspot_sync_status: 'pending',
  });
  await repo.insert('lead_events', {
    lead_id: lead.id,
    event_type: 'created',
    actor: source,
    detail: { score: q.score, reasons: q.reasons, form: e.form },
  });

  let bookingRequestId: string | null = null;
  if (leadType === 'booking' || e.preferred_days || e.preferred_times) {
    const service = e.service_interest
      ? (await listServices()).find((s) => s.name === e.service_interest || s.slug === e.service_interest)
      : undefined;
    const br = await repo.insert('booking_requests', {
      customer_id: customer.id,
      lead_id: lead.id,
      service_id: service?.id ?? null,
      service_name: service?.name ?? e.service_interest ?? 'Not specified',
      preferred_days: e.preferred_days ?? null,
      preferred_times: e.preferred_times ?? null,
      notes: e.details ?? null,
      status: 'requested',
    });
    bookingRequestId = br.id;
  }

  let registrationId: string | null = null;
  if (e.form === 'academy' && e.athlete_age_group && e.athlete_first_name) {
    const reg = await repo.insert('academy_registrations', {
      guardian_customer_id: customer.id,
      lead_id: lead.id,
      athlete_first_name: e.athlete_first_name,
      athlete_last_name: e.athlete_last_name ?? null,
      athlete_age_group: e.athlete_age_group,
      athlete_age: e.athlete_age ?? null,
      club_or_school: e.club_or_school ?? null,
      status: 'registration_submitted',
      guardian_consent: true,
      guardian_consent_at: new Date().toISOString(),
    });
    registrationId = reg.id;
  }

  if (e.conversation_id) {
    const convo = await repo.get('conversations', e.conversation_id);
    if (convo) await repo.update('conversations', convo.id, { customer_id: customer.id, lead_id: lead.id });
  }

  // ---- Notifications (most specific type wins) ----
  const who = `${customer.full_name}${e.email ? ` · ${e.email}` : ''}${e.phone ? ` · ${e.phone}` : ''}`;
  const summary = [
    `${LEAD_TYPE_LABELS[leadType]} via ${source.replace(/_/g, ' ')}`,
    who,
    e.service_interest ? `Service: ${e.service_interest}` : '',
    e.athlete_age_group ? `Age group: ${e.athlete_age_group}` : '',
    `Score ${q.score}/100${q.isQualified ? ' (qualified)' : ''}`,
    details ? `\n${details}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const link = `/admin/leads?id=${lead.id}`;
  if (leadType === 'complaint') {
    await notify({ type: 'complaint', title: `Complaint from ${customer.full_name}`, body: summary, severity: 'urgent', linkPath: link, leadId: lead.id, conversationId: e.conversation_id });
  } else if (leadType === 'club_partnership') {
    await notify({ type: 'club_partnership', title: `Club partnership: ${e.club_name ?? customer.full_name}`, body: summary, severity: 'important', linkPath: link, leadId: lead.id, conversationId: e.conversation_id });
  } else if (leadType === 'academy') {
    await notify({ type: 'academy_enquiry', title: `Academy ${registrationId ? 'registration' : 'enquiry'}${e.athlete_age_group ? ` (${e.athlete_age_group})` : ''} – ${customer.full_name}`, body: summary, severity: 'important', linkPath: registrationId ? '/admin/academy' : link, leadId: lead.id, conversationId: e.conversation_id });
  } else if (bookingRequestId) {
    await notify({ type: 'booking_request', title: `Booking request: ${e.service_interest ?? 'service TBC'} – ${customer.full_name}`, body: summary, severity: 'important', linkPath: '/admin/bookings', leadId: lead.id, conversationId: e.conversation_id });
  } else if (q.isQualified) {
    await notify({ type: 'qualified_lead', title: `Qualified lead: ${customer.full_name}`, body: summary, severity: 'important', linkPath: link, leadId: lead.id, conversationId: e.conversation_id });
  } else {
    await notify({ type: 'qualified_lead', title: `New enquiry: ${customer.full_name}`, body: summary, severity: 'info', linkPath: link, leadId: lead.id, conversationId: e.conversation_id, email: false });
  }

  const crm = await syncLeadToHubSpot(lead.id, {});

  if (env.sendCustomerAcks && customer.email) {
    await sendEmail({
      to: [customer.email],
      subject: 'We’ve received your ASPARC enquiry',
      html: emailLayout(
        `Thanks, ${escapeHtml(customer.full_name.split(' ')[0])}`,
        `<p>We’ve received your enquiry about <strong>${escapeHtml(e.service_interest ?? LEAD_TYPE_LABELS[leadType])}</strong>. A member of the ASPARC team will be in touch.</p><p>This is an acknowledgement only – no booking, registration or payment has been confirmed.</p>`,
      ),
      text: `Thanks – we've received your ASPARC enquiry. A member of the team will be in touch. This is an acknowledgement only; nothing has been booked or charged.`,
      entityType: 'lead',
      entityId: lead.id,
    });
  }

  return { leadId: lead.id, customerId: customer.id, bookingRequestId, registrationId, qualified: q.isQualified, crm: crm.status };
}

/** Moves a lead through the pipeline, records history and re-syncs HubSpot. */
export async function changeLeadStage(leadId: string, stage: LeadStage, actor: string): Promise<Lead | null> {
  const repo = db();
  const lead = await repo.get('leads', leadId);
  if (!lead) return null;
  if (lead.stage === stage) return lead;
  const patch: Partial<Lead> = { stage };
  if (stage === 'qualified') patch.is_qualified = true;
  if (stage === 'contacted' && lead.follow_up_status === 'pending') patch.follow_up_status = 'in_progress';
  if (stage === 'converted' || stage === 'not_proceeding') {
    patch.follow_up_status = 'done';
    patch.needs_attention = false;
  }
  const updated = await repo.update('leads', leadId, patch);
  await repo.insert('lead_events', {
    lead_id: leadId,
    event_type: 'stage_changed',
    actor,
    detail: { from: lead.stage, to: stage, label: LEAD_STAGE_LABELS[stage] },
  });
  await syncLeadToHubSpot(leadId, { note: `Stage changed: ${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[stage]} (by ${actor})` });
  return updated;
}
