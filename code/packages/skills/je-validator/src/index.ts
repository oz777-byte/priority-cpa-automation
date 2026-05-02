import { CanonicalInvoiceSchema, type CanonicalInvoice } from '@priority-cpa/invoice-schema';
import { DEFAULT_ROUNDING_TOLERANCE } from '@priority-cpa/israeli-vat-logic';
import {
  checkTotalsConsistent,
  checkVatRateMatchesDate,
  checkVatAmountMatchesRate,
  checkAccountsConfigured,
  checkSupplierKnown,
  checkDatePlausibility,
  checkAllocation,
  checkDuplicate,
  checkOcrConfidence,
  checkCurrency,
} from './checks.js';
import { invoiceFingerprint } from './fingerprint.js';
import type {
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './types.js';

export function validateInvoice(
  invoice: CanonicalInvoice,
  context: ValidationContext,
): ValidationResult {
  const parsed = CanonicalInvoiceSchema.parse(invoice);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const tolerance = context.roundingTolerance ?? DEFAULT_ROUNDING_TOLERANCE;

  checkTotalsConsistent(parsed, errors, warnings, tolerance);
  checkVatRateMatchesDate(parsed, errors);
  checkVatAmountMatchesRate(parsed, errors, tolerance);
  checkAccountsConfigured(parsed, context, errors);
  checkSupplierKnown(parsed, context, errors);
  checkDatePlausibility(parsed, context, errors, warnings);
  checkAllocation(parsed, errors, warnings);
  checkDuplicate(parsed, context, errors);
  checkOcrConfidence(parsed, context, warnings);
  checkCurrency(parsed, warnings);

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export { invoiceFingerprint };
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationContext,
  ValidationErrorCode,
  ValidationWarningCode,
} from './types.js';
