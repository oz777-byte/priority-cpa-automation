import { describe, it, expect } from 'vitest';
import {
  SubIdError,
  buildCanonicalSubId,
  fnv1a32,
  hashToken,
  isHashedToken,
  parseSubId,
  toSegment,
} from '../src/index';

describe('toSegment', () => {
  it('slugifies free text', () => {
    expect(toSegment('CPA Software Comparison')).toBe('cpa-software-comparison');
    expect(toSegment('table row #2')).toBe('table-row-2');
    expect(toSegment('--messy--input--')).toBe('messy-input');
  });

  it('never returns an empty segment', () => {
    expect(() => toSegment('!!!', 'asset')).toThrow(SubIdError);
    expect(() => toSegment('   ', 'asset')).toThrow(/empty segment/);
  });

  it('caps a segment at 40 chars without leaving a trailing hyphen', () => {
    const long = toSegment('a'.repeat(38) + ' bcd');
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('buildCanonicalSubId', () => {
  it('joins the four segments with dots', () => {
    expect(
      buildCanonicalSubId({
        asset: 'cpa-software-comparison',
        placement: 'table-row-2',
        campaign: 'organic',
        variant: 'a',
      }),
    ).toBe('cpa-software-comparison.table-row-2.organic.a');
  });

  it('omits trailing optional segments', () => {
    expect(buildCanonicalSubId({ asset: 'guide', placement: 'hero-cta' })).toBe(
      'guide.hero-cta',
    );
    expect(
      buildCanonicalSubId({ asset: 'guide', placement: 'hero-cta', campaign: 'newsletter-04' }),
    ).toBe('guide.hero-cta.newsletter-04');
  });

  it('keeps the empty campaign slot when only a variant is given', () => {
    // Position carries meaning: dropping the slot would make the variant
    // parse back as a campaign.
    const subid = buildCanonicalSubId({ asset: 'guide', placement: 'hero-cta', variant: 'b' });
    expect(subid).toBe('guide.hero-cta..b');
    expect(parseSubId(subid)).toEqual({ asset: 'guide', placement: 'hero-cta', variant: 'b' });
  });

  it('rejects an asset that cannot be slugified', () => {
    expect(() => buildCanonicalSubId({ asset: '***', placement: 'hero' })).toThrow(SubIdError);
  });
});

describe('parseSubId', () => {
  it('round-trips a full subid', () => {
    const parts = {
      asset: 'cpa-software-comparison',
      placement: 'table-row-2',
      campaign: 'organic',
      variant: 'a',
    };
    expect(parseSubId(buildCanonicalSubId(parts))).toEqual(parts);
  });

  it('accepts underscore-separated subids from sanitising networks', () => {
    expect(parseSubId('guide_hero-cta_organic', ['_', '.'])).toEqual({
      asset: 'guide',
      placement: 'hero-cta',
      campaign: 'organic',
    });
  });

  it('rejects a subid with no placement', () => {
    expect(() => parseSubId('guide')).toThrow(/bad placement segment/);
  });

  it('rejects an empty subid', () => {
    expect(() => parseSubId('   ')).toThrow(/empty subid/);
  });

  it('rejects segments with illegal characters', () => {
    expect(() => parseSubId('Guide.hero')).toThrow(/bad asset segment/);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('a.b.c')).toBe(hashToken('a.b.c'));
  });

  it('has a fixed width that fits the tightest network field', () => {
    expect(hashToken('a.b')).toHaveLength(16);
    expect(hashToken('x'.repeat(200))).toHaveLength(16);
  });

  it('is recognisable, and ordinary slugs are not', () => {
    expect(isHashedToken(hashToken('a.b'))).toBe(true);
    expect(isHashedToken('hosting-comparison')).toBe(false);
    expect(isHashedToken('guide.hero-cta')).toBe(false);
  });

  it('does not collide across a realistic portfolio of subids', () => {
    const tokens = new Set<string>();
    for (let asset = 0; asset < 60; asset += 1) {
      for (let placement = 0; placement < 40; placement += 1) {
        tokens.add(hashToken(`asset-${asset}-long-descriptive-slug.placement-${placement}`));
      }
    }
    expect(tokens.size).toBe(2400);
  });

  it('separates subids that share a long prefix, which truncation would merge', () => {
    const a = 'israeli-accounting-software-comparison-2026.table-row-1';
    const b = 'israeli-accounting-software-comparison-2027.table-row-1';
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe('fnv1a32', () => {
  it('matches the reference vector for "hello"', () => {
    expect(fnv1a32('hello')).toBe(0x4f9f2cab);
  });
});
