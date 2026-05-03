export {
  getStandardVatRate,
  getVatRateForDate,
  VAT_RATE_HISTORY,
  calculateVat,
  round,
  STANDARD_VAT_CHANGEOVER_DATE,
  VAT_RATE_PRE_2025,
  VAT_RATE_FROM_2025,
} from './rates.js';
export type { StandardVatRate } from './rates.js';

export {
  isWithinSixMonthRule,
  daysSinceInvoice,
  SIX_MONTH_RULE_DAYS,
} from './six-month-rule.js';

export { getAllocationThreshold, isAllocationRequired } from './allocation.js';

export { applyMixedDeduction, DEDUCTION_RATES, DEDUCTION_LABELS } from './deduction.js';
export type { DeductionCategory, MixedDeductionResult } from './deduction.js';

export {
  reconcileRounding,
  RoundingMismatchError,
  DEFAULT_ROUNDING_TOLERANCE,
} from './rounding.js';
export type { StatedTotals, ReconciledTotals } from './rounding.js';
