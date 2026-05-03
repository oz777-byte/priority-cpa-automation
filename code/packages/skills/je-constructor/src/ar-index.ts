import type {
  SalesInvoice,
  SalesScenario,
} from '@priority-cpa/invoice-schema';
import { roundCents } from './helpers.js';
import type {
  ARConstructorConfig,
  ARConstructResult,
  ARJELine,
  ARJERecord,
} from './ar-types.js';

export type {
  ARConstructorConfig,
  ARConstructResult,
  ARJELine,
  ARJERecord,
} from './ar-types.js';

/**
 * Build a balanced AR (sales-side) JE from a sales invoice + company config.
 * Routes to the right scenario builder based on invoice fields.
 */
export function constructARJE(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
): ARConstructResult {
  const detected = detectARScenario(invoice);
  const warnings: string[] = [];
  const records = runBuilder(detected, invoice, config, warnings);

  return {
    primaryScenario: detected,
    records,
    warnings,
  };
}

/* ─── detector ─────────────────────────────────────────────────────── */

function detectARScenario(invoice: SalesInvoice): SalesScenario {
  const docType = invoice.invoice.document_type ?? 'tax_invoice';

  if (docType === 'credit_note') return 'AR_CREDIT_NOTE';
  if (docType === 'proforma') return 'AR_PROFORMA';
  if (docType === 'receipt') return 'AR_RECEIPT';
  if (docType === 'invoice_receipt') return 'AR_INVOICE_RECEIPT';

  // doc_type === 'tax_invoice' from here — primary picks based on flags
  if (invoice.invoice.bad_debt_original_invoice) return 'AR_BAD_DEBT';
  if (invoice.invoice.post_discount_original_invoice) return 'AR_POST_INVOICE_DISCOUNT';
  if (invoice.invoice.export_country) return 'AR_EXPORT';
  if (invoice.invoice.vat_exempt_reason) return 'AR_VAT_EXEMPT';
  if (invoice.invoice.currency !== 'ILS') return 'AR_FOREIGN_CURRENCY';
  if ((invoice.invoice.customer_withholding_percent ?? 0) > 0) {
    return 'AR_WITH_WITHHOLDING';
  }
  if (invoice.invoice.installments_count && invoice.invoice.installments_count > 1) {
    return 'AR_INSTALLMENTS';
  }
  if (invoice.invoice.payment_method === 'cash') return 'AR_CASH_SALE';
  if (invoice.invoice.payment_method === 'card') return 'AR_CARD_SALE';
  if (invoice.invoice.payment_method === 'check_postdated') return 'AR_POSTDATED_CHECK';

  return 'AR_STANDARD';
}

