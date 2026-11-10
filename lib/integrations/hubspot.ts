import { env } from '../config/env';
import { db } from '../db';
import type { Customer, Lead, LeadStage } from '../db/types';
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_TYPE_LABELS } from '../db/types';
import { fetchWithTimeout, logIntegration } from './log';

/**
 * HubSpot CRM sync (private-app token, CRM v3 REST API).
 *
 * What syncs:            contact (create/update by email) + custom ASPARC
 *                        properties, an enquiry note, and – if a pipeline is
 *                        configured – a deal whose stage mirrors the lead stage.
 * What never syncs:      athlete (child) names, conversation transcripts,
 *                        medical information. Only the parent/guardian or
 *                        adult client's contact details and enquiry summary.
 * When not configured:   nothing is sent; the attempt is logged as "skipped"
 *                        and the lead shows "HubSpot: not configured".
 */

const API = 'https://api.hubapi.com';

/**
 * Custom contact properties created by `npm run hubspot:setup`.
 * HubSpot's FREE CRM allows only 10 custom properties per account, so ASPARC
 * uses 6 and maps everything else to built-in fields (lifecyclestage,
 * hs_lead_status) or to the enquiry note.
 */
export const HUBSPOT_PROPERTIES = [
  { name: 'asparc_lead_stage', label: 'ASPARC lead stage', type: 'enumeration', fieldType: 'select', options: Object.entries(LEAD_STAGE_LABELS) },
  { name: 'asparc_lead_type', label: 'ASPARC lead type', type: 'enumeration', fieldType: 'select', options: Object.entries(LEAD_TYPE_LABELS) },
  { name: 'asparc_lead_source', label: 'ASPARC lead source', type: 'enumeration', fieldType: 'select', options: Object.entries(LEAD_SOURCE_LABELS) },
  { name: 'asparc_service_interest', label: 'ASPARC service interest', type: 'string', fieldType: 'text' },
  {
    name: 'asparc_athlete_age_group',
    label: 'ASPARC athlete age group',
    type: 'enumeration',
    fieldType: 'select',
    options: [['8-10', '8–10'], ['11-13', '11–13'], ['14-16', '14–16'], ['16-18', '16–18']],
  },
  { name: 'asparc_marketing_consent', label: 'ASPARC marketing consent', type: 'enumeration', fieldType: 'booleancheckbox', options: [['true', 'Yes'], ['false', 'No']] },
] as const;

/** ASPARC stage → HubSpot's built-in "Lead Status" (hs_lead_status) values. */
export const HS_LEAD_STATUS: Record<LeadStage, string> = {
  new_enquiry: 'NEW',
  contacted: 'CONNECTED',
  qualified: 'OPEN_DEAL',
  booking_requested: 'IN_PROGRESS',
  converted: 'CONNECTED',
  not_proceeding: 'UNQUALIFIED',
};

export const isHubSpotConfigured = () => Boolean(env.hubspotToken);

async function hs<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.hubspotToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function splitName(full: string): { firstname: string; lastname: string } {
  const parts = full.trim().split(/\s+/);
  return { firstname: parts[0] ?? '', lastname: parts.slice(1).join(' ') };
}

export function contactProperties(c: Customer, l: Lead): Record<string, string> {
  const { firstname, lastname } = splitName(c.full_name);
  const props: Record<string, string> = {
    firstname,
    lastname,
    lifecyclestage: l.stage === 'converted' ? 'customer' : 'lead',
    hs_lead_status: HS_LEAD_STATUS[l.stage],
    asparc_lead_stage: l.stage,
    asparc_lead_type: l.lead_type,
    asparc_lead_source: l.source,
    asparc_marketing_consent: String(c.consent_marketing),
  };
  if (c.email) props.email = c.email;
  if (c.phone) props.phone = c.phone;
  if (l.service_interest) props.asparc_service_interest = l.service_interest.slice(0, 250);
  if (l.athlete_age_group) props.asparc_athlete_age_group = l.athlete_age_group;
  return props;
}

export function dealStageFor(stage: LeadStage): string {
  return env.hubspotStage(stage);
}

async function findContactId(c: Customer): Promise<string | null> {
  if (c.hubspot_contact_id) return c.hubspot_contact_id;
  const filters = c.email
    ? [{ propertyName: 'email', operator: 'EQ', value: c.email }]
    : c.phone
      ? [{ propertyName: 'phone', operator: 'EQ', value: c.phone }]
      : [];
  if (!filters.length) return null;
  const res = await hs<{ results: { id: string }[] }>('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters }],
    properties: ['email'],
    limit: 1,
  });
  return res.results[0]?.id ?? null;
}

export interface SyncResult {
  status: 'synced' | 'skipped' | 'failed';
  contactId?: string;
  dealId?: string;
  error?: string;
}

/**
 * Creates/updates the HubSpot contact for a lead, records an enquiry note and
 * maintains a deal (if configured). Safe to call repeatedly (idempotent on
 * contact and deal). Never throws – failures are logged and surfaced.
 */
