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
  /**
   * Other scenarios that secondarily apply (overlay flags).
   * The constructor applies them as post-processors on top of the primary
   * builder's output — e.g. WITH_ALLOCATION + MIXED_DEDUCTION runs the
   * mixed-deduction builder, then the allocation overlay augments warnings.
   */
  overlays: Scenario[];
}

/**
 * Decision tree per `05_domain/je_scenarios_playbook.md` §9, with cumulative
 * overlay support. Primary scenario = which builder runs. Overlays = signals
 * that augment the resulting JE without changing its base shape.
 */
export function detectScenario(
  invoice: CanonicalInvoice,
  context: DetectorContext = {},
): DetectionResult {
  // Compute every applicable signal up-front so overlays can be added even
  // when a different scenario wins as primary.
  const signals = computeSignals(invoice, context);

  // ─── Primary picks (most specific first) ────────────────────────────

  // 1. Credit note — full reversal beats everything (CR/DR direction flip)
  if (invoice.invoice.is_credit_note) {
    return {
      scenario: 'CREDIT_NOTE',
      reason: 'invoice.is_credit_note=true',
      overlays: signals.allOverlays(['CREDIT_NOTE']),
    };
  }

  // 2. Self-invoice (חשבונית עצמית — foreign service with Israeli VAT)
  if (invoice.invoice.is_self_invoice) {
    return {
      scenario: 'SELF_INVOICE',
      reason: 'invoice.is_self_invoice=true',
      overlays: signals.allOverlays(['SELF_INVOICE']),
    };
  }

  // 3. Foreign currency — full FX engine routing
  if (invoice.invoice.currency !== 'ILS') {
    return {
      scenario: 'FOREIGN_CURRENCY',
      reason: `currency=${invoice.invoice.currency}`,
      overlays: signals.allOverlays(['FOREIGN_CURRENCY']),
    };
  }

  // 4. Allocation regulation (2024+) — block if required and missing
  if (
    isAllocationRequired(invoice.totals.subtotal, invoice.invoice.date) &&
    !invoice.invoice.allocation_number
  ) {
    return {
      scenario: 'MISSING_ALLOCATION',
      reason: `subtotal ${invoice.totals.subtotal} > threshold for date ${invoice.invoice.date}, no allocation_number`,
      overlays: signals.allOverlays(['MISSING_ALLOCATION']),
    };
  }

  // 5. Prepaid expense (recognize over multiple months)
  if (
    invoice.invoice.prepaid_period_months &&
    invoice.invoice.prepaid_period_months > 1
  ) {
    return {
      scenario: 'PREPAID',
      reason: `prepaid_period_months=${invoice.invoice.prepaid_period_months}`,
      overlays: signals.allOverlays(['PREPAID']),
    };
  }

  // 6. Private supplier (יחיד בלי ע.מ) — auto-withholding
  if (
    invoice.invoice.is_private_supplier ||
    (invoice.supplier.tax_id && !/^\d{8,9}$/.test(invoice.supplier.tax_id) && invoice.supplier.tax_id.length === 9)
  ) {
    // tax_id of 9 digits and NOT a valid business ע.מ heuristic — treat as ת.ז
    // For now we only trigger when explicit flag is set, leaving heuristic for later
  }
  if (invoice.invoice.is_private_supplier) {
    return {
      scenario: 'PRIVATE_SUPPLIER',
      reason: 'invoice.is_private_supplier=true',
      overlays: signals.allOverlays(['PRIVATE_SUPPLIER']),
    };
  }

  // 7. Withholding tax (service supplier)
  if (signals.withholding && signals.withholding > 0) {
    return {
      scenario: 'WITH_WITHHOLDING',
      reason: `withholding_percent=${signals.withholding}`,
      overlays: signals.allOverlays(['WITH_WITHHOLDING']),
    };
  }

  // 8. Mixed deduction (vehicle/meals partial VAT)
  if (signals.mixedCategory && signals.mixedCategory !== 'non_deductible') {
    return {
      scenario: 'MIXED_DEDUCTION',
      reason: `mixed_deduction_category=${signals.mixedCategory}`,
      overlays: signals.allOverlays(['MIXED_DEDUCTION']),
    };
  }

  // 9. Multi-expense (multiple expense accounts in one invoice)
  if (
    context.hasMultipleExpenseCategories ||
    (invoice.invoice.expense_splits && invoice.invoice.expense_splits.length > 1)
  ) {
    return {
      scenario: 'MULTI_EXPENSE',
      reason: invoice.invoice.expense_splits
        ? `expense_splits with ${invoice.invoice.expense_splits.length} categories`
        : 'multiple expense categories signal',
      overlays: signals.allOverlays(['MULTI_EXPENSE']),
    };
  }

  // 10. Cost center — only triggers as primary if no other category did
  if (signals.costCenter) {
    return {
      scenario: 'WITH_COST_CENTER',
      reason: `cost_center=${signals.costCenter}`,
      overlays: signals.allOverlays(['WITH_COST_CENTER']),
    };
  }

  // 11. Immediate payment
  if (
    invoice.invoice.payment_method === 'cash' ||
    invoice.invoice.payment_method === 'card' ||
    invoice.invoice.payment_method === 'transfer'
  ) {
    return {
      scenario: 'IMMEDIATE_PAYMENT',
      reason: `payment_method=${invoice.invoice.payment_method}`,
      overlays: signals.allOverlays(['IMMEDIATE_PAYMENT']),
    };
  }

  // 12. Allocation present but not flagged — WITH_ALLOCATION
  if (invoice.invoice.allocation_number) {
    return {
      scenario: 'WITH_ALLOCATION',
      reason: 'allocation_number present',
      overlays: signals.allOverlays(['WITH_ALLOCATION']),
    };
  }

  // 13. Default
  return {
    scenario: 'STANDARD',
    reason: 'no special flags detected',
    overlays: signals.allOverlays(['STANDARD']),
  };
}

