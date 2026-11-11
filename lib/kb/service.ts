import { db } from '../db';
import type { KnowledgeItem, Service } from '../db/types';
import { DEFAULT_KNOWLEDGE, DEFAULT_SERVICES } from './defaults';

let seeded: Promise<void> | null = null;

/** Seeds services + knowledge base on first use if empty. Idempotent. */
export function ensureSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const repo = db();
      const [svcCount, kbCount] = await Promise.all([repo.count('services'), repo.count('knowledge_base')]);
      if (svcCount === 0) for (const s of DEFAULT_SERVICES) await repo.insert('services', s);
      if (kbCount === 0) for (const k of DEFAULT_KNOWLEDGE) await repo.insert('knowledge_base', { ...k, updated_by: 'seed' });
    })().catch((e) => {
      seeded = null;
      throw e;
    });
  }
  return seeded;
}

/** Test hook */
export function resetSeedState() {
  seeded = null;
}

export async function listServices(opts: { publicOnly?: boolean } = {}): Promise<Service[]> {
  await ensureSeeded();
  const rows = await db().list('services', { orderBy: 'sort_order', ascending: true });
  return opts.publicOnly ? rows.filter((s) => s.is_public) : rows;
}

export async function listKnowledge(opts: { publicOnly?: boolean; approvedOnly?: boolean } = {}): Promise<KnowledgeItem[]> {
  await ensureSeeded();
  const rows = await db().list('knowledge_base', { orderBy: 'key', ascending: true });
  return rows.filter(
    (k) => k.status !== 'archived' && (!opts.publicOnly || k.is_public) && (!opts.approvedOnly || k.status === 'approved'),
  );
}

export function formatPrice(s: Pick<Service, 'price_cents' | 'price_status' | 'price_unit'>): string {
  if (s.price_status === 'on_enquiry' || s.price_cents === null) return 'Pricing on enquiry';
  const dollars = s.price_cents / 100;
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return `${amount}${s.price_unit ? ` ${s.price_unit}` : ''}`;
}

export interface PublicSiteData {
  services: Service[];
  kb: Record<string, KnowledgeItem>;
  contact: { email: string; phone: string; instagram_url: string; facebook_url: string; linkedin_url: string };
  hours: { text: string; confirmed: boolean };
  location: { text: string; address: string };
  /** True when at least one service can be booked online (set by the cached loader). */
  onlineBooking?: boolean;
}

/**
 * Everything the public website renders from the knowledge base.
 * Contact details are only exposed once the contact item is approved,
 * so nothing unconfirmed appears on the live site.
 */
export async function getPublicSiteData(): Promise<PublicSiteData> {
  const [services, items] = await Promise.all([listServices({ publicOnly: true }), listKnowledge({ publicOnly: true })]);
  const map = Object.fromEntries(items.map((i) => [i.key, i]));
  const contactItem = map['business.contact'];
  const c = (contactItem?.status === 'approved' ? contactItem.data : {}) as Record<string, string>;
  const hours = map['hours.opening'];
  const loc = map['business.location'];
  return {
    services,
    kb: map,
    contact: {
      email: c.email ?? '',
      phone: c.phone ?? '',
      instagram_url: c.instagram_url ?? '',
      facebook_url: c.facebook_url ?? '',
      linkedin_url: c.linkedin_url ?? '',
    },
    hours: {
      text: hours?.status === 'approved' ? hours.content : 'Sessions by appointment. Opening hours to be confirmed.',
      confirmed: hours?.status === 'approved',
    },
    location: {
      text: loc?.content ?? 'Melbourne, Victoria',
      address: (loc?.status === 'approved' && (loc.data as Record<string, string>).address) || '',
    },
  };
}

const STOP = new Set(
  'a an and are as at be can do does for from have how i if in is it me my of on or the to we what when where who why will with you your'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Lightweight keyword search over approved FAQs and policies. */
export function searchKnowledgeItems(items: KnowledgeItem[], query: string, limit = 3): KnowledgeItem[] {
  const q = tokenize(query);
  if (!q.length) return [];
  const scored = items
    .filter((k) => k.status === 'approved' && (k.category === 'faq' || k.category === 'policy' || k.category === 'business'))
    .map((k) => {
      const keywords = ((k.data as { keywords?: string[] }).keywords ?? []).map((s) => s.toLowerCase());
      const titleTokens = new Set(tokenize(k.title));
      const bodyTokens = new Set(tokenize(k.content));
      let score = 0;
      for (const w of q) {
        if (keywords.some((kw) => kw === w || (kw.includes(' ') && query.toLowerCase().includes(kw)))) score += 3;
        if (titleTokens.has(w)) score += 2;
        if (bodyTokens.has(w)) score += 0.5;
      }
      return { k, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.k);
}
