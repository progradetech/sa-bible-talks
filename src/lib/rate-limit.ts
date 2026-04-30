interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
  remaining?: number;
}

export function check(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refilled = Math.floor((elapsed / windowMs) * limit);
  if (refilled > 0) {
    bucket.tokens = Math.min(limit, bucket.tokens + refilled);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return { ok: true, remaining: bucket.tokens };
  }

  return { ok: false, retryAfterMs: windowMs - elapsed };
}

export function reset(key: string): void {
  buckets.delete(key);
}

export function clear(): void {
  buckets.clear();
}
