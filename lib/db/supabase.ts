import type { ListOptions, Repo, Row } from './repo';
import type { TableName } from './types';

/**
 * Supabase adapter using PostgREST directly over fetch (no SDK dependency).
 * Uses the SERVICE ROLE key, so it must only ever run server-side.
 * Every query is parameterised through URLSearchParams – no string SQL.
 */
export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private encodeValue(v: string | number | boolean | null): string {
    if (v === null) return 'is.null';
    return `eq.${String(v)}`;
  }

  private query<T extends TableName>(opts: ListOptions<T> = {}) {
    const q = new URLSearchParams();
    q.set('select', '*');
    for (const [k, v] of Object.entries(opts.eq ?? {})) {
      if (k === 'email' && typeof v === 'string') q.append(k, `ilike.${v.replace(/[%_*]/g, '')}`);
      else q.append(k, this.encodeValue(v as string | number | boolean | null));
    }
    if (opts.since) q.append('created_at', `gte.${opts.since}`);
    if (opts.until) q.append('created_at', `lt.${opts.until}`);
    if (opts.orderBy) q.set('order', `${String(opts.orderBy)}.${opts.ascending ? 'asc' : 'desc'}.nullslast`);
    else q.set('order', 'created_at.desc');
    if (opts.limit) q.set('limit', String(opts.limit));
    return q;
  }

  private async request<R>(method: string, pathAndQuery: string, body?: unknown, extra?: Record<string, string>): Promise<R> {
    const res = await this.fetchImpl(`${this.url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: this.headers(extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as R;
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>> {
    const out = await this.request<Row<T>[]>('POST', table, row, { Prefer: 'return=representation' });
    return out[0];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T> | null> {
    const q = new URLSearchParams({ id: `eq.${id}` });
    const out = await this.request<Row<T>[]>('PATCH', `${table}?${q}`, patch, { Prefer: 'return=representation' });
    return out[0] ?? null;
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const q = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
    const out = await this.request<Row<T>[]>('GET', `${table}?${q}`);
    return out[0] ?? null;
  }

  async findOne<T extends TableName>(table: T, eq: ListOptions<T>['eq']): Promise<Row<T> | null> {
    const q = this.query<T>({ eq, limit: 1 });
    const out = await this.request<Row<T>[]>('GET', `${table}?${q}`);
    return out[0] ?? null;
  }

  async list<T extends TableName>(table: T, opts: ListOptions<T> = {}): Promise<Row<T>[]> {
    const q = this.query(opts);
    if (!opts.limit) q.set('limit', '1000');
    return this.request<Row<T>[]>('GET', `${table}?${q}`);
  }

  async count<T extends TableName>(table: T, opts: Omit<ListOptions<T>, 'limit' | 'orderBy'> = {}): Promise<number> {
    const q = this.query(opts);
    q.set('select', 'id');
    q.delete('order');
    q.set('limit', '1');
    const res = await this.fetchImpl(`${this.url}/rest/v1/${table}?${q}`, {
      method: 'GET',
      headers: this.headers({ Prefer: 'count=exact' }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Supabase count ${table} failed (${res.status})`);
    const range = res.headers.get('content-range') ?? '*/0';
    return Number(range.split('/')[1] ?? 0) || 0;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const q = new URLSearchParams({ id: `eq.${id}` });
    await this.request('DELETE', `${table}?${q}`);
  }
}