export async function syncLeadToHubSpot(leadId: string, opts: { note?: string } = {}): Promise<SyncResult> {
  const repo = db();
  const lead = await repo.get('leads', leadId);
  if (!lead) return { status: 'failed', error: 'Lead not found' };
  const customer = await repo.get('customers', lead.customer_id);
  if (!customer) return { status: 'failed', error: 'Customer not found' };

  if (!isHubSpotConfigured()) {
    await repo.update('leads', lead.id, { hubspot_sync_status: 'not_configured' });
    await logIntegration({ integration: 'hubspot', action: 'sync_lead', status: 'skipped', entity_type: 'lead', entity_id: lead.id, detail: { reason: 'HUBSPOT_ACCESS_TOKEN not set' } });
    return { status: 'skipped' };
  }

  try {
    const props = contactProperties(customer, lead);
    let contactId = await findContactId(customer);
    if (contactId) {
      await hs('PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: props });
    } else {
      const created = await hs<{ id: string }>('POST', '/crm/v3/objects/contacts', { properties: props });
      contactId = created.id;
    }
    if (customer.hubspot_contact_id !== contactId) await repo.update('customers', customer.id, { hubspot_contact_id: contactId });

    const noteBody = opts.note ?? buildEnquiryNote(lead, customer);
    if (noteBody) {
      await hs('POST', '/crm/v3/objects/notes', {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: noteBody },
        associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
      });
    }

    let dealId = lead.hubspot_deal_id ?? undefined;
    const pipeline = env.hubspotPipelineId;
    const dealstage = dealStageFor(lead.stage);
    if (pipeline && dealstage) {
      const dealProps = {
        dealname: `${customer.full_name} – ${LEAD_TYPE_LABELS[lead.lead_type]}`,
        pipeline,
        dealstage,
      };
      if (dealId) {
        await hs('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: dealProps });
      } else {
        const deal = await hs<{ id: string }>('POST', '/crm/v3/objects/deals', {
          properties: dealProps,
          associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }],
        });
        dealId = deal.id;
      }
    }

    await repo.update('leads', lead.id, {
      hubspot_sync_status: 'synced',
      hubspot_synced_at: new Date().toISOString(),
      hubspot_deal_id: dealId ?? null,
    });
    await repo.insert('lead_events', { lead_id: lead.id, event_type: 'crm_sync', actor: 'system', detail: { contactId, dealId: dealId ?? null } });
    await logIntegration({ integration: 'hubspot', action: 'sync_lead', status: 'success', entity_type: 'lead', entity_id: lead.id, detail: { contactId, dealId: dealId ?? null } });
    return { status: 'synced', contactId, dealId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await repo.update('leads', lead.id, { hubspot_sync_status: 'failed' });
    await logIntegration({ integration: 'hubspot', action: 'sync_lead', status: 'error', entity_type: 'lead', entity_id: lead.id, error });
    return { status: 'failed', error };
  }
}

export function buildEnquiryNote(l: Lead, c?: Customer): string {
  const lines = [
    `<strong>ASPARC enquiry</strong> (${LEAD_SOURCE_LABELS[l.source]})`,
    `Type: ${LEAD_TYPE_LABELS[l.lead_type]}`,
    l.service_interest ? `Service: ${escapeHtml(l.service_interest)}` : '',
    l.athlete_age_group ? `Athlete age group: ${l.athlete_age_group}` : '',
    `Stage: ${LEAD_STAGE_LABELS[l.stage]} · Score ${l.qualification_score}/100${l.is_qualified ? ' (qualified)' : ''}`,
    c ? `Preferred contact: ${c.preferred_contact ?? 'not specified'}${c.is_guardian ? ' · Parent/guardian' : ''} · Contact consent: ${c.consent_contact ? 'yes' : 'no'}` : '',
    l.enquiry_details ? `<br/>${escapeHtml(l.enquiry_details).slice(0, 1500)}` : '',
    `<br/><a href="${env.siteUrl}/admin/leads?id=${l.id}">Open in ASPARC dashboard</a>`,
  ];
  return lines.filter(Boolean).join('<br/>');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Connection test used by /admin → Integrations. */
export async function testHubSpotConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isHubSpotConfigured()) return { ok: false, message: 'HUBSPOT_ACCESS_TOKEN is not set.' };
  try {
    await hs('GET', '/crm/v3/objects/contacts?limit=1');
    const props = await hs<{ results: { name: string }[] }>('GET', '/crm/v3/properties/contacts');
    const have = new Set(props.results.map((p) => p.name));
    const missing = HUBSPOT_PROPERTIES.filter((p) => !have.has(p.name)).map((p) => p.name);
    return missing.length
      ? { ok: true, message: `Connected. ${missing.length} ASPARC properties missing – run "npm run hubspot:setup".` }
      : { ok: true, message: 'Connected. All ASPARC contact properties present.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Creates the ASPARC property group + custom contact properties (idempotent). */
export async function setupHubSpotProperties(): Promise<string[]> {
  const out: string[] = [];
  try {
    await hs('POST', '/crm/v3/properties/contacts/groups', { name: 'asparc', label: 'ASPARC' });
    out.push('Created property group "asparc"');
  } catch (e) {
    out.push(String(e).includes('409') ? 'Property group "asparc" already exists' : `Group: ${String(e)}`);
  }
  for (const p of HUBSPOT_PROPERTIES) {
    const body: Record<string, unknown> = { name: p.name, label: p.label, type: p.type, fieldType: p.fieldType, groupName: 'asparc' };
    if ('options' in p) body.options = (p.options as readonly (readonly [string, string])[]).map(([value, label], i) => ({ value, label, displayOrder: i }));
    try {
      await hs('POST', '/crm/v3/properties/contacts', body);
      out.push(`Created ${p.name}`);
    } catch (e) {
      out.push(String(e).includes('409') ? `${p.name} already exists` : `${p.name}: ${String(e)}`);
    }
  }
  return out;
}
