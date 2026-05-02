export type ValidationErrorCode =
  | 'TOTALS_INCONSISTENT'
  | 'VAT_RATE_MISMATCH'
  | 'VAT_AMOUNT_MISMATCH'
  | 'EXPENSE_ACCOUNT_NOT_FOUND'
  | 'VAT_ACCOUNT_NOT_FOUND'
  | 'SUPPLIER_ACCOUNT_NOT_FOUND'
  | 'SUPPLIER_UNKNOWN'
  | 'DATE_OUT_OF_RANGE'
  | 'ALLOCATION_REQUIRED'
  | 'DUPLICATE_INVOICE'
  | 'INVALID_CURRENCY';

export type ValidationWarningCode =
  | 'VAT_RATE_DEVIATION'
  | 'DATE_FAR_PAST'
  | 'DATE_FUTURE'
  | 'OCR_LOW_CONFIDENCE'
  | 'ALLOCATION_FORMAT_UNUSUAL'
  | 'ALLOCATION_NUMBER_NOT_VERIFIED'
  | 'NON_ILS_CURRENCY';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  messageHe: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  messageHe: string;
  field?: string;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationContext {
  companyId: string;
  expenseAccount: string;
  vatInputAccount: string;
  knownAccounts: ReadonlySet<string>;
  knownSupplierCodes: ReadonlySet<string>;
  knownInvoiceFingerprints?: ReadonlySet<string>;
  ocrConfidenceThreshold?: number;
  todayIso?: string;
  pastWindowDays?: number;
  futureWindowDays?: number;
  roundingTolerance?: number;
}
