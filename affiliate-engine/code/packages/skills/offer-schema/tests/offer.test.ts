import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FIT_CRITERIA,
  OfferValidationError,
  VALIDATION_FIT_CRITERIA,
  assertCanActivate,
  classifyOffer,
  currencyExponent,
  evaluateOfferFit,
  expectedCommissionMinor,
  formatMinor,
  fromMinor,
  normalizeOffer,
  percentOfMinor,
  toMinor,
} from '../src/index.ts';
import type { OfferInput } from '../src/index.ts';

const baseInput: OfferInput = {
  slug: 'monday-crm',
  networkSlug: 'partnerstack',
  advertiserName: 'monday.com',
  commissionModel: 'revshare',
  payoutPercent: 25,
  recurring: true,
  cookieWindowDays: 90,
  destinationUrl: 'https://example.com/partner',
  verificationSource: 'https://example.com/affiliate-terms',
  verifiedAt: '2026-07-01',
};

describe('money', () => {
  it('converts to and from minor units', () => {
    expect(toMinor(12.34, 'USD')).toBe(1234);
    expect(toMinor('99.99', 'ILS')).toBe(9999);
    expect(fromMinor(1234, 'USD')).toBe(12.34);
  });

  it('respects currencies that are not two-decimal', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(toMinor(1.5, 'KWD')).toBe(1500);
  });

  it('rounds binary-representation edges correctly', () => {
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(toMinor(0.145, 'USD')).toBe(15);
  });

  it('rejects non-integer minor amounts', () => {
    expect(() => fromMinor(12.5, 'USD')).toThrow(/integer in minor units/);
  });

  it('applies percentages half-away-from-zero', () => {
    expect(percentOfMinor(10000, 25)).toBe(2500);
    expect(percentOfMinor(333, 50)).toBe(167);
    expect(percentOfMinor(-333, 50)).toBe(-167);
  });

  it('formats with the right number of decimals', () => {
    expect(formatMinor(1234, 'usd')).toBe('12.34 USD');
    expect(formatMinor(1500, 'JPY')).toBe('1500 JPY');
  });
});

describe('normalizeOffer', () => {
  it('fills defaults', () => {
    const offer = normalizeOffer(baseInput);
    expect(offer.status).toBe('candidate');
    expect(offer.currency).toBe('USD');
    expect(offer.trackingVerified).toBe(false);
    expect(offer.payoutAmountMinor).toBeNull();
  });

  it('uppercases the currency', () => {
    const offer = normalizeOffer({ ...baseInput, currency: 'ils' });
    expect(offer.currency).toBe('ILS');
  });

  it('reports every problem at once', () => {
    let caught: OfferValidationError | undefined;
    try {
      normalizeOffer({
        slug: 'Bad Slug',
        networkSlug: 'impact',
        advertiserName: '',
        commissionModel: 'revshare',
        cookieWindowDays: 0,
        destinationUrl: 'not-a-url',
      });
    } catch (err) {
      caught = err as OfferValidationError;
    }
    expect(caught).toBeInstanceOf(OfferValidationError);
    const fields = caught!.issues.map((i) => i.field);
    expect(fields).toContain('slug');
    expect(fields).toContain('advertiserName');
    expect(fields).toContain('cookieWindowDays');
    expect(fields).toContain('destinationUrl');
    expect(fields).toContain('payoutPercent');
  });

  it('rejects a decimal payout, since money is minor units', () => {
    expect(() =>
      normalizeOffer({ ...baseInput, commissionModel: 'cpa', payoutAmountMinor: 25.5 }),
    ).toThrow(/integer in minor units/);
  });

  it('rejects recurringMonths on a non-recurring offer', () => {
    expect(() =>
      normalizeOffer({ ...baseInput, recurring: false, recurringMonths: 12 }),
    ).toThrow(/meaningless when recurring is false/);
  });

  it('requires a fixed payout for cpa', () => {
    expect(() =>
      normalizeOffer({
        ...baseInput,
        commissionModel: 'cpa',
        payoutPercent: null,
        payoutAmountMinor: null,
      }),
    ).toThrow(/cpa requires a fixed payoutAmountMinor/);
  });
});

describe('assertCanActivate', () => {
  it('blocks activation until tracking is proven end to end', () => {
    const offer = normalizeOffer(baseInput);
    expect(() => assertCanActivate(offer)).toThrow(/end-to-end SubID test/);
  });

  it('passes once tracking is verified', () => {
    const offer = normalizeOffer({ ...baseInput, trackingVerified: true });
    expect(() => assertCanActivate(offer)).not.toThrow();
  });
});

