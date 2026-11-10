-- =====================================================================
-- ASPARC platform – core schema
-- Target: Supabase (PostgreSQL 15+). Money is integer cents (AUD).
-- All application access goes through server-side API routes using the
-- service role. RLS (next migration) denies anon access entirely and
-- gives authenticated admin users role-based access.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- admin users ----------------------------------------------
-- id matches auth.users.id (Supabase Auth holds the password).
create table public.admin_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text,
  role          text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  active        boolean not null default true,
  password_hash text,           -- unused with Supabase Auth; kept for schema parity with local dev
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index admin_users_email_key on public.admin_users (lower(email));

-- ---------- customers ------------------------------------------------
create table public.customers (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (char_length(full_name) between 1 and 160),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                text check (phone is null or char_length(phone) <= 32),
  preferred_contact    text check (preferred_contact in ('email', 'phone', 'sms', 'whatsapp')),
  is_guardian          boolean not null default false,
  consent_contact      boolean not null default false,
  consent_contact_at   timestamptz,
  consent_marketing    boolean not null default false,
  consent_marketing_at timestamptz,
  source               text not null default 'other',
  hubspot_contact_id   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint customers_contactable check (email is not null or phone is not null)
);
create unique index customers_email_key on public.customers (lower(email)) where email is not null;
create index customers_phone_idx on public.customers (phone) where phone is not null;
create index customers_created_idx on public.customers (created_at desc);

-- ---------- conversations & messages ---------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null default 'website' check (channel in ('website', 'whatsapp', 'instagram', 'facebook')),
  -- Anonymous per-browser/per-channel identifier. Conversations are NOT
  -- merged across channels unless a customer is verified and consents.
  visitor_id       text not null,
  customer_id      uuid references public.customers (id) on delete set null,
  lead_id          uuid,  -- FK added after leads table
  status           text not null default 'open' check (status in ('open', 'escalated', 'closed')),
  needs_attention  boolean not null default false,
  attention_reason text,
  ai_mode          text not null default 'guided' check (ai_mode in ('openai', 'guided')),
  message_count    integer not null default 0,
  summary          text,
  state            jsonb not null default '{}'::jsonb,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index conversations_visitor_idx on public.conversations (channel, visitor_id);
create index conversations_last_msg_idx on public.conversations (last_message_at desc);
create index conversations_attention_idx on public.conversations (needs_attention) where needs_attention;
create index conversations_customer_idx on public.conversations (customer_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content         text not null check (char_length(content) <= 8000),
  tool_name       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------- leads ----------------------------------------------------
create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete cascade,
  conversation_id     uuid references public.conversations (id) on delete set null,
  lead_type           text not null default 'general' check (lead_type in (
                        'general', 'sports_performance', 'academy', 'rehabilitation', 'massage',
                        'testing', 'club_partnership', 'booking', 'complaint')),
  source              text not null default 'other',
  service_interest    text,
  athlete_age_group   text check (athlete_age_group in ('8-10', '11-13', '14-16', '16-18')),
  stage               text not null default 'new_enquiry' check (stage in (
                        'new_enquiry', 'contacted', 'qualified', 'booking_requested', 'converted', 'not_proceeding')),
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  is_qualified        boolean not null default false,
  priority            text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  needs_attention     boolean not null default false,
  attention_reason    text,
  enquiry_details     text check (enquiry_details is null or char_length(enquiry_details) <= 4000),
  follow_up_status    text not null default 'pending' check (follow_up_status in ('pending', 'in_progress', 'done')),
  follow_up_due       timestamptz,
  assigned_to         uuid references public.admin_users (id) on delete set null,
  hubspot_deal_id     text,
  hubspot_sync_status text not null default 'not_configured' check (hubspot_sync_status in (
                        'not_configured', 'pending', 'synced', 'failed')),
  hubspot_synced_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index leads_customer_idx on public.leads (customer_id);
create index leads_stage_idx on public.leads (stage);
create index leads_type_idx on public.leads (lead_type);
create index leads_source_idx on public.leads (source);
create index leads_created_idx on public.leads (created_at desc);
create index leads_attention_idx on public.leads (needs_attention) where needs_attention;
create index leads_followup_idx on public.leads (follow_up_status, follow_up_due);

alter table public.conversations
  add constraint conversations_lead_fk foreign key (lead_id) references public.leads (id) on delete set null;

create table public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  event_type text not null check (event_type in (
               'created', 'stage_changed', 'note', 'follow_up', 'crm_sync', 'enquiry', 'assigned')),
  detail     jsonb not null default '{}'::jsonb,
  actor      text not null default 'system',
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

-- ---------- services & knowledge base --------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  category         text not null check (category in ('performance', 'academy', 'rehabilitation', 'recovery', 'testing')),
  summary          text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  price_cents      integer check (price_cents is null or price_cents >= 0),
  price_unit       text,
  price_status     text not null default 'on_enquiry' check (price_status in ('draft', 'approved', 'on_enquiry')),
  availability     text not null default 'pending_confirmation' check (availability in (
                     'available', 'pending_confirmation', 'unavailable')),
  bookable         boolean not null default false,
  payment_link_url text check (payment_link_url is null or payment_link_url ~ '^https://'),
  is_public        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- a price can only be shown if one exists
  constraint services_price_consistency check (price_status = 'on_enquiry' or price_cents is not null)
);
create index services_category_idx on public.services (category, sort_order);

