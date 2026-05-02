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

    // The complex ones are stubbed (use standard) and we WARN clearly.
    case 'WITH_WITHHOLDING':
    case 'MULTI_EXPENSE':
    case 'WITH_COST_CENTER':
    case 'MIXED_DEDUCTION':
    case 'FOREIGN_CURRENCY':
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
