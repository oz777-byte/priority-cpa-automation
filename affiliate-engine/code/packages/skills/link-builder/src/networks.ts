/**
 * Per-network SubID constraints.
 *
 * These values are conservative defaults, not documented guarantees — most
 * networks never publish their field limits. Every profile must be confirmed
 * with a live end-to-end test before the offer is activated, which is what
 * `trackingVerified` on the offer records.
 */

export interface NetworkProfile {
  slug: string;
  displayName: string;
  /** Query parameter that carries our SubID. */
  subIdParam: string;
  maxLength: number;
  /** Some networks silently drop or truncate at a dot. */
  allowsDot: boolean;
  /** Separator to substitute when dots are unsafe. */
  fallbackSeparator: string;
  /** Separators to try when parsing a SubID back out of a report. */
  parseSeparators: string[];
  notes?: string;
}

export const NETWORK_PROFILES: Readonly<Record<string, NetworkProfile>> = {
  impact: {
    slug: 'impact',
    displayName: 'Impact.com',
    subIdParam: 'subId1',
    maxLength: 100,
    allowsDot: true,
    fallbackSeparator: '_',
    parseSeparators: ['.', '_'],
    notes: 'subId1..subId3 available; we use subId1 for the full canonical string.',
  },
  partnerstack: {
    slug: 'partnerstack',
    displayName: 'PartnerStack',
    subIdParam: 'ps_xid',
    maxLength: 80,
    allowsDot: false,
    fallbackSeparator: '_',
    parseSeparators: ['_', '.'],
    notes: 'Dots have been observed being trimmed; underscore separator is safer.',
  },
  cj: {
    slug: 'cj',
    displayName: 'CJ Affiliate',
    subIdParam: 'sid',
    maxLength: 64,
    allowsDot: false,
    fallbackSeparator: '_',
    parseSeparators: ['_', '.'],
  },
  awin: {
    slug: 'awin',
    displayName: 'Awin',
    subIdParam: 'clickref',
    maxLength: 50,
    allowsDot: false,
    fallbackSeparator: '_',
    parseSeparators: ['_', '.'],
    notes: 'Shortest common limit — long asset slugs will hash here.',
  },
  shareasale: {
    slug: 'shareasale',
    displayName: 'ShareASale',
    subIdParam: 'afftrack',
    maxLength: 100,
    allowsDot: false,
    fallbackSeparator: '_',
    parseSeparators: ['_', '.'],
  },
  amazon: {
    slug: 'amazon',
    displayName: 'Amazon Associates',
    subIdParam: 'ascsubtag',
    maxLength: 100,
    allowsDot: true,
    fallbackSeparator: '_',
    parseSeparators: ['.', '_'],
  },
  direct: {
    slug: 'direct',
    displayName: 'Direct advertiser agreement',
    subIdParam: 'ref',
    maxLength: 120,
    allowsDot: true,
    fallbackSeparator: '-',
    parseSeparators: ['.', '-', '_'],
    notes: 'Terms are negotiated per advertiser; override this profile as needed.',
  },
};

export const DEFAULT_PROFILE: NetworkProfile = {
  slug: 'unknown',
  displayName: 'Unknown network',
  subIdParam: 'subid',
  // Assume the tightest common limit until a live test proves otherwise.
  maxLength: 50,
  allowsDot: false,
  fallbackSeparator: '_',
  parseSeparators: ['.', '_', '-'],
  notes: 'Conservative fallback. Replace with a verified profile before going live.',
};

export function getNetworkProfile(slug: string): NetworkProfile {
  return NETWORK_PROFILES[slug.toLowerCase()] ?? { ...DEFAULT_PROFILE, slug };
}