function runBuilder(
  scenario: SalesScenario,
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord[] {
  switch (scenario) {
    case 'AR_STANDARD':
      return [buildStandard(invoice, config)];
    case 'AR_INVOICE_RECEIPT':
      return [buildInvoiceReceipt(invoice, config, warnings)];
    case 'AR_PROFORMA':
      return [buildProforma(invoice, config, warnings)];
    case 'AR_RECEIPT':
      return [buildReceipt(invoice, config, warnings)];
    case 'AR_CREDIT_NOTE':
      return [buildCreditNote(invoice, config)];
    case 'AR_CASH_SALE':
      return [buildCashSale(invoice, config, warnings)];
    case 'AR_CARD_SALE':
      return [buildCardSale(invoice, config, warnings)];
    case 'AR_POSTDATED_CHECK':
      return [buildPostdatedCheck(invoice, config, warnings)];
    case 'AR_INSTALLMENTS':
      return [buildInstallments(invoice, config)];
    case 'AR_EXPORT':
      return [buildExport(invoice, config)];
    case 'AR_VAT_EXEMPT':
      return [buildVatExempt(invoice, config)];
    case 'AR_FOREIGN_CURRENCY':
      return [buildForeignCurrency(invoice, config, warnings)];
    case 'AR_WITH_WITHHOLDING':
      return [buildWithholding(invoice, config, warnings)];
    case 'AR_ADVANCE':
      return [buildAdvance(invoice, config, warnings)];
    case 'AR_BAD_DEBT':
      return [buildBadDebt(invoice, config, warnings)];
    case 'AR_POST_INVOICE_DISCOUNT':
      return [buildPostInvoiceDiscount(invoice, config, warnings)];
  }
}

/* ─── shared helpers ──────────────────────────────────────────────── */

function detailsString(invoice: SalesInvoice, config: ARConstructorConfig): string {
  return `${config.detailsPrefix} ${invoice.invoice.number}`;
}

function valueDateOf(invoice: SalesInvoice): string {
  return invoice.invoice.value_date ?? invoice.invoice.date;
}

function vatFromTotals(invoice: SalesInvoice): number {
  return roundCents(invoice.totals.total - invoice.totals.subtotal);
}

function baseHeader(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  scenario: SalesScenario,
): Omit<ARJERecord, 'lines' | 'notes' | 'recordIndex'> {
  return {
    reference1: invoice.invoice.number,
    documentDate: invoice.invoice.date,
    valueDate: valueDateOf(invoice),
    currency: invoice.invoice.currency,
    details: detailsString(invoice, config),
    transactionType: config.transactionType,
    scenario,
  };
}

/* ─── builders ────────────────────────────────────────────────────── */

/**
 * AR_STANDARD — חשבונית מס B2B
 *   DR  customer            total
 *   CR  revenue             subtotal
 *   CR  output_vat          vat
 */
function buildStandard(invoice: SalesInvoice, config: ARConstructorConfig): ARJERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [
    { account: invoice.customer.internal_code_priority, debit: total, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_STANDARD'),
    recordIndex: 0,
    lines,
    notes: [],
  };
}

/**
 * AR_INVOICE_RECEIPT — חשבונית מס-קבלה (combined invoice + receipt)
 *   DR  cash/bank/card      total
 *   CR  revenue             subtotal
 *   CR  output_vat          vat
 * No customer balance — paid in full at issuance.
 */
function buildInvoiceReceipt(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);
  const debitAccount = receiptDebitAccount(invoice, config, warnings);

  const lines: ARJELine[] = [
    { account: debitAccount, debit: total, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_INVOICE_RECEIPT'),
    recordIndex: 0,
    lines,
    notes: ['חשבונית מס-קבלה — תשלום התקבל מיד'],
  };
}

/**
 * AR_PROFORMA — חשבונית עסקה
 *   DR  customer            total
 *   CR  advances (liability) total
 * No revenue recognized yet — proforma is a quote/order, not a tax invoice.
 */
function buildProforma(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.advancesAccount) {
    warnings.push(
      'AR_PROFORMA: לא הוגדר חשבון מקדמות — נבחר 230-1 כברירת מחדל.',
    );
  }
  const advances = config.advancesAccount ?? '230-1';
  const total = invoice.totals.total;

  const lines: ARJELine[] = [
    { account: invoice.customer.internal_code_priority, debit: total, credit: 0 },
    { account: advances, debit: 0, credit: total },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_PROFORMA'),
    details: `הצעת מחיר ${invoice.invoice.number}`,
    recordIndex: 0,
    lines,
    notes: [
      'חשבונית עסקה — אינה חשבונית מס, אינה משחררת מע"מ',
      'הכנסה תוכר רק לאחר הוצאת חשבונית מס',
    ],
  };
}

/**
 * AR_RECEIPT — קבלה לחשבונית קיימת
 *   DR  cash/bank           total
 *   CR  customer            total
 * Doesn't change revenue, just clears AR.
 */
function buildReceipt(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  const total = invoice.totals.total;
  const debitAccount = receiptDebitAccount(invoice, config, warnings);

  const lines: ARJELine[] = [
    { account: debitAccount, debit: total, credit: 0 },
    { account: invoice.customer.internal_code_priority, debit: 0, credit: total },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_RECEIPT'),
    details: `קבלה ${invoice.invoice.number}`,
    recordIndex: 0,
    lines,
    notes: ['קבלה — סוגרת יתרה ללקוח'],
  };
}

/**
 * AR_CREDIT_NOTE — זיכוי לקוח
 *   DR  revenue             subtotal
 *   DR  output_vat          vat
 *   CR  customer            total
 * Reverses the original invoice's effect.
 */
