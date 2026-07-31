import type { Offer } from './types';
import { percentOfMinor } from './money';

/**
 * Portfolio admission criteria. Thresholds are configuration, never
 * hard-coded decisions — different niches justify different floors.
 */
export interface OfferFitCriteria {
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

export const DEFAULT_FIT_CRITERIA: OfferFitCriteria = {
  minCommissionMinor: 2500, // $25.00
  minCookieWindowDays: 30,
  acceptIfRecurring: true,
  requireVerificationSource: true,
};

export type FitVerdict = 'accept' | 'reject' | 'insufficient_data';

export interface OfferFitResult {
  verdict: FitVerdict;
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
    expectedCommissionMinor: expected,
    reasons,
  };
}