describe('expectedCommissionMinor', () => {
  it('returns the fixed payout for cpa', () => {
    const offer = normalizeOffer({
      ...baseInput,
      commissionModel: 'cpa',
      payoutPercent: null,
      payoutAmountMinor: 12000,
    });
    expect(expectedCommissionMinor(offer)).toBe(12000);
  });

  it('needs an AOV assumption for revshare', () => {
    const offer = normalizeOffer(baseInput);
    expect(expectedCommissionMinor(offer)).toBeNull();
    expect(expectedCommissionMinor(offer, 40000)).toBe(10000);
  });

  it('adds fixed and percentage parts for hybrid', () => {
    const offer = normalizeOffer({
      ...baseInput,
      commissionModel: 'hybrid',
      payoutAmountMinor: 5000,
      payoutPercent: 10,
    });
    expect(expectedCommissionMinor(offer, 20000)).toBe(7000);
  });
});

describe('evaluateOfferFit', () => {
  it('accepts a recurring offer even below the commission floor', () => {
    const offer = normalizeOffer({ ...baseInput, payoutPercent: 5 });
    const result = evaluateOfferFit(offer, { ...DEFAULT_FIT_CRITERIA, assumedAovMinor: 1000 });
    expect(result.verdict).toBe('accept');
    expect(result.reasons).toEqual([]);
  });

  it('rejects a low one-off commission and says why', () => {
    const offer = normalizeOffer({
      ...baseInput,
      commissionModel: 'cpa',
      payoutPercent: null,
      payoutAmountMinor: 1200,
      recurring: false,
    });
    const result = evaluateOfferFit(offer);
    expect(result.verdict).toBe('reject');
    expect(result.reasons.join(' ')).toMatch(/below the 2500 floor/);
  });

  it('rejects a short cookie window even when recurring', () => {
    const offer = normalizeOffer({ ...baseInput, cookieWindowDays: 1 });
    const result = evaluateOfferFit(offer);
    expect(result.verdict).toBe('reject');
    expect(result.reasons.join(' ')).toMatch(/cookie window is 1 days/);
  });

  it('rejects unverified terms', () => {
    const offer = normalizeOffer({ ...baseInput, verificationSource: null });
    const result = evaluateOfferFit(offer);
    expect(result.verdict).toBe('reject');
    expect(result.reasons.join(' ')).toMatch(/never verified/);
  });

  it('returns insufficient_data rather than guessing a revshare payout', () => {
    const offer = normalizeOffer({ ...baseInput, recurring: false });
    const result = evaluateOfferFit(offer);
    expect(result.verdict).toBe('insufficient_data');
    expect(result.expectedCommissionMinor).toBeNull();
  });

  it('reports which criteria produced the verdict', () => {
    const offer = normalizeOffer(baseInput);
    expect(evaluateOfferFit(offer).criteria).toBe('portfolio');
    expect(evaluateOfferFit(offer, VALIDATION_FIT_CRITERIA).criteria).toBe('validation');
  });
});

describe('classifyOffer', () => {
  // A marketplace programme for cheap physical goods: a few percent of a small
  // order, and an attribution window measured in days.
  const marketplaceOffer = normalizeOffer({
    slug: 'marketplace-gadgets',
    networkSlug: 'aliexpress',
    advertiserName: 'Marketplace',
    commissionModel: 'revshare',
    payoutPercent: 4,
    recurring: false,
    cookieWindowDays: 3,
    destinationUrl: 'https://marketplace.example/item/123',
    verificationSource: 'https://marketplace.example/affiliate-terms',
    verifiedAt: '2026-07-20',
  });

  it('classifies a marketplace offer as validation_only, not portfolio', () => {
    // $15 order at 4% is 60 cents — enough to prove a conversion lands,
    // nowhere near enough to repay hours of content work.
    const result = classifyOffer(marketplaceOffer, { assumedAovMinor: 1500 });
    expect(result.offerClass).toBe('validation_only');
    expect(result.validation.verdict).toBe('accept');
    expect(result.portfolio.verdict).toBe('reject');
  });

  it('names what holds a validation_only offer back', () => {
    const result = classifyOffer(marketplaceOffer, { assumedAovMinor: 1500 });
    expect(result.summary).toMatch(/prove tracking works/);
    expect(result.summary).toMatch(/cookie window is 3 days/);
    expect(result.summary).toMatch(/below the 2500 floor/);
  });

  it('classifies a recurring software offer as portfolio', () => {
    const result = classifyOffer(normalizeOffer(baseInput), { assumedAovMinor: 4000 });
    expect(result.offerClass).toBe('portfolio');
    expect(result.summary).toMatch(/worth building content around/);
  });

  it('rejects an offer that fails even the validation bar', () => {
    const pennies = normalizeOffer({
      ...marketplaceOffer,
      slug: 'pennies',
      commissionModel: 'cpa',
      payoutPercent: null,
      payoutAmountMinor: 5,
    });
    const result = classifyOffer(pennies);
    expect(result.offerClass).toBe('reject');
    expect(result.summary).toMatch(/Fails even the validation bar/);
  });
});