function buildCreditNote(invoice: SalesInvoice, config: ARConstructorConfig): ARJERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [
    { account: config.revenueAccount, debit: subtotal, credit: 0 },
    { account: config.outputVatAccount, debit: vat, credit: 0 },
    { account: invoice.customer.internal_code_priority, debit: 0, credit: total },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_CREDIT_NOTE'),
    details: `זיכוי ${invoice.invoice.number}`,
    recordIndex: 0,
    lines,
    notes: ['זיכוי לקוח — מחזיר הכנסה ומע"מ עסקאות'],
  };
}

/**
 * AR_CASH_SALE — עסקה במזומן ישירה (no invoice number, just a receipt)
 *   DR  cash                total
 *   CR  revenue             subtotal
 *   CR  output_vat          vat
 */
function buildCashSale(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.cashAccount) {
    warnings.push('AR_CASH_SALE: לא הוגדר חשבון קופה — נבחר 100-0 כברירת מחדל.');
  }
  const cash = config.cashAccount ?? '100-0';
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [
    { account: cash, debit: total, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_CASH_SALE'),
    recordIndex: 0,
    lines,
    notes: ['מכירה במזומן — תשלום בקופה'],
  };
}

/**
 * AR_CARD_SALE — עסקה באשראי
 *   DR  card_clearing       total
 *   CR  revenue             subtotal
 *   CR  output_vat          vat
 * Card-clearing balance is moved to bank in a separate JE on settlement.
 */
function buildCardSale(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.cardClearingAccount) {
    warnings.push(
      'AR_CARD_SALE: לא הוגדר חשבון סולק אשראי — נבחר 125-0 כברירת מחדל.',
    );
  }
  const clearing = config.cardClearingAccount ?? '125-0';
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [
    { account: clearing, debit: total, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_CARD_SALE'),
    recordIndex: 0,
    lines,
    notes: [
      'מכירה באשראי — היתרה אצל סולק האשראי',
      'JE התחשבנות עם הסולק (בנק / סולק) ייווצר עם הכניסה לבנק',
    ],
  };
}

/**
 * AR_POSTDATED_CHECK — צ'ק דחוי (tax invoice but payment future-dated)
 *   DR  postdated_checks    total
 *   CR  revenue             subtotal
 *   CR  output_vat          vat
 * On the check's due date a separate JE moves balance to bank.
 */
