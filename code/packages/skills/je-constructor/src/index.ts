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

// AR (sales) side — separate from the supplier-side constructJE above.
export { constructARJE } from './ar-index.js';
export type {
  ARConstructorConfig,
  ARConstructResult,
  ARJELine,
  ARJERecord,
} from './ar-types.js';

// Cash / bank / credit-card scenarios — for transactions that aren't
// tied to an invoice (fees, interest, transfers, bounced checks).
export { constructCashBankJE } from './cash-bank-builders.js';
export type {
  CashBankScenario,
  CashBankConfig,
  CashBankInput,
  CashBankJELine,
  CashBankJERecord,
  CashBankConstructResult,
} from './cash-bank-types.js';

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

    case 'MULTI_EXPENSE':
      records = buildMultiExpense(invoice, config, warnings);
      break;

    case 'WITH_COST_CENTER':
      records = [
        buildWithCostCenter(
          invoice,
          config,
          (detectorContext.costCenter ?? invoice.invoice.cost_center) ?? '',
          warnings,
        ),
      ];
      break;

    case 'SELF_INVOICE':
      records = [buildSelfInvoice(invoice, config, warnings)];
      break;

    case 'PRIVATE_SUPPLIER':
      records = [buildPrivateSupplier(invoice, config, warnings)];
      break;

    case 'PREPAID':
      records = [buildPrepaid(invoice, config, warnings)];
      break;

    default:
      records = [buildStandard(invoice, config, 'STANDARD')];
  }

  // Apply overlay post-processors. These augment warnings/notes/details
  // when secondary scenarios apply on top of the primary builder.
  applyOverlays(records, detection.overlays, invoice, warnings);

  return {
    primaryScenario: detection.scenario,
    overlays: detection.overlays,
    records,
    warnings,
  };
}

/* ──────────────────────────────────────────────────────────────────
 * Overlay post-processors — applied to whatever records the primary
 * builder produced. Each augments warnings/notes/details when its
 * scenario is among the overlays detected.
 * ──────────────────────────────────────────────────────────────── */

