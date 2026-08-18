import "server-only";

type Bucket = { count: number; resetAt: number };

// Keep a map from growing without bound on a long-lived instance.
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimiter = (
  key: string,
  limit: number,
  windowMs: number,
) => RateLimitResult;

/**
 * In-memory fixed-window rate limiter.
 *
 * Scoped to one server instance, so on Vercel each lambda gets its own counter
 * and the effective limit is higher than the number passed in. That is
 * acceptable for a contact form — it stops naive floods and scripted abuse,
 * which is what it exists for. Swap in Upstash Redis if this ever needs to be
 * exact.
 *
 * Each limiter owns its bucket map, because the overflow behaviour below is
 * `clear()`: everything in the map goes. Sharing one map across unrelated
 * endpoints means anyone able to flood one of them with distinct keys can wipe
 * the counters protecting the others — a limiter that can be switched off by
 * the thing it limits. Give an endpoint whose keys are attacker-chosen (an
 * email, an account id) its own limiter.
 */
export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return function check(key: string, limit: number, windowMs: number): RateLimitResult {
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
  };
}

/** The shared limiter — the contact form, the staff login, payment endpoints. */
const shared = createRateLimiter();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return shared(key, limit, windowMs);
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
