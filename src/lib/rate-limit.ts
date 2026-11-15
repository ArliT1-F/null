/**
 * In-process rate limiter.
 *
 * A single-process, fixed-window limiter is the right size for this deployment:
 * one Node process on a home server, no Redis. It is intentionally swappable —
 * if the app later scales horizontally, `consume()` is the only function that
 * needs a shared-store implementation.
 *
 * Windows are small and maps are swept, so memory stays bounded.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function reset(key: string) {
  buckets.delete(key);
}

/** Common policies, expressed once so every caller behaves the same. */
export const LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  upload: { limit: 30, windowMs: 60 * 60_000 },
  publish: { limit: 30, windowMs: 60 * 60_000 },
  usernameCheck: { limit: 60, windowMs: 60_000 },
  report: { limit: 10, windowMs: 60 * 60_000 },
  publicProfile: { limit: 300, windowMs: 60_000 },
} as const;
