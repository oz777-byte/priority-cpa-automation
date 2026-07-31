/**
 * Best-effort rate limiting for the redirect endpoint.
 *
 * The store is injectable so the same logic can run against an in-memory Map
 * at an edge node or a shared store later. With per-instance memory the limit
 * is approximate — an attacker spread across regions gets a higher effective
 * ceiling — and that is an accepted trade: this exists to stop one script from
 * flooding the click table, not to be a security boundary.
 */

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
}

export interface RateLimitEntry {
  count: number;
  /** Epoch ms at which the current window ends. */
  resetAt: number;
}

export interface RateLimitRules {
  limit: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitRules = {
  limit: 30,
  windowMs: 60_000,
};

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** Seconds to wait, for a Retry-After header. */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  store: RateLimitStore,
  now: number,
  rules: RateLimitRules = DEFAULT_RATE_LIMIT,
): RateLimitVerdict {
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    const entry = { count: 1, resetAt: now + rules.windowMs };
    store.set(key, entry);
    return {
      allowed: true,
      remaining: rules.limit - 1,
      resetAt: entry.resetAt,
      retryAfterSeconds: 0,
    };
  }

  const count = existing.count + 1;
  store.set(key, { count, resetAt: existing.resetAt });

  const allowed = count <= rules.limit;
  return {
    allowed,
    remaining: Math.max(0, rules.limit - count),
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * In-memory store with a size cap.
 *
 * Without the cap an edge instance that stays warm accumulates one entry per
 * distinct key until it runs out of memory — a slow leak that only shows up
 * under the traffic you actually wanted.
 */
export function createMemoryStore(maxEntries = 10_000): RateLimitStore {
  const map = new Map<string, RateLimitEntry>();

  return {
    get: (key) => map.get(key),
    set: (key, entry) => {
      if (map.size >= maxEntries && !map.has(key)) {
        // Map preserves insertion order, so the first key is the oldest.
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, entry);
    },
  };
}