function buildPostdatedCheck(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  const checks = config.postdatedChecksAccount ?? config.bankAccount;
  if (!checks) {
    warnings.push(
      'AR_POSTDATED_CHECK: לא הוגדר חשבון צ\'קים לגבייה — נבחר 122-0 כברירת מחדל.',
    );
  }
  const targetAccount = checks ?? '122-0';
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [
    { account: targetAccount, debit: total, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_POSTDATED_CHECK'),
    recordIndex: 0,
    lines,
    notes: ['צ\'ק דחוי — בעת פירעון, JE העברה מצ\'קים לגבייה לבנק'],
  };
}

/**
 * AR_INSTALLMENTS — single tax invoice, payment in N installments
 *   Initial JE: same as AR_STANDARD (DR customer / CR revenue + VAT)
 *   Each installment: AR_RECEIPT (DR bank / CR customer) — created later
 *
 * Builder produces ONLY the initial JE; receipt entries are scheduled.
 */
function buildInstallments(invoice: SalesInvoice, config: ARConstructorConfig): ARJERecord {
  const base = buildStandard(invoice, config);
  const n = invoice.invoice.installments_count ?? 1;
  const monthly = roundCents(invoice.totals.total / n);
  return {
    ...base,
    scenario: 'AR_INSTALLMENTS',
    notes: [
      `תשלומים: ${n}`,
      `סכום חודשי: ${monthly.toFixed(2)} ₪`,
      'JE קבלה לכל תשלום ייווצרו לפי לוח הזמנים',
    ],
  };
}

/**
 * AR_EXPORT — 0% VAT export sale
 *   DR  customer            subtotal (== total)
 *   CR  revenue             subtotal
 * No VAT line. Reportable to PCN874 as עסקה בשיעור 0.
 */
function buildExport(invoice: SalesInvoice, config: ARConstructorConfig): ARJERecord {
  const subtotal = invoice.totals.subtotal;

  const lines: ARJELine[] = [
    { account: invoice.customer.internal_code_priority, debit: subtotal, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_EXPORT'),
    details: `${detailsString(invoice, config)} (ייצוא ${invoice.invoice.export_country ?? ''})`.trim(),
    recordIndex: 0,
    lines,
    notes: [
      'ייצוא — מע"מ 0%',
      'לדווח ב-PCN874 כעסקה בשיעור אפס (שדה 0%)',
      'לדאוג למסמכי ייצוא (חשבונית הייצוא, רשימון מכס)',
    ],
  };
}

/**
 * AR_VAT_EXEMPT — exempt sale (אילת, תיירים, פטורי מע"מ)
 * Same JE shape as AR_EXPORT, but reported separately on PCN874.
 */
function buildVatExempt(invoice: SalesInvoice, config: ARConstructorConfig): ARJERecord {
  const subtotal = invoice.totals.subtotal;

  const lines: ARJELine[] = [
    { account: invoice.customer.internal_code_priority, debit: subtotal, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_VAT_EXEMPT'),
    details: `${detailsString(invoice, config)} (פטור מע"מ)`,
    recordIndex: 0,
    lines,
    notes: [
      `פטור ממע"מ — סיבה: ${invoice.invoice.vat_exempt_reason ?? '—'}`,
      'לדווח ב-PCN874 כעסקה פטורה ממע"מ',
    ],
  };
}

/**
 * AR_FOREIGN_CURRENCY — sale in USD/EUR/GBP
 *   DR  customer            total_ils  (and total_fx)
 *   CR  revenue             subtotal_ils  (and subtotal_fx)
 *   CR  output_vat          vat_ils  (and vat_fx)
 */
function buildForeignCurrency(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  const rate = invoice.invoice.fx_rate;
  if (!rate) {
    warnings.push(
      'AR_FOREIGN_CURRENCY: שער חליפין (fx_rate) לא צוין — נבחר 1.0 כברירת מחדל. ערוך ידנית.',
    );
  }
  const r = rate ?? 1.0;
  const subtotalFx = invoice.totals.subtotal;
  const totalFx = invoice.totals.total;
  const vatFx = vatFromTotals(invoice);
  const subtotalIls = roundCents(subtotalFx * r);
  const totalIls = roundCents(totalFx * r);
  const vatIls = roundCents(vatFx * r);

  const lines: ARJELine[] = [
    {
      account: invoice.customer.internal_code_priority,
      debit: totalIls,
      credit: 0,
      debitFx: totalFx,
    },
    {
      account: config.revenueAccount,
      debit: 0,
      credit: subtotalIls,
      creditFx: subtotalFx,
    },
    {
      account: config.outputVatAccount,
      debit: 0,
      credit: vatIls,
      creditFx: vatFx,
    },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_FOREIGN_CURRENCY'),
    details: `${detailsString(invoice, config)} (${invoice.invoice.currency} × ${r.toFixed(4)})`,
    recordIndex: 0,
    lines,
    notes: [
      `שער חליפין: ${r.toFixed(4)} (${invoice.invoice.currency} → ILS)`,
      'הפרשי שער ייווצרו בעת הגבייה',
    ],
  };
}

/**
 * AR_WITH_WITHHOLDING — customer (typically B2G) deducts withholding from your invoice.
 *   DR  customer (post-deduction)   total - withholding
 *   DR  customer_withholding        withholding   (asset — refundable on year-end)
 *   CR  revenue                     subtotal
 *   CR  output_vat                  vat
 *
 * 4 lines — fits 180-format (2 DR + 2 CR).
 */
function buildWithholding(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.customerWithholdingAccount) {
    warnings.push(
      'AR_WITH_WITHHOLDING: לא הוגדר חשבון "ניכוי ע"י לקוח" — נבחר 175-1 כברירת מחדל.',
    );
  }
  const withholdingAcct = config.customerWithholdingAccount ?? '175-1';
  const percent = invoice.invoice.customer_withholding_percent ?? 0;
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);
  const withholdingAmount = roundCents((subtotal * percent) / 100);
  const customerDebit = roundCents(total - withholdingAmount);

  const lines: ARJELine[] = [
    {
      account: invoice.customer.internal_code_priority,
      debit: customerDebit,
      credit: 0,
    },
    { account: withholdingAcct, debit: withholdingAmount, credit: 0 },
    { account: config.revenueAccount, debit: 0, credit: subtotal },
    { account: config.outputVatAccount, debit: 0, credit: vat },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_WITH_WITHHOLDING'),
    details: `${detailsString(invoice, config)} (ניכוי לקוח ${percent}%)`,
    recordIndex: 0,
    lines,
    notes: [
      `הלקוח מנכה ${percent}% במקור: ${withholdingAmount.toFixed(2)} ₪`,
      `סה"כ צפוי לקבל: ${customerDebit.toFixed(2)} ₪`,
      'הניכוי יוחזר משלטונות המס בשומה השנתית',
    ],
  };
}

/**
 * AR_ADVANCE — advance payment received before any invoice
 *   DR  bank/cash               amount
 *   CR  advances (liability)    amount
 * Becomes revenue when matched to a future tax invoice.
 */
function buildAdvance(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.advancesAccount) {
    warnings.push('AR_ADVANCE: לא הוגדר חשבון מקדמות — נבחר 230-1 כברירת מחדל.');
  }
  const advances = config.advancesAccount ?? '230-1';
  const debitAccount = receiptDebitAccount(invoice, config, warnings);
  const total = invoice.totals.total;

  const lines: ARJELine[] = [
    { account: debitAccount, debit: total, credit: 0 },
    { account: advances, debit: 0, credit: total },
  ];

  return {
    ...baseHeader(invoice, config, 'AR_ADVANCE'),
    details: `מקדמה מ-${invoice.customer.name}`,
    recordIndex: 0,
    lines,
    notes: [
      'מקדמה — אינה הכנסה. תוכר עם הוצאת חשבונית מס',
      'מע"מ עסקאות יחושב בעת הוצאת החשבונית, לא כעת',
    ],
  };
}

