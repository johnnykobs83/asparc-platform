import { LocalRepo } from '../lib/db/local';
import { setDb } from '../lib/db';
import { resetSeedState } from '../lib/kb/service';
import { resetRateLimits } from '../lib/security/ratelimit';
import { signSession } from '../lib/auth/session';
import type { Role } from '../lib/db/types';

const BASE_ENV = {
  NODE_ENV: 'test',
  DATA_BACKEND: 'local',
  LOCAL_DB_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
  NEXT_PUBLIC_SITE_URL: 'https://www.asparc.com.au',
};
const INTEGRATION_KEYS = ['OPENAI_API_KEY', 'HUBSPOT_ACCESS_TOKEN', 'HUBSPOT_PIPELINE_ID', 'RESEND_API_KEY', 'RESEND_FROM', 'NOTIFY_EMAIL_TO', 'CRON_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WHATSAPP_ENABLED', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET', 'META_MESSENGER_ENABLED', 'META_PAGE_ACCESS_TOKEN', 'META_VERIFY_TOKEN', 'SEND_CUSTOMER_ACKNOWLEDGEMENTS', 'ADMIN_BOOTSTRAP_EMAIL', 'ADMIN_BOOTSTRAP_PASSWORD'];

export const realFetch = globalThis.fetch;

/** Fresh in-memory database + clean env for every test. */
export function freshDb(extraEnv: Record<string, string> = {}) {
  for (const k of INTEGRATION_KEYS) delete process.env[k];
  Object.assign(process.env, BASE_ENV, extraEnv);
  const repo = new LocalRepo(':memory:');
  setDb(repo);
  resetSeedState();
  resetRateLimits();
  globalThis.fetch = (async (url: string) => {
    throw new Error(`Unexpected network call in test: ${url}`);
  }) as typeof fetch;
  return repo;
}

export interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

/** Route external API calls to handlers; records every call. */
export function mockFetch(routes: [RegExp, (call: FetchCall) => { status?: number; body?: unknown }][]) {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const call: FetchCall = {
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? safeJson(init.body) : init.body,
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
    };
    calls.push(call);
    const route = routes.find(([re]) => re.test(`${call.method} ${url}`));
    if (!route) throw new Error(`Unmocked fetch: ${call.method} ${url}`);
    const r = route[1](call);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export async function adminCookie(role: Role = 'owner', email = `${role}@asparc.test`) {
  const token = await signSession({ sub: `00000000-0000-4000-8000-00000000000${role.length}`, email, role, name: role });
  return `asparc_session=${token}`;
}

export function req(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', host: 'localhost', ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`http://localhost${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

export const VISITOR = 'visitor_test_0123456789abcdef';

export const validEnquiry = (over: Record<string, unknown> = {}) => ({
  form: 'contact',
  full_name: 'Test Person',
  email: 'test.person@example.com',
  phone: '0400 000 000',
  consent_contact: true,
  service_interest: 'Strength & Conditioning',
  details: 'Looking to get stronger before pre-season starts next month.',
  ...over,
});