/* ─── overlay computation ─────────────────────────────────────────── */

interface Signals {
  withholding: number | undefined;
  mixedCategory: 'vehicle' | 'meals' | 'non_deductible' | undefined;
  costCenter: string | undefined;
  hasDifferentDates: boolean;
  hasDiscount: boolean;
  hasAllocation: boolean;
  hasCostCenter: boolean;
  hasMultiExpense: boolean;
  hasMixedDeduction: boolean;
  hasWithholding: boolean;
  hasImmediatePayment: boolean;
  hasMissingAllocation: boolean;
  /** All overlays except the primary scenario being returned. */
  allOverlays: (excludePrimary: Scenario[]) => Scenario[];
}

function computeSignals(invoice: CanonicalInvoice, context: DetectorContext): Signals {
  const withholding = context.withholdingPercent ?? invoice.invoice.withholding_percent;
  const mixedCategory =
    context.mixedDeductionCategory ?? invoice.invoice.mixed_deduction_category;
  const costCenter = context.costCenter ?? invoice.invoice.cost_center;

  const hasDifferentDates =
    !!invoice.invoice.value_date &&
    invoice.invoice.value_date !== invoice.invoice.date;
  const hasDiscount =
    invoice.totals.discount_amount !== undefined &&
    invoice.totals.discount_amount !== 0;
  const hasAllocation = !!invoice.invoice.allocation_number;
  const hasCostCenter = !!costCenter;
  const hasMultiExpense =
    !!context.hasMultipleExpenseCategories ||
    !!(invoice.invoice.expense_splits && invoice.invoice.expense_splits.length > 1);
  const hasMixedDeduction = !!mixedCategory && mixedCategory !== 'non_deductible';
  const hasWithholding = !!withholding && withholding > 0;
  const hasImmediatePayment =
    invoice.invoice.payment_method === 'cash' ||
    invoice.invoice.payment_method === 'card' ||
    invoice.invoice.payment_method === 'transfer';
  const hasMissingAllocation =
    isAllocationRequired(invoice.totals.subtotal, invoice.invoice.date) &&
    !hasAllocation;

  const allApplicable: Scenario[] = [];
  if (hasDifferentDates) allApplicable.push('DIFFERENT_DATES');
  if (hasDiscount) allApplicable.push('WITH_DISCOUNT');
  if (hasAllocation) allApplicable.push('WITH_ALLOCATION');
  if (hasCostCenter) allApplicable.push('WITH_COST_CENTER');
  if (hasMultiExpense) allApplicable.push('MULTI_EXPENSE');
  if (hasMixedDeduction) allApplicable.push('MIXED_DEDUCTION');
  if (hasWithholding) allApplicable.push('WITH_WITHHOLDING');
  if (hasImmediatePayment) allApplicable.push('IMMEDIATE_PAYMENT');
  if (hasMissingAllocation) allApplicable.push('MISSING_ALLOCATION');

  return {
    withholding,
    mixedCategory,
    costCenter,
    hasDifferentDates,
    hasDiscount,
    hasAllocation,
    hasCostCenter,
    hasMultiExpense,
    hasMixedDeduction,
    hasWithholding,
    hasImmediatePayment,
    hasMissingAllocation,
    allOverlays: (excludePrimary: Scenario[]) =>
      allApplicable.filter((s) => !excludePrimary.includes(s)),
  };
}
