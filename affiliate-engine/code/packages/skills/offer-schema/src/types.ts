/**
 * Canonical offer model. Mirrors the `offers` table, but money is held in
 * integer minor units (cents/agorot) so that summing thousands of
 * conversions never accumulates floating point error.
 */

export type CommissionModel = 'cpa' | 'cpl' | 'revshare' | 'ppc' | 'hybrid';

export type OfferStatus =
  | 'candidate'
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'closed';

export interface Offer {
  slug: string;
  networkSlug: string;
  advertiserName: string;
  status: OfferStatus;
  commissionModel: CommissionModel;
  /** Fixed payout per conversion, in minor units. Used by cpa/cpl/hybrid. */
  payoutAmountMinor: number | null;
  /** Percentage of the sale, 0-100. Used by revshare/hybrid. */
  payoutPercent: number | null;
  currency: string;
  recurring: boolean;
  /** null means the commission recurs for the lifetime of the customer. */
  recurringMonths: number | null;
  cookieWindowDays: number;
  destinationUrl: string;
  /** Where the terms above were read from — a URL or a dated email reference. */
  verificationSource: string | null;
  /** ISO date (YYYY-MM-DD) the terms were last verified. */
  verifiedAt: string | null;
  /** Restrictions such as "no brand PPC" or "no coupon sites". */
  termsNotes: string | null;
  /**
   * End-to-end proof that our SubID survives the redirect and shows up in
   * the network's report. An offer must not go live without it.
   */
  trackingVerified: boolean;
}

export type OfferInput = Partial<Offer> &
  Pick<Offer, 'slug' | 'networkSlug' | 'advertiserName' | 'commissionModel' | 'cookieWindowDays' | 'destinationUrl'>;

export interface ValidationIssue {
  field: string;
  message: string;
}

export class OfferValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `offer validation failed:\n` +
        issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n'),
    );
    this.name = 'OfferValidationError';
    this.issues = issues;
  }
}
