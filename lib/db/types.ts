/**
 * Domain types – mirror supabase/migrations/0001_init.sql exactly.
 * Timestamps are ISO strings, money is integer cents (AUD).
 */

export type Uuid = string;
export type Iso = string;

export const LEAD_STAGES = [
  'new_enquiry',
  'contacted',
  'qualified',
  'booking_requested',
  'converted',
  'not_proceeding',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new_enquiry: 'New Enquiry',
  contacted: 'Contacted',
  qualified: 'Qualified',
  booking_requested: 'Booking Requested',
  converted: 'Converted',
  not_proceeding: 'Not Proceeding',
};

export const LEAD_TYPES = [
  'general',
  'sports_performance',
  'academy',
  'rehabilitation',
  'massage',
  'testing',
  'club_partnership',
  'booking',
  'complaint',
] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  general: 'General enquiry',
  sports_performance: 'Sports performance',
  academy: 'Performance Academy',
  rehabilitation: 'Rehabilitation / return to performance',
  massage: 'Remedial massage',
  testing: 'Performance testing',
  club_partnership: 'Club partnership',
  booking: 'Booking request',
  complaint: 'Complaint / feedback',
};

export const LEAD_SOURCES = [
  'website_chat',
  'contact_form',
  'academy_form',
  'booking_form',
  'club_form',
  'massage_form',
  'whatsapp',
  'instagram',
  'facebook',
  'phone',
  'walk_in',
  'referral',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website_chat: 'Website chat',
  contact_form: 'Contact form',
  academy_form: 'Academy form',
  booking_form: 'Booking form',
  club_form: 'Club partnership form',
  massage_form: 'Massage enquiry form',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  phone: 'Phone',
  walk_in: 'Walk-in',
  referral: 'Referral',
  other: 'Other',
};

