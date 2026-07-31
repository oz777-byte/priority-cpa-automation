/**
 * Privacy primitives for the click path.
 *
 * The rule the whole module exists to enforce: a raw IP address never reaches
 * storage, and no identifier survives long enough to link a visitor across
 * days. See 04_domain/tracking_and_attribution.md and compliance_israel.md.
 */

/**
 * Salt rotation is what makes the hash non-linkable. With a fixed salt, the
 * same IP produces the same hash forever and the "anonymised" column is a
 * stable personal identifier. Rotating daily bounds that to 24 hours.
 */
export function dailySalt(secret: string, isoDate: string): string {
  if (!secret) throw new Error('daily salt requires a secret');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`expected ISO date YYYY-MM-DD, got: ${isoDate}`);
  }
  return `${secret}:${isoDate}`;
}

/** UTC date of a timestamp. Injected everywhere so tests stay deterministic. */
export function utcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * SHA-256 over `ip + daily salt`, via Web Crypto so it runs unchanged in an
 * edge runtime. Returns null when no secret is configured — refusing to hash
 * is the safe failure, since a predictable hash of an IP is barely better
 * than the IP itself.
 */
export async function hashIp(
  ip: string | null | undefined,
  secret: string | undefined,
  epochMs: number,
): Promise<string | null> {
  if (!ip || !secret) return null;

  const data = new TextEncoder().encode(`${ip}${dailySalt(secret, utcDate(epochMs))}`);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Honours Do Not Track and Global Privacy Control. A click is still counted —
 * that is aggregate, not personal — but nothing that could tie two clicks to
 * the same person is stored.
 */
export function respectsDoNotTrack(headers: {
  dnt?: string | null;
  gpc?: string | null;
}): boolean {
  return headers.dnt === '1' || headers.gpc === '1';
}

/**
 * Client IP from the proxy chain. The leftmost entry in `x-forwarded-for` is
 * the client; everything after it is infrastructure.
 */
export function clientIp(headers: {
  forwardedFor?: string | null;
  realIp?: string | null;
}): string | null {
  const forwarded = headers.forwardedFor?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return headers.realIp?.trim() || null;
}

/**
 * Referrers are kept as a host only. A full referrer URL can carry a search
 * query or a path that identifies a person, and we have no use for either.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host || null;
  } catch {
    return null;
  }
}
