import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SupabaseRepo } from '../lib/db/supabase';

function fakeFetch(handler: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const f = (async (u: string, init: RequestInit = {}) => {
    const url = new URL(u);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}

describe('SupabaseRepo (PostgREST adapter)', () => {
  it('inserts with service-role auth and return=representation', async () => {
    const { f, calls } = fakeFetch(() => new Response(JSON.stringify([{ id: 'x', full_name: 'A' }]), { status: 201 }));
    const repo = new SupabaseRepo('https://proj.supabase.co', 'service-key', f);
    const row = await repo.insert('customers', { full_name: 'A' });
    assert.equal(row.id, 'x');
    const { url, init } = calls[0];
    assert.equal(url.pathname, '/rest/v1/customers');
    assert.equal(init.method, 'POST');
    const h = init.headers as Record<string, string>;
    assert.equal(h.apikey, 'service-key');
    assert.equal(h.Authorization, 'Bearer service-key');
    assert.equal(h.Prefer, 'return=representation');
  });

  it('builds parameterised filters, ordering, ranges and limits', async () => {
    const { f, calls } = fakeFetch(() => new Response('[]'));
    const repo = new SupabaseRepo('https://proj.supabase.co', 'k', f);
    await repo.list('leads', { eq: { stage: 'new_enquiry', assigned_to: null }, since: '2026-11-01T00:00:00Z', until: '2026-11-02T00:00:00Z', orderBy: 'created_at', ascending: true, limit: 5 });
    const q = calls[0].url.searchParams;
    assert.equal(q.get('stage'), 'eq.new_enquiry');
    assert.equal(q.get('assigned_to'), 'is.null');
    assert.deepEqual(q.getAll('created_at'), ['gte.2026-11-01T00:00:00Z', 'lt.2026-11-02T00:00:00Z']);
    assert.equal(q.get('order'), 'created_at.asc.nullslast');
    assert.equal(q.get('limit'), '5');
  });

  it('email lookups are case-insensitive and wildcard-safe', async () => {
    const { f, calls } = fakeFetch(() => new Response('[]'));
    await new SupabaseRepo('https://p.supabase.co', 'k', f).findOne('customers', { email: 'Sam_O%Neil@Example.com' });
    assert.equal(calls[0].url.searchParams.get('email'), 'ilike.SamONeil@Example.com');
  });

  it('reads exact counts from Content-Range', async () => {
    const { f } = fakeFetch(() => new Response('[]', { headers: { 'content-range': '0-0/42' } }));
    assert.equal(await new SupabaseRepo('https://p.supabase.co', 'k', f).count('leads'), 42);
  });

  it('surfaces PostgREST errors without leaking the key', async () => {
    const { f } = fakeFetch(() => new Response('{"message":"new row violates row-level security"}', { status: 403 }));
    await assert.rejects(new SupabaseRepo('https://p.supabase.co', 'secret-key', f).insert('leads', {}), (e: Error) => /403/.test(e.message) && !e.message.includes('secret-key'));
  });

  it('update targets a single id', async () => {
    const { f, calls } = fakeFetch(() => new Response('[{"id":"1"}]'));
    await new SupabaseRepo('https://p.supabase.co', 'k', f).update('leads', '1', { stage: 'contacted' });
    assert.equal(calls[0].init.method, 'PATCH');
    assert.equal(calls[0].url.searchParams.get('id'), 'eq.1');
  });
});