export const AGE_GROUPS = ['8-10', '11-13', '14-16', '16-18'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export type Channel = 'website' | 'whatsapp' | 'instagram' | 'facebook';
export type ContactMethod = 'email' | 'phone' | 'sms' | 'whatsapp';
export type Role = 'owner' | 'manager' | 'staff';
export type SyncStatus = 'not_configured' | 'pending' | 'synced' | 'failed';

export interface Customer {
  id: Uuid;
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: ContactMethod | null;
  is_guardian: boolean;
  consent_contact: boolean;
  consent_contact_at: Iso | null;
  consent_marketing: boolean;
  consent_marketing_at: Iso | null;
  source: LeadSource;
  hubspot_contact_id: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface Conversation {
  id: Uuid;
  channel: Channel;
  visitor_id: string;
  customer_id: Uuid | null;
  lead_id: Uuid | null;
  status: 'open' | 'escalated' | 'closed';
  needs_attention: boolean;
  attention_reason: string | null;
  ai_mode: 'openai' | 'guided';
  message_count: number;
  summary: string | null;
  state: Record<string, unknown>;
  last_message_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface Message {
  id: Uuid;
  conversation_id: Uuid;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_name: string | null;
  metadata: Record<string, unknown>;
  created_at: Iso;
}

export interface Lead {
  id: Uuid;
  customer_id: Uuid;
  conversation_id: Uuid | null;
  lead_type: LeadType;
  source: LeadSource;
  service_interest: string | null;
  athlete_age_group: AgeGroup | null;
  stage: LeadStage;
  qualification_score: number;
  is_qualified: boolean;
  priority: 'high' | 'normal' | 'low';
  needs_attention: boolean;
  attention_reason: string | null;
  enquiry_details: string | null;
  follow_up_status: 'pending' | 'in_progress' | 'done';
  follow_up_due: Iso | null;
  assigned_to: Uuid | null;
  hubspot_deal_id: string | null;
  hubspot_sync_status: SyncStatus;
  hubspot_synced_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface LeadEvent {
  id: Uuid;
  lead_id: Uuid;
  event_type: 'created' | 'stage_changed' | 'note' | 'follow_up' | 'crm_sync' | 'enquiry' | 'assigned';
  detail: Record<string, unknown>;
  actor: string;
  created_at: Iso;
}

export interface Service {
  id: Uuid;
  slug: string;
  name: string;
  category: 'performance' | 'academy' | 'rehabilitation' | 'recovery' | 'testing';
  summary: string;
  duration_minutes: number | null;
  price_cents: number | null;
  price_unit: string | null;
  price_status: 'draft' | 'approved' | 'on_enquiry';
  availability: 'available' | 'pending_confirmation' | 'unavailable';
  bookable: boolean;
  payment_link_url: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: Iso;
  updated_at: Iso;
}

export interface KnowledgeItem {
  id: Uuid;
  key: string;
  category: 'business' | 'hours' | 'faq' | 'policy' | 'ai_rule' | 'settings';
  title: string;
  content: string;
  data: Record<string, unknown>;
  status: 'draft' | 'approved' | 'archived';
  is_public: boolean;
  updated_by: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export type NotificationType =
  | 'qualified_lead'
  | 'academy_enquiry'
  | 'club_partnership'
  | 'complaint'
  | 'unresolved_question'
  | 'booking_request'
  | 'payment_confirmation'
  | 'escalation'
  | 'daily_summary'
  | 'integration_error';

export interface Notification {
  id: Uuid;
  type: NotificationType;
  title: string;
  body: string;
  severity: 'info' | 'important' | 'urgent';
  link_path: string | null;
  lead_id: Uuid | null;
  conversation_id: Uuid | null;
  read_at: Iso | null;
  email_status: 'not_configured' | 'pending' | 'sent' | 'failed' | 'not_required';
  email_error: string | null;
  created_at: Iso;
}

export interface IntegrationLog {
  id: Uuid;
  integration: 'hubspot' | 'resend' | 'openai' | 'stripe' | 'cliniko' | 'whatsapp' | 'messenger';
  action: string;
  status: 'success' | 'error' | 'skipped';
  entity_type: string | null;
  entity_id: Uuid | null;
  detail: Record<string, unknown>;
  error: string | null;
  created_at: Iso;
}

export interface BookingRequest {
  id: Uuid;
  customer_id: Uuid;
  lead_id: Uuid | null;
  service_id: Uuid | null;
  service_name: string;
  preferred_days: string | null;
  preferred_times: string | null;
  notes: string | null;
  status: 'requested' | 'in_progress' | 'confirmed_by_staff' | 'declined' | 'cancelled';
  external_ref: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface AcademyRegistration {
  id: Uuid;
  guardian_customer_id: Uuid;
  lead_id: Uuid | null;
  athlete_first_name: string;
  athlete_last_name: string | null;
  athlete_age_group: AgeGroup;
  athlete_age: number | null;
  club_or_school: string | null;
  program_term: string | null;
  status: 'enquiry' | 'registration_submitted' | 'waitlist' | 'offered' | 'enrolled' | 'withdrawn';
  guardian_consent: boolean;
  guardian_consent_at: Iso | null;
  payment_status: 'not_requested' | 'link_sent' | 'paid' | 'refunded';
  created_at: Iso;
  updated_at: Iso;
}

export interface Payment {
  id: Uuid;
  customer_id: Uuid | null;
  provider: 'stripe';
  provider_ref: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: 'succeeded' | 'refunded' | 'failed' | 'pending';
  paid_at: Iso | null;
  created_at: Iso;
}

export interface DailySummary {
  id: Uuid;
  summary_date: string; // YYYY-MM-DD (Melbourne)
  timezone: string;
  data: Record<string, unknown>;
  email_status: Notification['email_status'];
  created_at: Iso;
}

export interface AdminUser {
  id: Uuid;
  email: string;
  full_name: string | null;
  role: Role;
  active: boolean;
  password_hash: string | null; // local backend only; Supabase Auth holds passwords in production
  last_login_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

/** Weekly working hours: keys '0'–'6' (0 = Sunday), minutes from midnight in Melbourne local time. */
export type WeeklyHours = Record<string, { start: number; end: number }[]>;

export interface Practitioner {
  id: Uuid;
  name: string;
  title: string | null;
  service_ids: Uuid[];
  weekly_hours: WeeklyHours;
  buffer_minutes: number;
  active: boolean;
  created_at: Iso;
  updated_at: Iso;
}

export interface Appointment {
  id: Uuid;
  practitioner_id: Uuid;
  service_id: Uuid | null;
  service_name: string;
  customer_id: Uuid;
  starts_at: Iso;
  ends_at: Iso;
  /** ends_at plus the practitioner's buffer – the range that may not overlap another booking. */
  blocked_until: Iso;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  notes: string | null;
  cancel_reason: string | null;
  source: string;
  created_at: Iso;
  updated_at: Iso;
}

export interface Tables {
  customers: Customer;
  conversations: Conversation;
  messages: Message;
  leads: Lead;
  lead_events: LeadEvent;
  services: Service;
  knowledge_base: KnowledgeItem;
  notifications: Notification;
  integration_logs: IntegrationLog;
  booking_requests: BookingRequest;
  academy_registrations: AcademyRegistration;
  payments: Payment;
  daily_summaries: DailySummary;
  admin_users: AdminUser;
  practitioners: Practitioner;
  appointments: Appointment;
}
export type TableName = keyof Tables;
