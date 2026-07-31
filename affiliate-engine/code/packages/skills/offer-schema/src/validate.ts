import type { Offer, OfferInput, ValidationIssue } from './types';
import { OfferValidationError } from './types';
import { assertMinor } from './money';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const COMMISSION_MODELS = new Set(['cpa', 'cpl', 'revshare', 'ppc', 'hybrid']);
const OFFER_STATUSES = new Set([
  'candidate',
  'pending_approval',
  'active',
  'paused',
  'rejected',
  'closed',
]);

/**
 * Validates and fills defaults. Throws `OfferValidationError` listing every
 * problem at once — fixing offers one error per round trip is miserable.
 */
export function normalizeOffer(input: OfferInput): Offer {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!SLUG_RE.test(input.slug ?? '')) {
    add('slug', 'must be lowercase alphanumeric with hyphens, 1-64 chars');
  }
  if (!SLUG_RE.test(input.networkSlug ?? '')) {
    add('networkSlug', 'must be lowercase alphanumeric with hyphens, 1-64 chars');
  }
  if (!input.advertiserName || input.advertiserName.trim().length === 0) {
    add('advertiserName', 'is required');
  }

  const status = input.status ?? 'candidate';
  if (!OFFER_STATUSES.has(status)) {
    add('status', `unknown status: ${status}`);
  }

  const model = input.commissionModel;
  if (!COMMISSION_MODELS.has(model)) {
    add('commissionModel', `unknown commission model: ${model}`);
  }

  const currency = (input.currency ?? 'USD').toUpperCase();
  if (!CURRENCY_RE.test(currency)) {
    add('currency', 'must be a 3-letter ISO 4217 code');
  }

  const payoutAmountMinor = input.payoutAmountMinor ?? null;
  if (payoutAmountMinor !== null) {
    try {
      assertMinor(payoutAmountMinor);
    } catch {
      add('payoutAmountMinor', 'must be an integer in minor units (cents), not a decimal');
    }
    if (payoutAmountMinor < 0) add('payoutAmountMinor', 'must not be negative');
  }

  const payoutPercent = input.payoutPercent ?? null;
  if (payoutPercent !== null && (payoutPercent < 0 || payoutPercent > 100)) {
    add('payoutPercent', 'must be between 0 and 100');
  }

  if (payoutAmountMinor === null && payoutPercent === null) {
    add('payoutAmountMinor', 'one of payoutAmountMinor or payoutPercent is required');
  }
  if (model === 'revshare' && payoutPercent === null) {
    add('payoutPercent', 'revshare requires payoutPercent');
  }
  if ((model === 'cpa' || model === 'cpl') && payoutAmountMinor === null) {
    add('payoutAmountMinor', `${model} requires a fixed payoutAmountMinor`);
  }

  const cookieWindowDays = input.cookieWindowDays;
  if (!Number.isInteger(cookieWindowDays) || cookieWindowDays <= 0) {
    add('cookieWindowDays', 'must be a positive integer');
  }

  const recurring = input.recurring ?? false;
  const recurringMonths = input.recurringMonths ?? null;
  if (recurringMonths !== null && (!Number.isInteger(recurringMonths) || recurringMonths <= 0)) {
    add('recurringMonths', 'must be a positive integer or null for lifetime');
  }
  if (!recurring && recurringMonths !== null) {
    add('recurringMonths', 'is meaningless when recurring is false');
  }

  if (!isHttpUrl(input.destinationUrl)) {
    add('destinationUrl', 'must be an absolute http(s) URL');
  }

  const verifiedAt = input.verifiedAt ?? null;
  if (verifiedAt !== null && !ISO_DATE_RE.test(verifiedAt)) {
    add('verifiedAt', 'must be an ISO date (YYYY-MM-DD)');
  }

  if (issues.length > 0) throw new OfferValidationError(issues);

  return {
    slug: input.slug,
    networkSlug: input.networkSlug,
    advertiserName: input.advertiserName.trim(),
    status,
    commissionModel: model,
    payoutAmountMinor,
    payoutPercent,
    currency,
    recurring,
    recurringMonths,
    cookieWindowDays,
    destinationUrl: input.destinationUrl,
    verificationSource: input.verificationSource ?? null,
    verifiedAt,
    termsNotes: input.termsNotes ?? null,
    trackingVerified: input.trackingVerified ?? false,
  };
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * An offer may only go live once its tracking has been proven end to end.
 * Skipping this check is how a portfolio ends up with months of clicks that
 * can never be attributed.
 */
export function assertCanActivate(offer: Offer): void {
  const issues: ValidationIssue[] = [];
  if (!offer.trackingVerified) {
    issues.push({
      field: 'trackingVerified',
      message: 'run an end-to-end SubID test before activating this offer',
    });
  }
  if (!offer.verificationSource) {
    issues.push({
      field: 'verificationSource',
      message: 'commission terms must cite an official source',
    });
  }
  if (issues.length > 0) throw new OfferValidationError(issues);
}
