import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, HAS_UPDATED_AT, type ListOptions, type Repo, type Row } from './repo';
import type { TableName } from './types';

type Store = { [K in TableName]?: Row<K>[] };

/**
 * Development/test store. Keeps everything in memory and (unless the path
 * is ":memory:") persists to a JSON file after each write.
 * Refused in production – see lib/db/index.ts.
 */
export class LocalRepo implements Repo {
  readonly kind = 'local' as const;
  private data: Store = {};
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    if (this.filePath === ':memory:') return;
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Store;
    } catch {
      this.data = {};
    }
  }

  private persist() {
    if (this.filePath === ':memory:') return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.filePath);
  }

  private rows<T extends TableName>(table: T): Row<T>[] {
    this.load();
    if (!this.data[table]) (this.data as Record<string, unknown[]>)[table] = [];
    return this.data[table] as Row<T>[];
  }

  private matches<T extends TableName>(row: Row<T>, opts: Omit<ListOptions<T>, 'limit' | 'orderBy'> = {}) {
    const r = row as unknown as Record<string, unknown>;
    if (opts.eq) {
      for (const [k, v] of Object.entries(opts.eq)) {
        const cell = r[k];
        if (typeof v === 'string' && typeof cell === 'string' && k === 'email') {
          if (cell.toLowerCase() !== v.toLowerCase()) return false;
        } else if (cell !== v) return false;
      }
    }
    const created = r.created_at as string | undefined;
    if (opts.since && created && created < opts.since) return false;
    if (opts.until && created && created >= opts.until) return false;
    return true;
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>> {
    const now = new Date().toISOString();
    const full = {
      ...(DEFAULTS[table] ?? {}),
      id: randomUUID(),
      created_at: now,
      ...(HAS_UPDATED_AT.has(table) ? { updated_at: now } : {}),
      ...row,
    } as Row<T>;
    this.rows(table).push(structuredClone(full));
    this.persist();
    return structuredClone(full);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T> | null> {
    const rows = this.rows(table);
    const i = rows.findIndex((r) => (r as { id: string }).id === id);
    if (i < 0) return null;
    rows[i] = {
      ...rows[i],
      ...patch,
      ...(HAS_UPDATED_AT.has(table) ? { updated_at: new Date().toISOString() } : {}),
    } as Row<T>;
    this.persist();
    return structuredClone(rows[i]);
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const r = this.rows(table).find((x) => (x as { id: string }).id === id);
    return r ? structuredClone(r) : null;
  }

  async findOne<T extends TableName>(table: T, eq: ListOptions<T>['eq']): Promise<Row<T> | null> {
    const r = this.rows(table).find((x) => this.matches(x, { eq }));
    return r ? structuredClone(r) : null;
  }

  async list<T extends TableName>(table: T, opts: ListOptions<T> = {}): Promise<Row<T>[]> {
    const key = (opts.orderBy as string) ?? 'created_at';
    const asc = opts.ascending ?? false;
    const out = this.rows(table)
      .filter((r) => this.matches(r, opts))
      .sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[key] as string | number;
        const bv = (b as unknown as Record<string, unknown>)[key] as string | number;
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    return structuredClone(opts.limit ? out.slice(0, opts.limit) : out);
  }

  async count<T extends TableName>(table: T, opts: Omit<ListOptions<T>, 'limit' | 'orderBy'> = {}) {
    return this.rows(table).filter((r) => this.matches(r, opts)).length;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const rows = this.rows(table);
    const i = rows.findIndex((r) => (r as { id: string }).id === id);
    if (i >= 0) rows.splice(i, 1);
    this.persist();
  }

  /** Test helper */
  reset() {
    this.data = {};
    this.loaded = true;
  }
}
