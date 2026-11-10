'use client';

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/login')) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new ApiError(401, 'Please sign in.');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; fields?: Record<string, string> };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.fields);
  return body;
}

/** Tiny data hook: { data, error, loading, reload } */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function getParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function setParam(name: string, value: string | null) {
  const u = new URL(window.location.href);
  if (value) u.searchParams.set(name, value);
  else u.searchParams.delete(name);
  window.history.replaceState(null, '', u.toString());
}

export const fmtDate = (iso: string | null | undefined, withTime = true) =>
  iso
    ? new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        day: 'numeric',
        month: 'short',
        ...(withTime ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }),
      }).format(new Date(iso))
    : '–';

export const fmtMoney = (cents: number | null | undefined) =>
  cents == null ? '–' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '–');