/**
 * AR_BAD_DEBT — write off uncollectible customer balance + recover VAT.
 *
 * Per סעיף 39א לחוק מע"מ: when a customer debt becomes bad, the dealer can
 * claim back the output VAT they previously paid. The JE reverses both the
 * receivable AND the output VAT liability:
 *
 *   DR  bad_debt_expense     subtotal      (the actual economic loss)
 *   DR  output_vat           vat           (claim back from authority via 874)
 *   CR  customer             total         (clear the full receivable)
 *
 * The DR to output VAT reduces the company's VAT-payable liability in the
 * current PCN874 — effectively a VAT refund. Eligibility window is up to
 * 3 years from the original invoice date (per regulation).
 *
 * If invoice is exempt/zero-rate (no VAT), falls back to single-VAT-line write-off.
 */
function buildBadDebt(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  if (!config.badDebtAccount) {
    warnings.push('AR_BAD_DEBT: לא הוגדר חשבון "חובות אבודים" — נבחר 530-0 כברירת מחדל.');
  }
  const badDebt = config.badDebtAccount ?? '530-0';
  const total = invoice.totals.total;
  const subtotal = invoice.totals.subtotal;
  const vat = vatFromTotals(invoice);

  const lines: ARJELine[] = [];

  if (vat > 0) {
    // Standard taxable invoice — recover output VAT (סעיף 39א).
    lines.push(
      { account: badDebt, debit: subtotal, credit: 0 },
      { account: config.outputVatAccount, debit: vat, credit: 0 },
      { account: invoice.customer.internal_code_priority, debit: 0, credit: total },
    );
  } else {
    // Exempt or zero-rate invoice — no VAT to recover, just the receivable.
    lines.push(
      { account: badDebt, debit: total, credit: 0 },
      { account: invoice.customer.internal_code_priority, debit: 0, credit: total },
    );
  }

  return {
    ...baseHeader(invoice, config, 'AR_BAD_DEBT'),
    details: `חוב אבוד — חשבונית ${invoice.invoice.bad_debt_original_invoice ?? invoice.invoice.number}`,
    recordIndex: 0,
    lines,
    notes: [
      `חוב אבוד מ-${invoice.customer.name}: ${total.toFixed(2)} ₪`,
      ...(vat > 0
        ? [
            `החזר מע"מ עסקאות (סעיף 39א): ${vat.toFixed(2)} ₪ — יקוזז ב-PCN874 הקרוב`,
            'תנאי לזכאות: עד 3 שנים מהחשבונית, חוב נדרש בפועל ולא נגבה',
          ]
        : ['חשבונית פטורה — אין מע"מ להשבה']),
    ],
  };
}

