import type { IncomingHttpHeaders } from 'http';

interface Bucket {
  tokens: number;
  at: number;
}

/**
 * Token bucket per key: up to `capacity` requests at once, refilled at
 * `perSecond`. In memory — fine for a single server instance.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private calls = 0;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {}

  /** Spends one token; false when the key is over the limit. */
  take(key: string, now = Date.now()): boolean {
    if (++this.calls % 1000 === 0) this.sweep(now);

    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond,
    );
    bucket.at = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  /** Forgets keys that have refilled completely — they'd start full anyway. */
  private sweep(now: number) {
    const refillMs = (this.capacity / this.perSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at >= refillMs) this.buckets.delete(key);
    }
  }
}

/**
 * Client IP behind a proxy (Railway): the proxy appends the address it saw
 * as the last X-Forwarded-For entry; earlier entries come from the client
 * and can be forged.
 */
export const clientIp = (
  headers: IncomingHttpHeaders,
  fallback: string | undefined,
): string => {
  const forwarded = headers['x-forwarded-for'];
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)
    ?.split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  return list?.at(-1) ?? fallback ?? 'unknown';
};

export const RATE_LIMIT_MESSAGE = 'Слишком много запросов — подождите немного';