create table public.knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  category   text not null check (category in ('business', 'hours', 'faq', 'policy', 'ai_rule', 'settings')),
  title      text not null,
  content    text not null default '',
  data       jsonb not null default '{}'::jsonb,
  status     text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  is_public  boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_base_category_idx on public.knowledge_base (category, status);

-- ---------- bookings, academy, payments ------------------------------
create table public.booking_requests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  lead_id         uuid references public.leads (id) on delete set null,
  service_id      uuid references public.services (id) on delete set null,
  service_name    text not null,
  preferred_days  text,
  preferred_times text,
  notes           text check (notes is null or char_length(notes) <= 2000),
  -- "confirmed_by_staff" is set by a human only; the system never auto-confirms
  status          text not null default 'requested' check (status in (
                    'requested', 'in_progress', 'confirmed_by_staff', 'declined', 'cancelled')),
  external_ref    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index booking_requests_status_idx on public.booking_requests (status, created_at desc);
create index booking_requests_customer_idx on public.booking_requests (customer_id);

create table public.academy_registrations (
  id                   uuid primary key default gen_random_uuid(),
  guardian_customer_id uuid not null references public.customers (id) on delete cascade,
  lead_id              uuid references public.leads (id) on delete set null,
  athlete_first_name   text not null check (char_length(athlete_first_name) between 1 and 80),
  athlete_last_name    text check (athlete_last_name is null or char_length(athlete_last_name) <= 80),
  athlete_age_group    text not null check (athlete_age_group in ('8-10', '11-13', '14-16', '16-18')),
  athlete_age          integer check (athlete_age is null or athlete_age between 6 and 19),
  club_or_school       text,
  program_term         text,
  status               text not null default 'enquiry' check (status in (
                         'enquiry', 'registration_submitted', 'waitlist', 'offered', 'enrolled', 'withdrawn')),
  guardian_consent     boolean not null default false,
  guardian_consent_at  timestamptz,
  payment_status       text not null default 'not_requested' check (payment_status in (
                         'not_requested', 'link_sent', 'paid', 'refunded')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint academy_guardian_consent check (guardian_consent = true)
);
create index academy_age_group_idx on public.academy_registrations (athlete_age_group, status);
create index academy_guardian_idx on public.academy_registrations (guardian_customer_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers (id) on delete set null,
  provider     text not null default 'stripe' check (provider in ('stripe')),
  provider_ref text not null unique,  -- Stripe payment_intent / checkout session id
  description  text,
  amount_cents integer not null check (amount_cents >= 0),
  currency     text not null default 'aud',
  status       text not null check (status in ('succeeded', 'refunded', 'failed', 'pending')),
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index payments_paid_idx on public.payments (paid_at desc);

-- ---------- notifications, logs, summaries ---------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in (
                    'qualified_lead', 'academy_enquiry', 'club_partnership', 'complaint', 'unresolved_question',
                    'booking_request', 'payment_confirmation', 'escalation', 'daily_summary', 'integration_error')),
  title           text not null,
  body            text not null default '',
  severity        text not null default 'info' check (severity in ('info', 'important', 'urgent')),
  link_path       text,
  lead_id         uuid references public.leads (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  read_at         timestamptz,
  email_status    text not null default 'not_required' check (email_status in (
                    'not_configured', 'pending', 'sent', 'failed', 'not_required')),
  email_error     text,
  created_at      timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (created_at desc) where read_at is null;
create index notifications_type_idx on public.notifications (type, created_at desc);

create table public.integration_logs (
  id          uuid primary key default gen_random_uuid(),
  integration text not null check (integration in ('hubspot', 'resend', 'openai', 'stripe', 'cliniko', 'whatsapp', 'messenger')),
  action      text not null,
  status      text not null check (status in ('success', 'error', 'skipped')),
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index integration_logs_idx on public.integration_logs (integration, created_at desc);
create index integration_logs_entity_idx on public.integration_logs (entity_type, entity_id);

create table public.daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  summary_date date not null unique,
  timezone     text not null default 'Australia/Melbourne',
  data         jsonb not null,
  email_status text not null default 'not_required',
  created_at   timestamptz not null default now()
);

-- ---------- updated_at triggers --------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_users', 'customers', 'conversations', 'leads', 'services',
                           'knowledge_base', 'booking_requests', 'academy_registrations']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;