/**
 * AR_POST_INVOICE_DISCOUNT — הנחה לאחר הפקת חשבונית.
 *
 * Use case: a customer was already invoiced, then later receives a discount
 * (settlement, goodwill, late payment incentive). Different from a credit
 * note (which fully reverses an invoice) — this is a partial reduction.
 *
 *   DR  revenue              discount_subtotal     (reduce revenue)
 *   DR  output_vat           discount_vat          (reduce output VAT liability)
 *   CR  customer             discount_total        (reduce customer balance)
 *
 * The discount amount is the invoice's totals (subtotal + vat = total).
 * For income tax: revenue is reduced. For VAT: output VAT is reduced
 * (will reflect in the next PCN874).
 *
 * Note: this is similar in shape to CREDIT_NOTE but logically distinct —
 * the original invoice stays valid, only the amount is adjusted.
 */
function buildPostInvoiceDiscount(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): ARJERecord {
  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = vatFromTotals(invoice);

  if (subtotal <= 0) {
    warnings.push(
      'AR_POST_INVOICE_DISCOUNT: סכום הנחה אפס או שלילי — בדוק את החשבונית.',
    );
  }
  if (!invoice.invoice.post_discount_original_invoice) {
    warnings.push(
      'AR_POST_INVOICE_DISCOUNT: לא צוין מספר חשבונית מקורית — הזיכוי לא יתקשר חזרה לחשבונית.',
    );
  }

  const lines: ARJELine[] = [];

  // Revenue reduction (always — for taxable, this is the subtotal portion).
  lines.push({ account: config.revenueAccount, debit: subtotal, credit: 0 });

  // Output VAT reduction — only if there is VAT.
  if (vat > 0) {
    lines.push({ account: config.outputVatAccount, debit: vat, credit: 0 });
  }

  // Customer balance reduction.
  lines.push({
    account: invoice.customer.internal_code_priority,
    debit: 0,
    credit: total,
  });

  return {
    ...baseHeader(invoice, config, 'AR_POST_INVOICE_DISCOUNT'),
    details: `הנחה לאחר חשבונית — ${invoice.invoice.post_discount_original_invoice ?? invoice.invoice.number}`,
    recordIndex: 0,
    lines,
    notes: [
      `הנחה ללקוח ${invoice.customer.name}: ${total.toFixed(2)} ₪`,
      `החזר מע"מ עסקאות: ${vat.toFixed(2)} ₪ — יקוזז אוטומטית ב-PCN874`,
      'החשבונית המקורית נשארת בתוקף — רק הסכום הופחת',
    ],
  };
}

/* ─── helpers used by multiple builders ───────────────────────────── */

function receiptDebitAccount(
  invoice: SalesInvoice,
  config: ARConstructorConfig,
  warnings: string[],
): string {
  switch (invoice.invoice.payment_method) {
    case 'cash':
      if (!config.cashAccount)
        warnings.push('payment_method=cash אך אין cashAccount — נבחר 100-0.');
      return config.cashAccount ?? '100-0';
    case 'card':
      if (!config.cardClearingAccount)
        warnings.push('payment_method=card אך אין cardClearingAccount — נבחר 125-0.');
      return config.cardClearingAccount ?? '125-0';
    case 'check_postdated':
      return config.postdatedChecksAccount ?? config.bankAccount ?? '122-0';
    case 'transfer':
    case 'credit':
    default:
      if (!config.bankAccount)
        warnings.push('אין bankAccount מוגדר — נבחר 121-0.');
      return config.bankAccount ?? '121-0';
  }
}
