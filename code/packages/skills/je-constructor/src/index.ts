import {
  detectScenario,
  type DetectorContext,
} from '@priority-cpa/scenario-detector';
import type { CanonicalInvoice, Scenario } from '@priority-cpa/invoice-schema';
import { roundCents, vatFromTotals, valueDateOf } from './helpers.js';
import type {
  ConstructorConfig,
  ConstructResult,
  JELine,
  JERecord,
} from './types.js';

export type {
  ConstructorConfig,
  ConstructResult,
  JELine,
  JERecord,
} from './types.js';

/**
 * Build a balanced multi-record JE from a canonical invoice + company config.
 *
 * The detector decides the scenario; this function picks the appropriate
 * builder. Always returns at least one record. For complex scenarios that
 * are not yet implemented, falls back to STANDARD with a warning.
 */
export function constructJE(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  detectorContext: DetectorContext = {},
): ConstructResult {
  const detection = detectScenario(invoice, detectorContext);
  const warnings: string[] = [];

  let records: JERecord[];
  switch (detection.scenario) {
    case 'STANDARD':
    case 'WITH_DISCOUNT':
    case 'AGGREGATOR':
      records = [buildStandard(invoice, config, detection.scenario)];
      break;

    case 'WITH_ALLOCATION':
      records = [buildWithAllocation(invoice, config, warnings)];
      break;

    case 'DIFFERENT_DATES':
      records = [buildStandard(invoice, config, 'DIFFERENT_DATES')];
      break;

    case 'IMMEDIATE_PAYMENT':
      records = [buildImmediatePayment(invoice, config, warnings)];
      break;

    case 'CREDIT_NOTE':
      records = [buildCreditNote(invoice, config)];
      break;

    case 'MISSING_ALLOCATION':
      records = [buildStandard(invoice, config, 'MISSING_ALLOCATION')];
      warnings.push(
        'חשבונית חייבת מספר הקצאה (חוק 2024+) — JE נבנה אך הייצוא ייחסם עד שתוסיף מספר הקצאה.',
      );
      break;

    case 'WITH_WITHHOLDING':
      records = [
        buildWithholding(
          invoice,
          config,
          detectorContext.withholdingPercent ?? invoice.invoice.withholding_percent ?? 0,
          warnings,
        ),
      ];
      break;

    case 'MIXED_DEDUCTION':
      records = buildMixedDeduction(
        invoice,
        config,
        (detectorContext.mixedDeductionCategory ??
          invoice.invoice.mixed_deduction_category)!,
        warnings,
      );
      break;

    case 'FOREIGN_CURRENCY':
      records = [buildForeignCurrency(invoice, config, warnings)];
      break;

    // Still stubbed — fall back to STANDARD with a warning.
    case 'MULTI_EXPENSE':
    case 'WITH_COST_CENTER':
      records = [buildStandard(invoice, config, detection.scenario)];
      warnings.push(
        `תרחיש ${detection.scenario} זוהה — הטיפול האוטומטי המלא טרם פעיל; JE נבנה כתרחיש סטנדרטי. ערוך ידנית בעורך פקודות יומן לפי הצורך.`,
      );
      break;

    default:
      records = [buildStandard(invoice, config, 'STANDARD')];
  }

  return {
    primaryScenario: detection.scenario,
    overlays: detection.overlays,
    records,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────
// Builders per scenario
// ─────────────────────────────────────────────────────────────────

function detailsString(invoice: CanonicalInvoice, config: ConstructorConfig): string {
  return `${config.detailsPrefix} ${invoice.invoice.number}`;
}

function buildStandard(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  scenario: Scenario,
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: JELine[] = [
    { account: config.expenseAccount, debit: subtotal, credit: 0 },
    { account: config.vatInputAccount, debit: vat, credit: 0 },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: total,
    },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: detailsString(invoice, config),
    transactionType: config.transactionType,
    scenario,
    recordIndex: 0,
    lines,
    notes: [],
  };
}

function buildWithAllocation(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const base = buildStandard(invoice, config, 'WITH_ALLOCATION');
  const allocation = invoice.invoice.allocation_number ?? '';
  // Allocation > 5 chars cannot fit field 4 (אסמכתא 1) of 180-format. Flag for FLEXIBLE.
  if (allocation.length > 5) {
    warnings.push(
      `מספר הקצאה ${allocation} ארוך מ-5 תווים — הפורמט 180 אינו תומך; ייצוא ידרוש פורמט FLEXIBLE (יתווסף בשלב הבא).`,
    );
    base.notes.push(
      `הקצאה ${allocation} שמורה בפרטים בלבד עד תמיכת FLEXIBLE.`,
    );
    base.details = `${base.details} הקצ:${allocation.slice(0, 6)}`;
  }
  return base;
}

function buildImmediatePayment(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const creditAccount = config.paymentAccount ?? invoice.supplier.internal_code_priority;
  if (!config.paymentAccount) {
    warnings.push(
      'תרחיש IMMEDIATE_PAYMENT אך ללא חשבון תשלום מוגדר; ה-JE זוקף לספק כברירת מחדל.',
    );
  }

  const lines: JELine[] = [
    { account: config.expenseAccount, debit: subtotal, credit: 0 },
    { account: config.vatInputAccount, debit: vat, credit: 0 },
    { account: creditAccount, debit: 0, credit: total },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: detailsString(invoice, config),
    transactionType: config.transactionType,
    scenario: 'IMMEDIATE_PAYMENT',
    recordIndex: 0,
    lines,
    notes: ['חשבונית ששולמה מיידית — אין יתרה לספק'],
  };
}

function buildCreditNote(invoice: CanonicalInvoice, config: ConstructorConfig): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  // Reversed JE: DR supplier, CR expense + VAT
  const lines: JELine[] = [
    { account: invoice.supplier.internal_code_priority, debit: total, credit: 0 },
    { account: config.vatInputAccount, debit: 0, credit: vat },
    { account: config.expenseAccount, debit: 0, credit: roundCents(subtotal) },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `זיכוי ${invoice.invoice.number}`,
    transactionType: config.creditNoteTransactionType ?? config.transactionType,
    scenario: 'CREDIT_NOTE',
    recordIndex: 0,
    lines,
    notes: ['חשבונית זיכוי — כיווני חובה/זכות הפוכים מחשבונית רגילה'],
  };
}

