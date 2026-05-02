import type { CanonicalInvoice, Scenario } from '@priority-cpa/invoice-schema';
import { isAllocationRequired } from '@priority-cpa/israeli-vat-logic';

export interface DetectorContext {
  /**
   * Optional override for the allocation threshold. If absent, the detector
   * computes the threshold from the invoice date.
   */
  allocationThreshold?: number;

  /**
   * Pre-computed extra signals (set by upstream pipeline / OCR / user UI).
   * If absent, only invoice-internal cues are used.
   */
  hasMultipleExpenseCategories?: boolean;
  costCenter?: string | undefined;
  withholdingPercent?: number | undefined;
  mixedDeductionCategory?: 'vehicle' | 'meals' | 'non_deductible' | undefined;
}

export interface DetectionResult {
  scenario: Scenario;
  reason: string;
  /** Other scenarios that secondarily apply (overlay flags, e.g. WITH_ALLOCATION + DIFFERENT_DATES). */
  overlays: Scenario[];
}

/**
 * Decision tree per `05_domain/je_scenarios_playbook.md` §9.
 * The order matters: the first match wins for the primary scenario,
 * but several "overlay" flags can apply on top.
 */
export function detectScenario(
  invoice: CanonicalInvoice,
  context: DetectorContext = {},
): DetectionResult {
  const overlays: Scenario[] = [];

  // 1. Credit note — full reversal
  if (invoice.invoice.is_credit_note) {
    return {
      scenario: 'CREDIT_NOTE',
      reason: 'invoice.is_credit_note=true',
      overlays,
    };
  }

  // 2. Foreign currency — full FX engine routing
  if (invoice.invoice.currency !== 'ILS') {
    return {
      scenario: 'FOREIGN_CURRENCY',
      reason: `currency=${invoice.invoice.currency}`,
      overlays,
    };
  }

  // 3. Allocation regulation (2024+) — block if required and missing
  if (
    isAllocationRequired(invoice.totals.subtotal, invoice.invoice.date) &&
    !invoice.invoice.allocation_number
  ) {
    return {
      scenario: 'MISSING_ALLOCATION',
      reason: `subtotal ${invoice.totals.subtotal} > threshold for date ${invoice.invoice.date}, no allocation_number`,
      overlays,
    };
  }

  // From here, primary is one of: STANDARD / WITH_ALLOCATION / IMMEDIATE_PAYMENT /
  // MULTI_EXPENSE / WITH_WITHHOLDING / WITH_COST_CENTER / MIXED_DEDUCTION.
  // Some flags overlay (DIFFERENT_DATES, WITH_DISCOUNT).

  // Overlays
  if (
    invoice.invoice.value_date &&
    invoice.invoice.value_date !== invoice.invoice.date
  ) {
    overlays.push('DIFFERENT_DATES');
  }
  if (
    invoice.totals.discount_amount !== undefined &&
    invoice.totals.discount_amount !== 0
  ) {
    overlays.push('WITH_DISCOUNT');
  }

  // Merge invoice-level fields with caller context (context wins).
  const withholding = context.withholdingPercent ?? invoice.invoice.withholding_percent;
  const mixedCategory =
    context.mixedDeductionCategory ?? invoice.invoice.mixed_deduction_category;
  const costCenter = context.costCenter ?? invoice.invoice.cost_center;

  // Primary picks (most specific first)
  if (withholding && withholding > 0) {
    return {
      scenario: 'WITH_WITHHOLDING',
      reason: `withholding_percent=${withholding}`,
      overlays,
    };
  }
  if (mixedCategory && mixedCategory !== 'non_deductible') {
    return {
      scenario: 'MIXED_DEDUCTION',
      reason: `mixed_deduction_category=${mixedCategory}`,
      overlays,
    };
  }
  if (context.hasMultipleExpenseCategories) {
    return { scenario: 'MULTI_EXPENSE', reason: 'multiple expense categories signal', overlays };
  }
  if (costCenter) {
    return {
      scenario: 'WITH_COST_CENTER',
      reason: `cost_center=${costCenter}`,
      overlays,
    };
  }
  if (
    invoice.invoice.payment_method === 'cash' ||
    invoice.invoice.payment_method === 'card' ||
    invoice.invoice.payment_method === 'transfer'
  ) {
    return {
      scenario: 'IMMEDIATE_PAYMENT',
      reason: `payment_method=${invoice.invoice.payment_method}`,
      overlays,
    };
  }
  if (invoice.invoice.allocation_number) {
    return { scenario: 'WITH_ALLOCATION', reason: 'allocation_number present', overlays };
  }
  return { scenario: 'STANDARD', reason: 'no special flags detected', overlays };
}
