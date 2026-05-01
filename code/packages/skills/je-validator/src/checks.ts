import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';
import {
  getStandardVatRate,
  isAllocationRequired,
  reconcileRounding,
  RoundingMismatchError,
  DEFAULT_ROUNDING_TOLERANCE,
} from '@priority-cpa/israeli-vat-logic';
import { invoiceFingerprint } from './fingerprint.js';
import type {
  ValidationContext,
  ValidationError,
  ValidationWarning,
} from './types.js';

const DAY_MS = 86_400_000;
const DEFAULT_PAST_WINDOW = 365;
const DEFAULT_FUTURE_WINDOW = 30;
const DEFAULT_OCR_THRESHOLD = 0.8;

function pushError(errors: ValidationError[], err: ValidationError): void {
  errors.push(err);
}
function pushWarning(warnings: ValidationWarning[], w: ValidationWarning): void {
  warnings.push(w);
}

export function checkTotalsConsistent(
  invoice: CanonicalInvoice,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  tolerance: number,
): void {
  const stated = {
    subtotal: invoice.totals.subtotal,
    vat: invoice.totals.vat_amount ?? invoice.totals.total - invoice.totals.subtotal,
    total: invoice.totals.total,
  };
  try {
    const reconciled = reconcileRounding(stated, tolerance);
    if (Math.abs(reconciled.adjustment) > 0.0001) {
      pushWarning(warnings, {
        code: 'VAT_RATE_DEVIATION',
        message: `VAT auto-reconciled by ${reconciled.adjustment.toFixed(2)} ILS (within tolerance).`,
        messageHe: `מע"מ הותאם אוטומטית בסכום ${reconciled.adjustment.toFixed(2)} ש"ח (בתוך טולרנס).`,
        field: 'totals.vat_amount',
      });
    }
  } catch (e) {
    if (e instanceof RoundingMismatchError) {
      pushError(errors, {
        code: 'TOTALS_INCONSISTENT',
        message: `subtotal+VAT does not match total beyond tolerance: ${e.message}`,
        messageHe: `סכום ביניים + מע"מ לא תואם לסך הכול מעבר לטולרנס המותר`,
        field: 'totals',
        suggestion: 'Re-OCR the invoice or correct totals manually.',
      });
    } else {
      throw e;
    }
  }
}

export function checkVatRateMatchesDate(
  invoice: CanonicalInvoice,
  errors: ValidationError[],
): void {
  const declared = invoice.totals.vat_rate;
  if (declared === undefined) return;
  const expected = getStandardVatRate(invoice.invoice.date);
  if (Math.abs(declared - expected) >= 0.5) {
    pushError(errors, {
      code: 'VAT_RATE_MISMATCH',
      message: `VAT rate ${declared}% does not match expected ${expected}% for date ${invoice.invoice.date}`,
      messageHe: `שיעור מע"מ ${declared}% אינו תואם לשיעור הצפוי ${expected}% עבור תאריך ${invoice.invoice.date}`,
      field: 'totals.vat_rate',
    });
  }
}

export function checkAccountsConfigured(
  invoice: CanonicalInvoice,
  ctx: ValidationContext,
  errors: ValidationError[],
): void {
  if (ctx.knownAccounts.size === 0) return;
  if (!ctx.knownAccounts.has(ctx.expenseAccount)) {
    pushError(errors, {
      code: 'EXPENSE_ACCOUNT_NOT_FOUND',
      message: `Configured expense account "${ctx.expenseAccount}" not in chart of accounts`,
      messageHe: `חשבון ההוצאה "${ctx.expenseAccount}" לא נמצא בכרטסת`,
      field: 'config.expenseAccount',
    });
  }
  if (!ctx.knownAccounts.has(ctx.vatInputAccount)) {
    pushError(errors, {
      code: 'VAT_ACCOUNT_NOT_FOUND',
      message: `Configured VAT-input account "${ctx.vatInputAccount}" not in chart of accounts`,
      messageHe: `חשבון מע"מ תשומות "${ctx.vatInputAccount}" לא נמצא בכרטסת`,
      field: 'config.vatInputAccount',
    });
  }
  const sup = invoice.supplier.internal_code_priority;
  if (!ctx.knownAccounts.has(sup)) {
    pushError(errors, {
      code: 'SUPPLIER_ACCOUNT_NOT_FOUND',
      message: `Supplier account "${sup}" not in chart of accounts`,
      messageHe: `חשבון הספק "${sup}" לא נמצא בכרטסת`,
      field: 'supplier.internal_code_priority',
    });
  }
}

export function checkSupplierKnown(
  invoice: CanonicalInvoice,
  ctx: ValidationContext,
  errors: ValidationError[],
): void {
  if (ctx.knownSupplierCodes.size === 0) return;
  const sup = invoice.supplier.internal_code_priority;
  if (!ctx.knownSupplierCodes.has(sup)) {
    pushError(errors, {
      code: 'SUPPLIER_UNKNOWN',
      message: `Supplier code "${sup}" not in supplier master`,
      messageHe: `קוד ספק "${sup}" לא נמצא במאסטר ספקים`,
      field: 'supplier.internal_code_priority',
      suggestion: 'Add the supplier or run supplier-matcher.',
    });
  }
}