/**
 * WITH_WITHHOLDING — supplier service invoice with mandatory tax-authority
 * withholding. Withholding amount comes off the supplier's payment and goes
 * to the withholding account.
 *
 * 4-line JE in a single record (fits 180-format: 2 DR + 2 CR).
 *   DR  expense                subtotal
 *   DR  vat                    vat
 *   CR  supplier               total - withholding
 *   CR  withholding_account    withholding
 */
function buildWithholding(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  withholdingPercent: number,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);
  const withholdingAmount = roundCents((subtotal * withholdingPercent) / 100);
  const supplierCredit = roundCents(total - withholdingAmount);

  if (!config.withholdingAccount) {
    warnings.push(
      'WITH_WITHHOLDING: לא הוגדר חשבון רשות המסים בהגדרות החברה — JE נבנה עם 175-0 כברירת מחדל; ערוך לפי הצורך.',
    );
  }

  const withholdingAcct = config.withholdingAccount ?? '175-0';

  const lines: JELine[] = [
    { account: config.expenseAccount, debit: subtotal, credit: 0 },
    { account: config.vatInputAccount, debit: vat, credit: 0 },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: supplierCredit,
    },
    { account: withholdingAcct, debit: 0, credit: withholdingAmount },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `${detailsString(invoice, config)} ניכוי ${withholdingPercent}%`,
    transactionType: config.transactionType,
    scenario: 'WITH_WITHHOLDING',
    recordIndex: 0,
    lines,
    notes: [
      `סה"כ לתשלום לספק: ${supplierCredit.toFixed(2)} ₪`,
      `ניכוי במקור (${withholdingPercent}%): ${withholdingAmount.toFixed(2)} ₪`,
    ],
  };
}

/**
 * MIXED_DEDUCTION — Israeli tax law allows partial VAT input on certain
 * categories: vehicle (2/3), meals/אש"ל (1/4), non_deductible (0).
 *
 * Produces TWO records (180-format limit: 2 DR + 2 CR per record).
 *   Record 1 — deductible side:
 *     DR  expense_deductible          subtotal × rate
 *     DR  vat_input                   vat × rate
 *     CR  supplier                    deductible_total
 *   Record 2 — non-deductible side:
 *     DR  non_deductible_account      (subtotal × (1-rate)) + (vat × (1-rate))
 *     CR  supplier                    non_deductible_total
 *
 * Both records share the same reference1 so Priority links them.
 */
