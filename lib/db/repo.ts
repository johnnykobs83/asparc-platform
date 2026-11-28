import type { TableName, Tables } from './types';

export type Row<T extends TableName> = Tables[T];

export interface ListOptions<T extends TableName> {
  /** Equality filters */
  eq?: Partial<Record<keyof Row<T>, string | number | boolean | null>>;
  /** created_at >= since (ISO) */
  since?: string;
  /** created_at < until (ISO) */
  until?: string;
  /** Range on another column: column >= gte and column < lt (ISO timestamps or YYYY-MM-DD dates). */
  range?: { column: keyof Row<T>; gte?: string; lt?: string };
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
    date_of_birth: null,
    address: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    sport: null,
    club: null,
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
    standard_price_cents: null,
    offer_label: null,
    offer_terms: null,
    is_featured: false,
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
  payments: { customer_id: null, provider: 'stripe', description: null, currency: 'aud', paid_at: null, service_slug: null, tax_cents: null, refunded_cents: 0 },
  daily_summaries: { timezone: 'Australia/Melbourne', email_status: 'not_required' },
  admin_users: { full_name: null, role: 'staff', active: true, password_hash: null, last_login_at: null },
  practitioners: { title: null, service_ids: [], weekly_hours: {}, buffer_minutes: 0, active: true, staff_member_id: null, colour: null },
  client_notes: { author_id: null, author_name: null },
  academy_sessions: { capacity: 12, location: '104/12 Ormond Blvd, Bundoora', active: true },
  academy_enrolments: { session_ids: [], casual_date: null, term_label: 'Term 1 2027', status: 'awaiting_payment', price_cents: null, paid_at: null, payment_ref: null, club: null, parent_note: null, staff_note: null, consent_marketing: false, source: 'website' },
  intake_forms: {
    status: 'sent', sent_by: null, sent_to: null, reason: 'manual', submitted_at: null, for_whom: null, athlete_name: null, athlete_dob: null,
    details: {}, screening: {}, health: {}, screening_flags: 0, review_status: 'not_needed', reviewed_by: null, reviewed_at: null, review_note: null,
    consent_health: false, consent_risk: false, consent_marketing: false, signature_name: null, valid_until: null,
  },
  staff_members: { email: null, phone: null, role_title: null, employment_type: 'employee', admin_user_id: null, active: true },
  work_locations: { kind: 'other', address: null, access_notes: null, colour: '#14519C', client_id: null, active: true },
  planner_jobs: { job_type: 'other', client_id: null, notes: null, status: 'scheduled', series_id: null, created_by: null },
  planner_assignments: { covering_for_staff_id: null, cover_reason: null, acknowledged_at: null },
  planner_weeks: { published_at: null, published_by: null },
  planner_changes: { job_id: null, notified_at: null },
  staff_leave: { reason: 'leave' },
  clients: { kind: 'club', abn: null, contact_name: null, billing_email: null, phone: null, stripe_customer_id: null, status: 'active', notes: null },
  client_agreements: { agreed_value_cents: null, end_date: null, payment_terms_days: 14, inclusions: null, status: 'active' },
  client_invoices: { agreement_id: null, gst_cents: 0, amount_paid_cents: 0, paid_on: null, method: null, status: 'open', stripe_invoice_id: null, hosted_invoice_url: null, notes: null },
  appointments: { service_id: null, status: 'confirmed', notes: null, cancel_reason: null, source: 'website', price_cents: null, final_price_cents: null, price_note: null, series_id: null },
  members: {
    club: null, team: null, is_guardian: false, athlete_name: null, access_hub: true, access_warmup: true, access_downloads: true, active: true,
    password_hash: null, password_set_at: null, invite_nonce: null, invite_expires_at: null, invited_at: null, invited_by: null, last_login_at: null, login_count: 0, notes: null,
  },
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
  'staff_members',
  'work_locations',
  'planner_jobs',
  'planner_assignments',
  'planner_weeks',
  'clients',
  'client_agreements',
  'client_invoices',
  'intake_forms',
  'academy_sessions',
  'academy_enrolments',
  'members',
]);