function applyOverlays(
  records: JERecord[],
  overlays: Scenario[],
  invoice: CanonicalInvoice,
  warnings: string[],
): void {
  if (overlays.includes('WITH_ALLOCATION')) {
    const allocation = invoice.invoice.allocation_number ?? '';
    if (allocation) {
      for (const r of records) {
        r.notes.push(`מספר הקצאה: ${allocation}`);
        if (!r.details.includes('הקצ')) {
          r.details = `${r.details} הקצ:${allocation.slice(0, 6)}`;
        }
      }
      if (allocation.length > 5) {
        warnings.push(
          `מספר הקצאה ${allocation} ארוך מ-5 תווים — ייצוא יעבור אוטומטית לפורמט FLEXIBLE.`,
        );
      }
    }
  }

  if (overlays.includes('MISSING_ALLOCATION')) {
    warnings.push(
      'חשבונית מעל הרף ללא מספר הקצאה — ייצוא ייחסם עד שתוסיף הקצאה (חוק 2024+).',
    );
  }

  if (overlays.includes('WITH_COST_CENTER')) {
    const cc = invoice.invoice.cost_center;
    if (cc) {
      for (const r of records) {
        for (const line of r.lines) {
          // Tag expense + VAT lines, not the supplier credit line.
          if (line.debit > 0) {
            line.costCenter = line.costCenter ?? cc;
          }
        }
        r.notes.push(`מרכז עלות: ${cc}`);
      }
      warnings.push(
        `מרכז עלות "${cc}" שמור בשורות; ייצוא יעבור אוטומטית לפורמט FLEXIBLE.`,
      );
    }
  }

  if (overlays.includes('DIFFERENT_DATES')) {
    for (const r of records) {
      r.notes.push(`תאריך ערך (${r.valueDate}) שונה מתאריך החשבונית (${r.documentDate}).`);
    }
  }

  if (overlays.includes('WITH_DISCOUNT')) {
    const discount = invoice.totals.discount_amount;
    if (discount) {
      for (const r of records) {
        r.notes.push(`הנחה מסחרית: ${discount.toFixed(2)} ₪ (כבר מקופלת בסכומים).`);
      }
    }
  }
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

/**
 * MULTI_EXPENSE — invoice has multiple expense categories (e.g. raw materials
 * + services in one supplier invoice). Each category goes to a different
 * expense account. In 180-format this requires N records sharing the same
 * reference1 so Priority links them; FLEXIBLE format would allow a single
 * record with N+1 lines.
 *
 * One record per split. Each:
 *   DR  split.account            split.amount
 *   DR  vat_input                 split.amount × vat_share
 *   CR  supplier                  split.amount + vat_share
 *
 * VAT is allocated proportionally across splits.
 */
function buildMultiExpense(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord[] {
  const splits = invoice.invoice.expense_splits ?? [];
  if (splits.length < 2) {
    warnings.push(
      'MULTI_EXPENSE: פחות משני פיצולים — נופל ל-STANDARD. הוסף פיצולים בטופס החשבונית.',
    );
    return [buildStandard(invoice, config, 'MULTI_EXPENSE')];
  }

  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const totalVat = vatFromTotals(invoice);
  const splitsSum = splits.reduce((s, sp) => s + sp.amount, 0);

  if (Math.abs(splitsSum - subtotal) > 0.05) {
    warnings.push(
      `MULTI_EXPENSE: סך פיצולי ההוצאה (${splitsSum.toFixed(2)}) ≠ סכום הביניים (${subtotal.toFixed(2)}). ערוך ידנית או תקן את הפיצולים.`,
    );
  }

  const reference1 = invoice.invoice.number;
  const supplier = invoice.supplier.internal_code_priority;
  const records: JERecord[] = [];

  // Distribute VAT proportionally; rounding remainder goes to last split.
  let vatRemaining = totalVat;
  const baseHeader = {
    reference1,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    transactionType: config.transactionType,
    scenario: 'MULTI_EXPENSE' as const,
  };

  splits.forEach((split, i) => {
    const isLast = i === splits.length - 1;
    const portionVat = isLast
      ? vatRemaining
      : roundCents((split.amount / subtotal) * totalVat);
    vatRemaining = roundCents(vatRemaining - portionVat);
    const portionTotal = roundCents(split.amount + portionVat);

    const lines: JELine[] = [
      {
        account: split.account,
        debit: split.amount,
        credit: 0,
        ...(split.cost_center ? { costCenter: split.cost_center } : {}),
        ...(split.label ? { details: split.label } : {}),
      },
      { account: config.vatInputAccount, debit: portionVat, credit: 0 },
      { account: supplier, debit: 0, credit: portionTotal },
    ];

    records.push({
      ...baseHeader,
      details: `${detailsString(invoice, config)} (${i + 1}/${splits.length}${
        split.label ? ` ${split.label}` : ''
      })`,
      recordIndex: i,
      lines,
      notes: [
        `חלק ${i + 1} מתוך ${splits.length}: ${split.amount.toFixed(2)} ₪${
          split.label ? ` — ${split.label}` : ''
        }`,
      ],
    });
  });

  // Sanity check: across all records, supplier credit total = invoice total
  const totalSupplierCredit = records.reduce(
    (s, r) =>
      s +
      r.lines
        .filter((l) => l.account === supplier)
        .reduce((s2, l) => s2 + l.credit, 0),
    0,
  );
  if (Math.abs(totalSupplierCredit - total) > 0.05) {
    warnings.push(
      `MULTI_EXPENSE: סך הזכות לספק על פני הרשומות (${totalSupplierCredit.toFixed(2)}) ≠ סך החשבונית (${total.toFixed(2)}). בדוק עיגולים.`,
    );
  }

  return records;
}

/**
 * WITH_COST_CENTER — same 3-line structure as STANDARD but each expense /
 * VAT line gets the cost-center tag. The 180-format does NOT have a
 * cost-center field, so the JE is built but flagged for FLEXIBLE export.
 */
function buildWithCostCenter(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  costCenter: string,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  if (!costCenter) {
    warnings.push('WITH_COST_CENTER: לא צוין מרכז עלות — JE נבנה כסטנדרטי.');
  }

  const lines: JELine[] = [
    {
      account: config.expenseAccount,
      debit: subtotal,
      credit: 0,
      ...(costCenter ? { costCenter } : {}),
    },
    {
      account: config.vatInputAccount,
      debit: vat,
      credit: 0,
      ...(costCenter ? { costCenter } : {}),
    },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: total,
    },
  ];

  warnings.push(
    `מרכז עלות "${costCenter}" שמור בשורות ה-JE; פורמט 180 אינו כולל שדה מרכז עלות. ייצוא ידרוש FLEXIBLE format (יתווסף בשלב הבא) — בינתיים מרכז העלות נשמר ב-DB ובפרטים.`,
  );

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `${detailsString(invoice, config)}${costCenter ? ` [${costCenter}]` : ''}`,
    transactionType: config.transactionType,
    scenario: 'WITH_COST_CENTER',
    recordIndex: 0,
    lines,
    notes: costCenter ? [`מרכז עלות: ${costCenter}`] : [],
  };
}

/**
 * SELF_INVOICE (חשבונית עצמית) — Israeli business buying a service from a
 * non-Israeli supplier. The buyer reports VAT both as input AND output
 * (net effect zero, but reflected in PCN874 as both תשומות + עסקאות).
 *
 *   DR  expense                       subtotal
 *   DR  vat_input                     vat
 *   CR  vat_output                    vat       (offset — Israeli VAT obligation)
 *   CR  supplier (foreign)            subtotal  (no VAT to supplier — they are not Israeli)
 *
 * Net: expense recognized, supplier owed `subtotal`, VAT washes out.
 * 4-line JE — fits 180-format (2 DR + 2 CR).
 */