function buildMixedDeduction(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  category: 'vehicle' | 'meals' | 'non_deductible',
  warnings: string[],
): JERecord[] {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const RATES: Record<typeof category, number> = {
    vehicle: 2 / 3,
    meals: 0.25,
    non_deductible: 0,
  };
  const rate = RATES[category];

  const expenseDeductible = roundCents(subtotal * rate);
  const expenseNonDeductible = roundCents(subtotal - expenseDeductible);
  const vatDeductible = roundCents(vat * rate);
  const vatNonDeductible = roundCents(vat - vatDeductible);

  const deductibleTotal = roundCents(expenseDeductible + vatDeductible);
  const nonDeductibleTotal = roundCents(expenseNonDeductible + vatNonDeductible);

  if (!config.nonDeductibleAccount) {
    warnings.push(
      'MIXED_DEDUCTION: לא הוגדר חשבון "הוצאה לא מנוכה" בהגדרות החברה — JE נבנה עם 502-1 כברירת מחדל; ערוך לפי הצורך.',
    );
  }
  const nonDeductibleAcct = config.nonDeductibleAccount ?? '502-1';

  const reference1 = invoice.invoice.number;
  const supplier = invoice.supplier.internal_code_priority;

  const baseHeader = {
    reference1,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    transactionType: config.transactionType,
    scenario: 'MIXED_DEDUCTION' as const,
  };

  const records: JERecord[] = [];

  // Record 1: deductible side (only if there's anything to deduct)
  if (deductibleTotal > 0) {
    records.push({
      ...baseHeader,
      details: `${detailsString(invoice, config)} (${category} — מנוכה)`,
      recordIndex: 0,
      lines: [
        { account: config.expenseAccount, debit: expenseDeductible, credit: 0 },
        { account: config.vatInputAccount, debit: vatDeductible, credit: 0 },
        { account: supplier, debit: 0, credit: deductibleTotal },
      ],
      notes: [`חלק מנוכה (${(rate * 100).toFixed(0)}%): ${deductibleTotal.toFixed(2)} ₪`],
    });
  }

  // Record 2: non-deductible side
  if (nonDeductibleTotal > 0) {
    records.push({
      ...baseHeader,
      details: `${detailsString(invoice, config)} (${category} — לא מנוכה)`,
      recordIndex: records.length,
      lines: [
        { account: nonDeductibleAcct, debit: nonDeductibleTotal, credit: 0 },
        { account: supplier, debit: 0, credit: nonDeductibleTotal },
      ],
      notes: [
        `חלק לא מנוכה: ${nonDeductibleTotal.toFixed(2)} ₪ (כולל מע"מ ${vatNonDeductible.toFixed(2)})`,
      ],
    });
  }

  if (records.length === 0) {
    // Edge: rate=0 (non_deductible explicitly chosen) — fall back to one record
    records.push({
      ...baseHeader,
      details: `${detailsString(invoice, config)} (לא מנוכה כלל)`,
      recordIndex: 0,
      lines: [
        { account: nonDeductibleAcct, debit: total, credit: 0 },
        { account: supplier, debit: 0, credit: total },
      ],
      notes: ['ניכוי 0% — כל החשבונית נזקפת כהוצאה לא מנוכה'],
    });
  }

  return records;
}

/**
 * FOREIGN_CURRENCY — same 3-line structure as STANDARD, but each line carries
 * BOTH the ILS amount (using fx_rate) AND the foreign currency amount.
 * The 180-format places ILS in fields 83-130 and FX in fields 131-178.
 */
function buildForeignCurrency(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const subtotalFx = invoice.totals.subtotal;
  const totalFx = invoice.totals.total;
  const vatFx = vatFromTotals(invoice);

  const rate = invoice.invoice.fx_rate;
  if (!rate) {
    warnings.push(
      'FOREIGN_CURRENCY: שער חליפין (fx_rate) לא צוין על החשבונית — נדרש להמרה ל-₪. השתמשתי בשער 1.0 (זהות) — ערוך ידנית.',
    );
  }
  const r = rate ?? 1.0;

  const subtotalIls = roundCents(subtotalFx * r);
  const totalIls = roundCents(totalFx * r);
  const vatIls = roundCents(vatFx * r);

  const lines: JELine[] = [
    {
      account: config.expenseAccount,
      debit: subtotalIls,
      credit: 0,
      debitFx: subtotalFx,
    },
    {
      account: config.vatInputAccount,
      debit: vatIls,
      credit: 0,
      debitFx: vatFx,
    },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: totalIls,
      creditFx: totalFx,
    },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `${detailsString(invoice, config)} (${invoice.invoice.currency} × ${r.toFixed(4)})`,
    transactionType: config.transactionType,
    scenario: 'FOREIGN_CURRENCY',
    recordIndex: 0,
    lines,
    notes: [
      `שער חליפין: ${r.toFixed(4)} (${invoice.invoice.currency} → ILS)`,
      'הפרשי שער ייווצרו בעת תשלום בפועל',
    ],
  };
}
