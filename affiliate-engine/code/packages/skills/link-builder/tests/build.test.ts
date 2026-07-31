import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  NETWORK_PROFILES,
  SubIdError,
  UnverifiedProfileError,
  assertProfileVerified,
  buildTrackingLink,
  encodeSubId,
  getNetworkProfile,
  hashToken,
  resolveSubId,
} from '../src/index';

const shortParts = { asset: 'guide', placement: 'hero-cta' };

describe('getNetworkProfile', () => {
  it('returns a known profile', () => {
    expect(getNetworkProfile('impact').subIdParam).toBe('subId1');
    expect(getNetworkProfile('IMPACT').subIdParam).toBe('subId1');
  });

  it('falls back to the conservative profile for an unknown network', () => {
    const profile = getNetworkProfile('some-new-network');
    expect(profile.maxLength).toBe(DEFAULT_PROFILE.maxLength);
    expect(profile.slug).toBe('some-new-network');
  });

  it('ships every profile unverified, because none has made a live round trip', () => {
    expect(Object.values(NETWORK_PROFILES).every((p) => !p.verified)).toBe(true);
    expect(DEFAULT_PROFILE.verified).toBe(false);
  });
});

describe('assertProfileVerified', () => {
  it('blocks live traffic on an unverified profile', () => {
    expect(() => assertProfileVerified(getNetworkProfile('aliexpress'))).toThrow(
      UnverifiedProfileError,
    );
    expect(() => assertProfileVerified(getNetworkProfile('aliexpress'))).toThrow(
      /confirm the SubID appears in the report/,
    );
  });

  it('passes once a profile has been confirmed against a live link', () => {
    expect(() =>
      assertProfileVerified({ ...getNetworkProfile('aliexpress'), verified: true }),
    ).not.toThrow();
  });

  it('does not block building the test link that does the verifying', () => {
    // Clicking a built link is how a profile earns `verified`, so link
    // construction itself must stay unguarded.
    expect(() =>
      buildTrackingLink({
        destinationUrl: 'https://marketplace.example/item/123',
        networkSlug: 'aliexpress',
        parts: shortParts,
      }),
    ).not.toThrow();
  });
});

describe('aliexpress profile', () => {
  it('sanitises dots away, since the field is short and dot-averse', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://marketplace.example/item/123',
      networkSlug: 'aliexpress',
      parts: { asset: 'usb-c-hubs', placement: 'table-row-1' },
    });
    const sent = new URL(link.url).searchParams.get(link.profile.subIdParam);
    expect(sent).toBe('usb-c-hubs_table-row-1');
    expect(link.subId.encoding).toBe('sanitized');
  });

  it('hashes a long subid rather than truncating it into a 50-char field', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://marketplace.example/item/123',
      networkSlug: 'aliexpress',
      parts: {
        asset: 'best-usb-c-hubs-for-macbook-2026',
        placement: 'comparison-table-row-four',
        campaign: 'organic',
      },
    });
    expect(link.subId.encoding).toBe('hashed');
    const sent = new URL(link.url).searchParams.get(link.profile.subIdParam)!;
    expect(resolveSubId(sent, link.profile, () => link.subId.canonical).parts?.asset).toBe(
      'best-usb-c-hubs-for-macbook-2026',
    );
  });
});

describe('encodeSubId', () => {
  it('sends the canonical form when the network allows dots', () => {
    const encoded = encodeSubId(shortParts, getNetworkProfile('impact'));
    expect(encoded.encoding).toBe('plain');
    expect(encoded.encoded).toBe('guide.hero-cta');
  });

  it('substitutes the separator when dots are unsafe', () => {
    const encoded = encodeSubId(shortParts, getNetworkProfile('partnerstack'));
    expect(encoded.encoding).toBe('sanitized');
    expect(encoded.encoded).toBe('guide_hero-cta');
    expect(encoded.canonical).toBe('guide.hero-cta');
  });

  it('hashes rather than truncates when the subid will not fit', () => {
    const encoded = encodeSubId(
      {
        asset: 'israeli-accounting-software-comparison',
        placement: 'comparison-table-row-two',
        campaign: 'newsletter-april',
      },
      getNetworkProfile('awin'), // 50-char field
    );
    expect(encoded.encoding).toBe('hashed');
    expect(encoded.encoded).toHaveLength(16);
    expect(encoded.mapToken).toBe(encoded.encoded);
    expect(encoded.canonical).toContain('israeli-accounting-software-comparison');
  });

  it('refuses a network whose field cannot even hold the fallback token', () => {
    expect(() =>
      encodeSubId(shortParts, { ...getNetworkProfile('awin'), maxLength: 8 }),
    ).toThrow(/cannot hold a 16-char fallback token/);
  });
});