export function checkDatePlausibility(
  invoice: CanonicalInvoice,
  ctx: ValidationContext,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const today = ctx.todayIso ?? new Date().toISOString().slice(0, 10);
  const pastWindow = ctx.pastWindowDays ?? DEFAULT_PAST_WINDOW;
  const futureWindow = ctx.futureWindowDays ?? DEFAULT_FUTURE_WINDOW;
  const docTime = Date.parse(`${invoice.invoice.date}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(docTime) || Number.isNaN(todayTime)) {
    pushError(errors, {
      code: 'DATE_OUT_OF_RANGE',
      message: `unparseable date: invoice=${invoice.invoice.date} today=${today}`,
      messageHe: 'תאריך החשבונית לא ניתן לפענוח',
      field: 'invoice.date',
    });
    return;
  }
  const deltaDays = (docTime - todayTime) / DAY_MS;
  if (deltaDays > futureWindow) {
    pushError(errors, {
      code: 'DATE_OUT_OF_RANGE',
      message: `invoice date ${invoice.invoice.date} is more than ${futureWindow} days in the future`,
      messageHe: `תאריך החשבונית ${invoice.invoice.date} רחוק מדי בעתיד`,
      field: 'invoice.date',
    });
  } else if (deltaDays > 0) {
    pushWarning(warnings, {
      code: 'DATE_FUTURE',
      message: `invoice date ${invoice.invoice.date} is in the future`,
      messageHe: `תאריך החשבונית ${invoice.invoice.date} בעתיד`,
      field: 'invoice.date',
    });
  } else if (-deltaDays > pastWindow) {
    pushWarning(warnings, {
      code: 'DATE_FAR_PAST',
      message: `invoice date ${invoice.invoice.date} is more than ${pastWindow} days old`,
      messageHe: `תאריך החשבונית ${invoice.invoice.date} ישן יותר משנה`,
      field: 'invoice.date',
    });
  }
}

export function checkAllocation(
  invoice: CanonicalInvoice,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const required = isAllocationRequired(invoice.totals.subtotal, invoice.invoice.date);
  const allocation = invoice.invoice.allocation_number;
  if (required && !allocation) {
    pushError(errors, {
      code: 'ALLOCATION_REQUIRED',
      message: `invoice over allocation threshold for ${invoice.invoice.date} but no allocation_number provided`,
      messageHe: 'חשבונית מעל רף ההקצאה — חובה לציין מספר הקצאה',
      field: 'invoice.allocation_number',
      suggestion: 'Request the allocation number from the supplier or the Tax Authority.',
    });
    return;
  }
  if (allocation) {
    if (allocation.length < 6 || allocation.length > 20) {
      pushWarning(warnings, {
        code: 'ALLOCATION_FORMAT_UNUSUAL',
        message: `allocation_number "${allocation}" has unusual length`,
        messageHe: 'אורך מספר הקצאה חריג',
        field: 'invoice.allocation_number',
      });
    }
    pushWarning(warnings, {
      code: 'ALLOCATION_NUMBER_NOT_VERIFIED',
      message: 'allocation number not yet verified against the Tax Authority API',
      messageHe: 'מספר ההקצאה טרם אומת מול רשות המסים (יתווסף ב-Phase 4)',
      field: 'invoice.allocation_number',
    });
  }
}

export function checkDuplicate(
  invoice: CanonicalInvoice,
  ctx: ValidationContext,
  errors: ValidationError[],
): void {
  if (!ctx.knownInvoiceFingerprints || ctx.knownInvoiceFingerprints.size === 0) return;
  const fp = invoiceFingerprint(invoice);
  if (ctx.knownInvoiceFingerprints.has(fp)) {
    pushError(errors, {
      code: 'DUPLICATE_INVOICE',
      message: `invoice already ingested (fingerprint: ${fp})`,
      messageHe: 'חשבונית זו כבר נטענה למערכת',
      field: 'invoice.number',
    });
  }
}

export function checkOcrConfidence(
  invoice: CanonicalInvoice,
  ctx: ValidationContext,
  warnings: ValidationWarning[],
): void {
  const conf = invoice.metadata?.ocr_confidence;
  if (conf === undefined) return;
  const threshold = ctx.ocrConfidenceThreshold ?? DEFAULT_OCR_THRESHOLD;
  if (conf < threshold) {
    warnings.push({
      code: 'OCR_LOW_CONFIDENCE',
      message: `OCR confidence ${(conf * 100).toFixed(0)}% below threshold ${(threshold * 100).toFixed(0)}%`,
      messageHe: `רמת ביטחון OCR ${(conf * 100).toFixed(0)}% מתחת לסף ${(threshold * 100).toFixed(0)}%`,
      field: 'metadata.ocr_confidence',
    });
  }
}

export function checkCurrency(
  invoice: CanonicalInvoice,
  warnings: ValidationWarning[],
): void {
  if (invoice.invoice.currency !== 'ILS') {
    warnings.push({
      code: 'NON_ILS_CURRENCY',
      message: `invoice in ${invoice.invoice.currency} — FX engine required`,
      messageHe: `חשבונית במטבע ${invoice.invoice.currency} — נדרש טיפול במט"ח`,
      field: 'invoice.currency',
    });
  }
}

export const _DEFAULTS = {
  pastWindow: DEFAULT_PAST_WINDOW,
  futureWindow: DEFAULT_FUTURE_WINDOW,
  ocrThreshold: DEFAULT_OCR_THRESHOLD,
  roundingTolerance: DEFAULT_ROUNDING_TOLERANCE,
};
