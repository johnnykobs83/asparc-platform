/**
 * Fixed-window in-memory rate limiter. Effective per server instance – good
 * protection for a small site. For multi-region scale, swap for Upstash
 * Redis (free tier) behind the same function signature.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
