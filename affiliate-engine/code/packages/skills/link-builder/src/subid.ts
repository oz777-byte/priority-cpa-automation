/**
 * SubID encoding — the load-bearing piece of the whole engine.
 *
 * A tracking link carries one string we fully control. If that string
 * survives the redirect and reappears in the network's commission report,
 * every payout can be traced back to the exact content asset and placement
 * that produced it. If it does not, the portfolio is flying blind.
 *
 * Canonical form: {asset}.{placement}.{campaign}.{variant}
 *
 * See 04_domain/tracking_and_attribution.md for the rationale.
 */

export interface SubIdParts {
  asset: string;
  placement: string;
  campaign?: string;
  variant?: string;
}

export type SubIdEncoding = 'plain' | 'sanitized' | 'hashed';

export interface EncodedSubId {
  /** Canonical, human-readable form. Always stored alongside the encoded one. */
  canonical: string;
  /** What actually goes on the wire, within the network's constraints. */
  encoded: string;
  encoding: SubIdEncoding;
  /**
   * Present only for `hashed`. Persist `{token -> canonical}` in `subid_map`,
   * otherwise the hash cannot be reversed at import time.
   */
  mapToken?: string;
}

export const SEGMENT_RE = /^[a-z0-9-]{1,40}$/;
export const CANONICAL_SEPARATOR = '.';

export class SubIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubIdError';
  }
}

/**
 * Normalises free text into a segment: lowercase, non-alphanumerics folded to
 * hyphens, collapsed and trimmed. Throws rather than returning an empty
 * segment — a silently empty asset slug would merge unrelated assets.
 */
export function toSegment(value: string, field = 'segment'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');

  if (slug.length === 0) {
    throw new SubIdError(`${field} normalised to an empty segment: ${JSON.stringify(value)}`);
  }
  return slug;
}

export function buildCanonicalSubId(parts: SubIdParts): string {
  const asset = requireSegment(parts.asset, 'asset');
  const placement = requireSegment(parts.placement, 'placement');
  const campaign = parts.campaign ? requireSegment(parts.campaign, 'campaign') : '';
  const variant = parts.variant ? requireSegment(parts.variant, 'variant') : '';

  if (variant && !campaign) {
    // Position carries meaning, so an empty middle segment is kept rather
    // than dropped — otherwise variant would be parsed back as campaign.
    return [asset, placement, '', variant].join(CANONICAL_SEPARATOR);
  }
  return [asset, placement, campaign, variant]
    .filter((segment, index) => index < 2 || segment !== '')
    .join(CANONICAL_SEPARATOR);
}

/**
 * Parses a SubID seen in a network report back into its parts. Tolerates the
 * separator substitutions applied by `sanitized` encoding, because reports do
 * not tell us which encoding was used.
 */
export function parseSubId(raw: string, separators: string[] = ['.', '_', '~']): SubIdParts {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new SubIdError('empty subid');

  const separator = separators.find((candidate) => trimmed.includes(candidate));
  const segments = separator ? trimmed.split(separator) : [trimmed];

  const asset = segments[0] ?? '';
  const placement = segments[1] ?? '';
  if (!SEGMENT_RE.test(asset)) {
    throw new SubIdError(`unparsable subid, bad asset segment: ${JSON.stringify(raw)}`);
  }
  if (!SEGMENT_RE.test(placement)) {
    throw new SubIdError(`unparsable subid, bad placement segment: ${JSON.stringify(raw)}`);
  }

  const parts: SubIdParts = { asset, placement };
  const campaign = segments[2];
  const variant = segments[3];
  if (campaign) parts.campaign = campaign;
  if (variant) parts.variant = variant;
  return parts;
}

/**
 * True when the string is one of our hash tokens rather than a canonical
 * SubID. The `hx` prefix and fixed width keep real asset slugs from being
 * mistaken for tokens.
 */
export function isHashedToken(raw: string): boolean {
  return HASH_TOKEN_RE.test(raw.trim());
}

export const HASH_TOKEN_RE = /^hx[0-9a-z]{14}$/;

/**
 * FNV-1a (32-bit) — small, dependency-free, and deterministic across runs and
 * machines. Not a security primitive; it only needs to avoid collisions
 * across a portfolio of at most a few thousand SubIDs.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic short token for a SubID that will not fit a network's field.
 *
 * Truncating instead would be far worse: two long asset slugs sharing a
 * prefix would collapse into the same SubID and quietly merge their revenue.
 */
export function hashToken(canonical: string): string {
  // Two independent 32-bit rounds give ~64 bits, which keeps collision risk
  // negligible at portfolio scale while staying short enough for every network.
  // Zero-padded to a fixed width so `isHashedToken` can recognise the format.
  const a = fnv1a32(canonical).toString(36).padStart(7, '0');
  const b = fnv1a32(`${canonical}#salt`).toString(36).padStart(7, '0');
  return `hx${a}${b}`;
}

/** Shortest field length that can hold a hash token. */
export const HASH_TOKEN_LENGTH = 16;

function requireSegment(value: string, field: string): string {
  const segment = toSegment(value, field);
  if (!SEGMENT_RE.test(segment)) {
    throw new SubIdError(`${field} is not a valid segment: ${JSON.stringify(value)}`);
  }
  return segment;
}
