import type { NetworkProfile } from './networks.ts';
import { getNetworkProfile } from './networks.ts';
import type { EncodedSubId, SubIdParts } from './subid.ts';
import {
  CANONICAL_SEPARATOR,
  HASH_TOKEN_LENGTH,
  SubIdError,
  buildCanonicalSubId,
  hashToken,
  isHashedToken,
  parseSubId,
} from './subid.ts';

export interface TrackingLinkInput {
  /** Destination the network expects us to send traffic to. */
  destinationUrl: string;
  networkSlug: string;
  parts: SubIdParts;
  /**
   * Optional template with `{subid}` and `{destination}` placeholders, for
   * networks whose tracking URL is not a simple query parameter.
   */
  template?: string | null;
  /** Extra query parameters to merge into the destination. */
  extraParams?: Record<string, string>;
  profileOverride?: Partial<NetworkProfile>;
}

export interface TrackingLink {
  url: string;
  subId: EncodedSubId;
  profile: NetworkProfile;
}

/**
 * Encodes a canonical SubID within one network's constraints.
 *
 * Order of preference: send it verbatim, then substitute the separator, and
 * only then fall back to a deterministic hash token. Truncation is never an
 * option — two assets sharing a prefix would collapse into one SubID and
 * quietly merge their revenue.
 */
export function encodeSubId(parts: SubIdParts, profile: NetworkProfile): EncodedSubId {
  const canonical = buildCanonicalSubId(parts);

  if (profile.maxLength < HASH_TOKEN_LENGTH) {
    throw new SubIdError(
      `network ${profile.slug} allows only ${profile.maxLength} chars, which cannot hold a ${HASH_TOKEN_LENGTH}-char fallback token`,
    );
  }

  if (profile.allowsDot && canonical.length <= profile.maxLength) {
    return { canonical, encoded: canonical, encoding: 'plain' };
  }

  const sanitized = canonical.split(CANONICAL_SEPARATOR).join(profile.fallbackSeparator);
  if (sanitized.length <= profile.maxLength) {
    return { canonical, encoded: sanitized, encoding: 'sanitized' };
  }

  const token = hashToken(canonical);
  return { canonical, encoded: token, encoding: 'hashed', mapToken: token };
}

export function buildTrackingLink(input: TrackingLinkInput): TrackingLink {
  const profile = { ...getNetworkProfile(input.networkSlug), ...input.profileOverride };
  const subId = encodeSubId(input.parts, profile);

  const url = input.template
    ? applyTemplate(input.template, subId.encoded, input.destinationUrl)
    : appendParams(input.destinationUrl, {
        [profile.subIdParam]: subId.encoded,
        ...input.extraParams,
      });

  return { url, subId, profile };
}

function applyTemplate(template: string, subid: string, destination: string): string {
  const url = template
    .replaceAll('{subid}', encodeURIComponent(subid))
    .replaceAll('{destination}', encodeURIComponent(destination));

  if (url.includes('{')) {
    throw new SubIdError(`tracking template has unresolved placeholders: ${url}`);
  }
  return url;
}

function appendParams(base: string, params: Record<string, string>): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new SubIdError(`destinationUrl is not an absolute URL: ${base}`);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export type ResolveFailureReason = 'missing_subid' | 'unparsable' | 'unknown_token';

export interface ResolvedSubId {
  ok: boolean;
  parts?: SubIdParts;
  canonical?: string;
  reason?: ResolveFailureReason;
  detail?: string;
}

/**
 * Reverses the encoding at import time. `lookupToken` reads the `subid_map`
 * table; a token with no mapping is reported rather than dropped, because a
 * growing count of unresolved SubIDs is the earliest signal that tracking has
 * broken somewhere upstream.
 */
export function resolveSubId(
  raw: string | null | undefined,
  profile: NetworkProfile,
  lookupToken?: (token: string) => string | undefined,
): ResolvedSubId {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: 'missing_subid' };
  }

  const value = raw.trim();

  if (isHashedToken(value)) {
    const canonical = lookupToken?.(value);
    if (!canonical) {
      return { ok: false, reason: 'unknown_token', detail: value };
    }
    return { ok: true, canonical, parts: parseSubId(canonical) };
  }

  try {
    const parts = parseSubId(value, profile.parseSeparators);
    return { ok: true, canonical: buildCanonicalSubId(parts), parts };
  } catch (err) {
    return {
      ok: false,
      reason: 'unparsable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
