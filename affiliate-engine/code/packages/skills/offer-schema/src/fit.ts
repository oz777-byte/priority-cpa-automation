import type { Offer } from './types';
import { percentOfMinor } from './money';

/**
 * Portfolio admission criteria. Thresholds are configuration, never
 * hard-coded decisions — different niches justify different floors.
 */
export interface OfferFitCriteria {
  /** Shown in results so a verdict can never be read without its standard. */
  name: string;
  /** Minimum expected commission per conversion, in minor units. */
  minCommissionMinor: number;
  minCookieWindowDays: number;
  /** Recurring commissions are admitted even below the commission floor. */
  acceptIfRecurring: boolean;
  requireVerificationSource: boolean;
  /**
   * Assumed average order value, in minor units. Required to estimate the
   * payout of a revshare offer.
   */
  assumedAovMinor?: number;
}

/**
 * The bar an offer must clear to be worth building a content portfolio on:
 * enough commission per conversion that ordinary traffic volumes can pay for
 * the hours invested.
 */
export const DEFAULT_FIT_CRITERIA: OfferFitCriteria = {
  name: 'portfolio',
  minCommissionMinor: 2500, // $25.00
  minCookieWindowDays: 30,
  acceptIfRecurring: true,
  requireVerificationSource: true,
};

/**
 * A deliberately lower bar, for offers whose only job is to prove the
 * tracking pipeline works end to end.
 *
 * Marketplace programmes for physical goods pay cents per order on a cookie
 * measured in days. They are excellent test subjects — approval is quick and
 * conversions arrive without an enterprise sales cycle — and poor businesses.
 * The separate preset exists so that distinction stays visible in the data
 * rather than being smuggled in by loosening the portfolio floor.
 */
export const VALIDATION_FIT_CRITERIA: OfferFitCriteria = {
  name: 'validation',
  minCommissionMinor: 20, // $0.20
  minCookieWindowDays: 1,
  acceptIfRecurring: true,
  requireVerificationSource: true,
};

export type FitVerdict = 'accept' | 'reject' | 'insufficient_data';

export interface OfferFitResult {
  verdict: FitVerdict;
  /** Which criteria produced this verdict. */
  criteria: string;
  /** Estimated commission for a single conversion, in minor units. */
  expectedCommissionMinor: number | null;
  /** Every check that failed, phrased so it can be shown to a user as-is. */
  reasons: string[];
}

/**
 * Estimates the commission of one conversion. Returns null when the offer is
 * revshare and no AOV assumption was supplied — guessing here would produce a
 * confident-looking number with no basis.
 */
export function expectedCommissionMinor(
  offer: Offer,
  assumedAovMinor?: number,
): number | null {
  switch (offer.commissionModel) {
    case 'cpa':
    case 'cpl':
    case 'ppc':
      return offer.payoutAmountMinor;

    case 'revshare': {
      if (offer.payoutPercent === null || assumedAovMinor === undefined) return null;
      return percentOfMinor(assumedAovMinor, offer.payoutPercent);
    }

    case 'hybrid': {
      const fixed = offer.payoutAmountMinor ?? 0;
      if (offer.payoutPercent === null || assumedAovMinor === undefined) {
        return offer.payoutAmountMinor;
      }
      return fixed + percentOfMinor(assumedAovMinor, offer.payoutPercent);
    }
  }
}

export function evaluateOfferFit(
  offer: Offer,
  criteria: OfferFitCriteria = DEFAULT_FIT_CRITERIA,
): OfferFitResult {
  const reasons: string[] = [];
  const expected = expectedCommissionMinor(offer, criteria.assumedAovMinor);

  if (offer.cookieWindowDays < criteria.minCookieWindowDays) {
    reasons.push(
      `cookie window is ${offer.cookieWindowDays} days, below the ${criteria.minCookieWindowDays}-day floor`,
    );
  }

  if (criteria.requireVerificationSource && !offer.verificationSource) {
    reasons.push('commission terms were never verified against an official source');
  }

  const recurringWaiver = criteria.acceptIfRecurring && offer.recurring;

  if (!recurringWaiver) {
    if (expected === null) {
      return {
        verdict: 'insufficient_data',
        criteria: criteria.name,
        expectedCommissionMinor: null,
        reasons: [
          ...reasons,
          'revshare payout cannot be estimated without an assumed average order value',
        ],
      };
    }
    if (expected < criteria.minCommissionMinor) {
      reasons.push(
        `expected commission ${expected} is below the ${criteria.minCommissionMinor} floor and the offer is not recurring`,
      );
    }
  }

  return {
    verdict: reasons.length === 0 ? 'accept' : 'reject',
    criteria: criteria.name,
    expectedCommissionMinor: expected,
    reasons,
  };
}

export type OfferClass = 'portfolio' | 'validation_only' | 'reject';

export interface OfferClassification {
  offerClass: OfferClass;
  portfolio: OfferFitResult;
  validation: OfferFitResult;
  /** One sentence, safe to show a user as-is. */
  summary: string;
}

/**
 * Grades an offer against both bars at once.
 *
 * The `validation_only` class is the point of this function. An offer that
 * clears the validation bar but not the portfolio bar can prove the pipeline
 * works and still never repay the hours spent on content — and those two
 * conclusions get confused constantly. Naming the class keeps a successful
 * plumbing test from being read as a proven business.
 */
export function classifyOffer(
  offer: Offer,
  options: { assumedAovMinor?: number } = {},
): OfferClassification {
  const portfolio = evaluateOfferFit(offer, {
    ...DEFAULT_FIT_CRITERIA,
    ...(options.assumedAovMinor !== undefined
      ? { assumedAovMinor: options.assumedAovMinor }
      : {}),
  });
  const validation = evaluateOfferFit(offer, {
    ...VALIDATION_FIT_CRITERIA,
    ...(options.assumedAovMinor !== undefined
      ? { assumedAovMinor: options.assumedAovMinor }
      : {}),
  });

  if (portfolio.verdict === 'accept') {
    return {
      offerClass: 'portfolio',
      portfolio,
      validation,
      summary: 'Clears the portfolio bar — worth building content around.',
    };
  }

  if (validation.verdict === 'accept') {
    return {
      offerClass: 'validation_only',
      portfolio,
      validation,
      summary:
        'Good enough to prove tracking works, not good enough to build a portfolio on. ' +
        `Held back by: ${portfolio.reasons.join('; ')}`,
    };
  }

  return {
    offerClass: 'reject',
    portfolio,
    validation,
    summary: `Fails even the validation bar: ${validation.reasons.join('; ')}`,
  };
}
