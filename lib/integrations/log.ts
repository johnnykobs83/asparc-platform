import { db } from '../db';
import type { IntegrationLog } from '../db/types';

/** Records every external call (success, error or skipped) – never secrets or full payloads. */
export async function logIntegration(entry: Omit<IntegrationLog, 'id' | 'created_at' | 'detail' | 'entity_type' | 'entity_id' | 'error'> &
  Partial<Pick<IntegrationLog, 'detail' | 'entity_type' | 'entity_id' | 'error'>>) {
  try {
    await db().insert('integration_logs', {
      detail: {},
      entity_type: null,
      entity_id: null,
      ...entry,
      error: entry.error ? entry.error.slice(0, 1000) : null,
    });
  } catch (e) {
    // Logging must never break the user-facing flow.
    console.error('[integration-log] failed', e);
  }
}

/** fetch with a timeout – external APIs must never hang a request. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 10_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
