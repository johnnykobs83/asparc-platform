/**
 * Central, typed access to environment configuration.
 * Server-side only – never import this from a client component.
 * Values are read lazily so tests can change process.env between cases.
 */

const read = (key: string): string => (process.env[key] ?? '').trim();
const flag = (key: string): boolean => /^(1|true|yes|on)$/i.test(read(key));

export const env = {
  get nodeEnv() {
    return read('NODE_ENV') || 'development';
  },
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  get siteUrl() {
    return (read('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
  },

  // Data
  get dataBackend(): 'supabase' | 'local' {
    const explicit = read('DATA_BACKEND');
    if (explicit === 'supabase' || explicit === 'local') return explicit;
    return read('SUPABASE_URL') && read('SUPABASE_SERVICE_ROLE_KEY') ? 'supabase' : 'local';
  },
  get localDbPath() {
    return read('LOCAL_DB_PATH') || '.data/local-db.json';
  },
  get supabaseUrl() {
    return read('SUPABASE_URL').replace(/\/$/, '');
  },
  get supabaseAnonKey() {
    return read('SUPABASE_ANON_KEY');
  },
  get supabaseServiceKey() {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },

  // Auth
  get sessionSecret() {
    return read('SESSION_SECRET');
  },
  get adminBootstrapEmail() {
    return read('ADMIN_BOOTSTRAP_EMAIL').toLowerCase();
  },
  get adminBootstrapPassword() {
    return read('ADMIN_BOOTSTRAP_PASSWORD');
  },

  // AI
  get openaiKey() {
    return read('OPENAI_API_KEY');
  },
  get openaiModel() {
    return read('OPENAI_MODEL') || 'gpt-4o-mini';
  },

  // HubSpot
  get hubspotToken() {
    return read('HUBSPOT_ACCESS_TOKEN');
  },
  get hubspotPortalId() {
    return read('HUBSPOT_PORTAL_ID');
  },
  get hubspotPipelineId() {
    return read('HUBSPOT_PIPELINE_ID');
  },
  hubspotStage(stage: string) {
    return read(`HUBSPOT_STAGE_${stage.toUpperCase()}`);
  },

  // Email
  get resendKey() {
    return read('RESEND_API_KEY');
  },
  get resendFrom() {
    return read('RESEND_FROM');
  },
  get notifyEmailTo(): string[] {
    return read('NOTIFY_EMAIL_TO')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get sendCustomerAcks() {
    return flag('SEND_CUSTOMER_ACKNOWLEDGEMENTS');
  },

  // Jobs
  get cronSecret() {
    return read('CRON_SECRET');
  },

  // Later phases
  get whatsappEnabled() {
    return flag('WHATSAPP_ENABLED');
  },
  get whatsappVerifyToken() {
    return read('WHATSAPP_VERIFY_TOKEN');
  },
  get whatsappToken() {
    return read('WHATSAPP_ACCESS_TOKEN');
  },
  get whatsappPhoneNumberId() {
    return read('WHATSAPP_PHONE_NUMBER_ID');
  },
  get metaAppSecret() {
    return read('META_APP_SECRET');
  },
  get messengerEnabled() {
    return flag('META_MESSENGER_ENABLED');
  },
  get metaPageToken() {
    return read('META_PAGE_ACCESS_TOKEN');
  },
  /** Webhook verify token for Messenger/Instagram. Falls back to the WhatsApp one so a single Meta app can share it. */
  get metaVerifyToken() {
    return read('META_VERIFY_TOKEN') || read('WHATSAPP_VERIFY_TOKEN');
  },
  get stripeKey() {
    return read('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return read('STRIPE_WEBHOOK_SECRET');
  },
  get clinikoKey() {
    return read('CLINIKO_API_KEY');
  },
};

export type IntegrationKey =
  | 'supabase'
  | 'openai'
  | 'hubspot'
  | 'resend'
  | 'cron'
  | 'whatsapp'
  | 'messenger'
  | 'stripe'
  | 'cliniko';

export interface IntegrationStatus {
  key: IntegrationKey;
  name: string;
  phase: 1 | 2 | 3 | 4;
  state: 'connected' | 'not_configured' | 'partially_configured' | 'not_started';
  detail: string;
  missing: string[];
}

/** Reports what is configured – never returns secret values. */
export function integrationStatuses(): IntegrationStatus[] {
  const missing = (keys: string[]) => keys.filter((k) => !read(k));
  const state = (m: string[], total: number): IntegrationStatus['state'] =>
    m.length === 0 ? 'connected' : m.length === total ? 'not_configured' : 'partially_configured';

  const sb = missing(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const oa = missing(['OPENAI_API_KEY']);
  const hs = missing(['HUBSPOT_ACCESS_TOKEN']);
  const rs = missing(['RESEND_API_KEY', 'RESEND_FROM', 'NOTIFY_EMAIL_TO']);
  const cr = missing(['CRON_SECRET']);

  // Later phases: "not_started" until the first setting is added, "connected" only when all are present and switched on.
  const later = (m: string[], total: number): IntegrationStatus['state'] =>
    m.length === 0 ? 'connected' : m.length === total ? 'not_started' : 'partially_configured';
  const on = (flagKey: string) => (flag(flagKey) ? [] : [flagKey + '=true']);
  const wa = [...on('WHATSAPP_ENABLED'), ...missing(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET'])];
  const ms = [...on('META_MESSENGER_ENABLED'), ...missing(['META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET']), ...(read('META_VERIFY_TOKEN') || read('WHATSAPP_VERIFY_TOKEN') ? [] : ['META_VERIFY_TOKEN'])];
  const st = missing(['STRIPE_WEBHOOK_SECRET']);

  return [
    {
      key: 'supabase',
      name: 'Supabase database & auth',
      phase: 1,
      state: env.dataBackend === 'local' ? 'not_configured' : state(sb, 3),
      detail:
        env.dataBackend === 'local'
          ? 'Running on the local development store. Configure Supabase before going live.'
          : 'Production database with Row Level Security.',
      missing: sb,
    },
    {
      key: 'openai',
      name: 'OpenAI (AI receptionist)',
      phase: 1,
      state: state(oa, 1),
      detail: oa.length
        ? 'Receptionist is running in guided mode (rules + knowledge base). Add a key for conversational AI.'
        : `Conversational AI enabled (model: ${env.openaiModel}).`,
      missing: oa,
    },
    {
      key: 'hubspot',
      name: 'HubSpot CRM',
      phase: 1,
      state: state(hs, 1),
      detail: hs.length
        ? 'Leads are stored in the ASPARC database only. Add a private-app token to sync contacts.'
        : env.hubspotPipelineId
          ? 'Contacts, notes and pipeline deals sync to HubSpot.'
          : 'Contacts and notes sync to HubSpot (no deal pipeline configured).',
      missing: hs,
    },
    {
      key: 'resend',
      name: 'Resend email notifications',
      phase: 1,
      state: state(rs, 3),
      detail: rs.length
        ? 'Notifications appear in the dashboard only. Add Resend to also email management.'
        : `Emails sent to ${env.notifyEmailTo.length} recipient(s).`,
      missing: rs,
    },
    {
      key: 'cron',
      name: 'Daily summary schedule',
      phase: 1,
      state: state(cr, 1),
      detail: cr.length
        ? 'Daily summary can be run manually from Reports. Add CRON_SECRET to enable the scheduled run.'
        : 'Runs daily via Vercel Cron (~7–8am Melbourne time).',
      missing: cr,
    },
    {
      key: 'whatsapp',
      name: 'WhatsApp Business Platform',
      phase: 2,
      state: later(wa, 5),
      detail:
        wa.length === 0
          ? 'Live: WhatsApp messages are answered by ASPARC AI. Webhook: /api/webhooks/whatsapp'
          : wa.length === 5
            ? 'Built and switched off. Requires Meta Business verification and a WhatsApp number.'
            : 'Switched off until every setting below is added.',
      missing: wa,
    },
    {
      key: 'messenger',
      name: 'Instagram & Facebook Messenger',
      phase: 3,
      state: later(ms, 4),
      detail:
        ms.length === 0
          ? 'Live: Messenger and Instagram messages are answered by ASPARC AI. Webhook: /api/webhooks/meta'
          : ms.length === 4
            ? 'Built and switched off. Requires Meta app review for messaging permissions.'
            : 'Switched off until every setting below is added.',
      missing: ms,
    },
    {
      key: 'stripe',
      name: 'Stripe payments',
      phase: 4,
      state: later(st, 1),
      detail: st.length
        ? 'Built and switched off. Revenue reporting activates once the Stripe webhook is connected. No card data is ever taken in chat.'
        : 'Live: payments reported by Stripe are recorded and shown in Revenue. Webhook: /api/webhooks/stripe',
      missing: st,
    },
    {
      key: 'cliniko',
      name: 'Cliniko bookings',
      phase: 4,
      state: 'not_started',
      detail: 'Booking requests are captured now; live availability appears only after integration.',
      missing: missing(['CLINIKO_API_KEY', 'CLINIKO_SHARD']),
    },
  ];
}
