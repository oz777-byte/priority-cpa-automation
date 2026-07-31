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
  /**
   * Whether these values were confirmed against a live link and a real report,
   * rather than inferred. Every profile ships false: nothing here is trustworthy
   * until a SubID has been watched making the full round trip.
   */
  verified: boolean;
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
    verified: false,
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
    verified: false,
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
    verified: false,
    parseSeparators: ['_', '.'],
  },
  awin: {
    slug: 'awin',
    displayName: 'Awin',
    subIdParam: 'clickref',
    maxLength: 50,
    allowsDot: false,
    fallbackSeparator: '_',
    verified: false,
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
    verified: false,
    parseSeparators: ['_', '.'],
  },
  amazon: {
    slug: 'amazon',
    displayName: 'Amazon Associates',
    subIdParam: 'ascsubtag',
    maxLength: 100,
    allowsDot: true,
    fallbackSeparator: '_',
    verified: false,
    parseSeparators: ['.', '_'],
  },
  aliexpress: {
    slug: 'aliexpress',
    displayName: 'AliExpress Affiliate (Portals)',
    // Placeholder. Generate one real link in the affiliate portal, read the
    // sub-id parameter off it, and correct this before the first live click —
    // a wrong parameter name means every click is untraceable.
    subIdParam: 'aff_sub1',
    maxLength: 50,
    allowsDot: false,
    fallbackSeparator: '_',
    verified: false,
    parseSeparators: ['_', '.'],
    notes:
      'Marketplace programme: commission is a few percent of a low-value order and the ' +
      'attribution window is measured in days. Suitable for proving the pipeline, not ' +
      'for carrying a portfolio. Confirm the sub-id parameter and window against a live link.',
  },
  direct: {
    slug: 'direct',
    displayName: 'Direct advertiser agreement',
    subIdParam: 'ref',
    maxLength: 120,
    allowsDot: true,
    fallbackSeparator: '-',
    verified: false,
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
  verified: false,
  parseSeparators: ['.', '_', '-'],
  notes: 'Conservative fallback. Replace with a verified profile before going live.',
};

export function getNetworkProfile(slug: string): NetworkProfile {
  return NETWORK_PROFILES[slug.toLowerCase()] ?? { ...DEFAULT_PROFILE, slug };
}

export class UnverifiedProfileError extends Error {
  constructor(slug: string) {
    super(
      `network profile "${slug}" has not been verified against a live link. ` +
        'Build a test link, click it, and confirm the SubID appears in the report ' +
        'before sending real traffic through it.',
    );
    this.name = 'UnverifiedProfileError';
  }
}

/**
 * Gate for going live. Building and clicking a test link is exactly how a
 * profile gets verified, so link construction itself stays unguarded — this
 * is the check to run before an offer starts carrying real traffic.
 */
export function assertProfileVerified(profile: NetworkProfile): void {
  if (!profile.verified) throw new UnverifiedProfileError(profile.slug);
}
