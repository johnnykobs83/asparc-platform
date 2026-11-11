import type { TableName, Tables } from './types';

export type Row<T extends TableName> = Tables[T];

export interface ListOptions<T extends TableName> {
  /** Equality filters */
  eq?: Partial<Record<keyof Row<T>, string | number | boolean | null>>;
  /** created_at >= since (ISO) */
  since?: string;
  /** created_at < until (ISO) */
  until?: string;
  orderBy?: keyof Row<T>;
  ascending?: boolean;
  limit?: number;
}

/**
 * Minimal persistence contract used by every domain service.
 * Two implementations: Supabase (PostgREST over fetch) and Local (JSON / memory).
 * Keeping it this small means domain logic is tested once and runs on both.
 */
export interface Repo {
  readonly kind: 'supabase' | 'local';
  insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T> | null>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  findOne<T extends TableName>(table: T, eq: ListOptions<T>['eq']): Promise<Row<T> | null>;
  list<T extends TableName>(table: T, opts?: ListOptions<T>): Promise<Row<T>[]>;
  count<T extends TableName>(table: T, opts?: Omit<ListOptions<T>, 'limit' | 'orderBy'>): Promise<number>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
}

/** Column defaults applied by the local store (Postgres applies its own). */
export const DEFAULTS: { [K in TableName]?: Partial<Tables[K]> } = {
  customers: {
    phone: null,
    email: null,
    preferred_contact: null,
    is_guardian: false,
    consent_contact: false,
    consent_contact_at: null,
    consent_marketing: false,
    consent_marketing_at: null,
    source: 'other',
    hubspot_contact_id: null,
  },
  conversations: {
    channel: 'website',
    customer_id: null,
    lead_id: null,
    status: 'open',
    needs_attention: false,
    attention_reason: null,
    ai_mode: 'guided',
    message_count: 0,
    summary: null,
    state: {},
    last_message_at: null,
  },
  messages: { tool_name: null, metadata: {} },
  leads: {
    conversation_id: null,
    lead_type: 'general',
    source: 'other',
    service_interest: null,
    athlete_age_group: null,
    stage: 'new_enquiry',
    qualification_score: 0,
    is_qualified: false,
    priority: 'normal',
    needs_attention: false,
    attention_reason: null,
    enquiry_details: null,
    follow_up_status: 'pending',
    follow_up_due: null,
    assigned_to: null,
    hubspot_deal_id: null,
    hubspot_sync_status: 'not_configured',
    hubspot_synced_at: null,
  },
  lead_events: { detail: {}, actor: 'system' },
  services: {
    summary: '',
    duration_minutes: null,
    price_cents: null,
    price_unit: null,
    price_status: 'on_enquiry',
    availability: 'pending_confirmation',
    bookable: false,
    payment_link_url: null,
    is_public: true,
    sort_order: 0,
  },
  knowledge_base: { content: '', data: {}, status: 'draft', is_public: true, updated_by: null },
  notifications: {
    body: '',
    severity: 'info',
    link_path: null,
    lead_id: null,
    conversation_id: null,
    read_at: null,
    email_status: 'not_required',
    email_error: null,
  },
  integration_logs: { entity_type: null, entity_id: null, detail: {}, error: null },
  booking_requests: {
    lead_id: null,
    service_id: null,
    preferred_days: null,
    preferred_times: null,
    notes: null,
    status: 'requested',
    external_ref: null,
  },
  academy_registrations: {
    lead_id: null,
    athlete_last_name: null,
    athlete_age: null,
    club_or_school: null,
    program_term: null,
    status: 'enquiry',
    guardian_consent: false,
    guardian_consent_at: null,
    payment_status: 'not_requested',
  },
  payments: { customer_id: null, provider: 'stripe', description: null, currency: 'aud', paid_at: null },
  daily_summaries: { timezone: 'Australia/Melbourne', email_status: 'not_required' },
  admin_users: { full_name: null, role: 'staff', active: true, password_hash: null, last_login_at: null },
  practitioners: { title: null, service_ids: [], weekly_hours: {}, buffer_minutes: 0, active: true },
  appointments: { service_id: null, status: 'confirmed', notes: null, cancel_reason: null, source: 'website' },
};

/** Tables with an updated_at column. */
export const HAS_UPDATED_AT: ReadonlySet<TableName> = new Set<TableName>([
  'admin_users',
  'customers',
  'conversations',
  'leads',
  'services',
  'knowledge_base',
  'booking_requests',
  'academy_registrations',
  'practitioners',
  'appointments',
]);