describe('buildTrackingLink', () => {
  it('appends the subid on the network parameter', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://advertiser.example/pricing',
      networkSlug: 'impact',
      parts: shortParts,
    });
    const url = new URL(link.url);
    expect(url.searchParams.get('subId1')).toBe('guide.hero-cta');
    expect(url.pathname).toBe('/pricing');
  });

  it('preserves query parameters already on the destination', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://advertiser.example/pricing?plan=pro',
      networkSlug: 'impact',
      parts: shortParts,
    });
    const url = new URL(link.url);
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('subId1')).toBe('guide.hero-cta');
  });

  it('merges extra parameters', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://advertiser.example/',
      networkSlug: 'impact',
      parts: shortParts,
      extraParams: { utm_source: 'ledger-guide' },
    });
    expect(new URL(link.url).searchParams.get('utm_source')).toBe('ledger-guide');
  });

  it('fills a tracking template', () => {
    const link = buildTrackingLink({
      destinationUrl: 'https://advertiser.example/pricing',
      networkSlug: 'cj',
      parts: shortParts,
      template: 'https://track.example/click?pid=99&sid={subid}&url={destination}',
    });
    expect(link.url).toContain('sid=guide_hero-cta');
    expect(link.url).toContain('url=https%3A%2F%2Fadvertiser.example%2Fpricing');
  });

  it('throws on a template with unresolved placeholders', () => {
    expect(() =>
      buildTrackingLink({
        destinationUrl: 'https://advertiser.example/',
        networkSlug: 'cj',
        parts: shortParts,
        template: 'https://track.example/click?pid={pid}&sid={subid}',
      }),
    ).toThrow(/unresolved placeholders/);
  });

  it('rejects a relative destination url', () => {
    expect(() =>
      buildTrackingLink({
        destinationUrl: '/pricing',
        networkSlug: 'impact',
        parts: shortParts,
      }),
    ).toThrow(SubIdError);
  });
});

describe('resolveSubId', () => {
  const impact = getNetworkProfile('impact');
  const partnerstack = getNetworkProfile('partnerstack');

  it('resolves a plain subid', () => {
    const result = resolveSubId('guide.hero-cta.organic', impact);
    expect(result.ok).toBe(true);
    expect(result.parts).toEqual({ asset: 'guide', placement: 'hero-cta', campaign: 'organic' });
  });

  it('resolves a sanitized subid using the network separators', () => {
    const result = resolveSubId('guide_hero-cta', partnerstack);
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('guide.hero-cta');
  });

  it('resolves a hashed token through the map lookup', () => {
    const canonical = 'israeli-accounting-software.table-row-2.organic';
    const token = hashToken(canonical);
    const result = resolveSubId(token, impact, (t) => (t === token ? canonical : undefined));
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe(canonical);
    expect(result.parts?.placement).toBe('table-row-2');
  });

  it('reports an unknown token instead of dropping the row', () => {
    const result = resolveSubId(hashToken('never.stored'), impact, () => undefined);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_token');
  });

  it('reports a missing subid', () => {
    expect(resolveSubId('', impact).reason).toBe('missing_subid');
    expect(resolveSubId(null, impact).reason).toBe('missing_subid');
    expect(resolveSubId(undefined, impact).reason).toBe('missing_subid');
  });

  it('reports an unparsable subid with detail', () => {
    const result = resolveSubId('SomeGarbageFromTheNetwork', impact);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unparsable');
    expect(result.detail).toBeTruthy();
  });

  it('round-trips a built link back to its parts', () => {
    const parts = { asset: 'best-invoicing-tools', placement: 'table-row-3', campaign: 'organic' };
    const link = buildTrackingLink({
      destinationUrl: 'https://advertiser.example/',
      networkSlug: 'partnerstack',
      parts,
    });
    const sent = new URL(link.url).searchParams.get(link.profile.subIdParam);
    expect(resolveSubId(sent, link.profile).parts).toEqual(parts);
  });
});
