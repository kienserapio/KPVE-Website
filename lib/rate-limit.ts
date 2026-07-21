import "server-only";

type Bucket = { count: number; resetAt: number };

/**
 * In-memory fixed-window rate limiter.
 *
 * Scoped to one server instance, so on Vercel each lambda gets its own counter
 * and the effective limit is higher than the number here. That is acceptable
 * for a contact form — it stops naive floods and scripted abuse, which is what
 * it exists for. Swap in Upstash Redis if this ever needs to be exact.
 */
const buckets = new Map<string, Bucket>();

// Keep the map from growing without bound on a long-lived instance.
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
    // Still oversized after pruning expired entries — drop everything rather
    // than leak memory. Worst case a few requests get a fresh window.
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controllable in general, but on Vercel the
 * platform overwrites it at the edge, so the leftmost entry is trustworthy
 * here. Falls back to a constant, which degrades to a global limit rather
 * than to no limit.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