function buildSelfInvoice(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const vat = vatFromTotals(invoice);

  if (!config.outputVatAccount) {
    warnings.push(
      'SELF_INVOICE: לא הוגדר חשבון מע"מ עסקאות בהגדרות החברה — נבחר 220-0 כברירת מחדל.',
    );
  }
  const outputVatAcct = config.outputVatAccount ?? '220-0';

  const lines: JELine[] = [
    { account: config.expenseAccount, debit: subtotal, credit: 0 },
    { account: config.vatInputAccount, debit: vat, credit: 0 },
    { account: outputVatAcct, debit: 0, credit: vat },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: subtotal,
    },
  ];

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `${detailsString(invoice, config)} (חשבונית עצמית)`,
    transactionType: config.transactionType,
    scenario: 'SELF_INVOICE',
    recordIndex: 0,
    lines,
    notes: [
      'חשבונית עצמית — שירות מספק זר עם מע"מ ישראלי',
      `תשומות + עסקאות: ${vat.toFixed(2)} ₪ (השפעה נטו על מס: 0)`,
      'לכלול בדיווח PCN874 הן בתשומות והן בעסקאות',
    ],
  };
}

/**
 * PRIVATE_SUPPLIER (יחיד בלי ע.מ) — Individual without a business tax id.
 * Israeli law typically mandates 30% withholding for such suppliers (subject
 * to confirmation per supplier — 47% on undeclared, 0% with valid אישור).
 *
 *   DR  expense                       subtotal     (no VAT — individual ≠ עוסק)
 *   CR  supplier                      subtotal × (100-w%)/100
 *   CR  withholding (175-0)           subtotal × w%/100
 *
 * 3-line JE. No VAT line — individuals not registered for VAT cannot issue
 * a tax invoice (חשבונית מס) so their "invoice" is a קבלה / receipt.
 */
function buildPrivateSupplier(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;

  if (Math.abs(total - subtotal) > 0.05) {
    warnings.push(
      `PRIVATE_SUPPLIER: סך הכול (${total.toFixed(2)}) שונה מסכום הביניים (${subtotal.toFixed(2)}) — ספק פרטי אינו רשאי לגבות מע"מ; בדוק את החשבונית.`,
    );
  }

  const withholdingPercent =
    invoice.invoice.withholding_percent ??
    config.privateSupplierWithholdingPercent ??
    30;
  const withholdingAmount = roundCents((subtotal * withholdingPercent) / 100);
  const supplierCredit = roundCents(subtotal - withholdingAmount);

  if (!config.withholdingAccount) {
    warnings.push(
      'PRIVATE_SUPPLIER: לא הוגדר חשבון רשות המסים — ניכוי במקור לא יישלח לחשבון ספציפי. נבחר 175-0 כברירת מחדל.',
    );
  }
  const withholdingAcct = config.withholdingAccount ?? '175-0';

  const lines: JELine[] = [
    { account: config.expenseAccount, debit: subtotal, credit: 0 },
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
    details: `${detailsString(invoice, config)} (יחיד · ניכוי ${withholdingPercent}%)`,
    transactionType: config.transactionType,
    scenario: 'PRIVATE_SUPPLIER',
    recordIndex: 0,
    lines,
    notes: [
      `ספק פרטי (יחיד בלי ע.מ) — אין מע"מ`,
      `סך לתשלום לספק: ${supplierCredit.toFixed(2)} ₪`,
      `ניכוי במקור (${withholdingPercent}%): ${withholdingAmount.toFixed(2)} ₪ → רשות המסים`,
    ],
  };
}

/**
 * PREPAID (הוצאה לתקופות) — Annual insurance, prepaid rent, etc. Goes to a
 * prepaid asset account at payment, recognized into expense monthly over
 * the period. This builder produces ONLY the entry-side JE (DR prepaid /
 * CR supplier). The monthly recognition entries (DR expense / CR prepaid)
 * are scheduled separately.
 *
 *   DR  prepaid_expense (asset)       subtotal
 *   DR  vat_input                     vat
 *   CR  supplier                      total
 */
function buildPrepaid(
  invoice: CanonicalInvoice,
  config: ConstructorConfig,
  warnings: string[],
): JERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);
  const months = invoice.invoice.prepaid_period_months ?? 1;

  if (!config.prepaidExpenseAccount) {
    warnings.push(
      'PREPAID: לא הוגדר חשבון "הוצאות מראש" בהגדרות החברה — נבחר 102-0 כברירת מחדל.',
    );
  }
  const prepaidAcct = config.prepaidExpenseAccount ?? '102-0';

  const lines: JELine[] = [
    { account: prepaidAcct, debit: subtotal, credit: 0 },
    { account: config.vatInputAccount, debit: vat, credit: 0 },
    {
      account: invoice.supplier.internal_code_priority,
      debit: 0,
      credit: total,
    },
  ];

  const monthlyRecognition = roundCents(subtotal / months);

  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: `${detailsString(invoice, config)} (פרוס ${months} חוד׳)`,
    transactionType: config.transactionType,
    scenario: 'PREPAID',
    recordIndex: 0,
    lines,
    notes: [
      `הוצאה מוכרת על פני ${months} חודשים`,
      `הכרה חודשית: ${monthlyRecognition.toFixed(2)} ₪`,
      'JE הכרה חודשית (DR הוצאה / CR הוצאות מראש) ייווצרו בנפרד — בקרוב',
    ],
  };
}
