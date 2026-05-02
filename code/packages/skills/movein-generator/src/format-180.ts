import iconv from 'iconv-lite';
import { CanonicalInvoiceSchema, MoveInConfigSchema } from './types.js';
import type { CanonicalInvoice, MoveInConfig } from './types.js';

const RECORD_LENGTH = 178;
const LINE_LENGTH = 180;
const ENCODING = 'cp1255';

function alphaLeft(text: string, width: number): string {
  return text.slice(0, width).padEnd(width, ' ');
}

function numericLong(value: string | number, width: number): string {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`numericLong: not a finite integer: ${value}`);
  }
  let s = String(n);
  if (s.length > width) s = s.slice(-width);
  return s.padStart(width, ' ');
}

function decimal92(value: number, width = 12): string {
  if (!Number.isFinite(value)) {
    throw new Error(`decimal92: not finite: ${value}`);
  }
  return value.toFixed(2).padStart(width, ' ');
}

function toDdmmyy(isoDate: string): string {
  const parts = isoDate.split('-');
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) throw new Error(`invalid date: ${isoDate}`);
  return `${d}${m}${y.slice(-2)}`;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Raw 180-format record input — direct field-level control.
 * Use when building records from edited JE rows (post-CPA review).
 */
export interface MoveInRecordInput {
  transactionType: string;                       // 1-3
  reference1: string | number;                   // 4-8 — last 5 digits used
  reference2?: string | number | undefined;      // 15-19 — defaults to "    0"
  documentDate: string;                          // 9-14 — ISO YYYY-MM-DD
  valueDate: string;                             // 20-25 — ISO YYYY-MM-DD
  currency: string;                              // 26-28
  details: string;                               // 29-50 — truncated/padded to 22
  dr1Account: string;                            // 51-58
  dr2Account?: string | undefined;               // 59-66
  cr1Account: string;                            // 67-74
  cr2Account?: string | undefined;               // 75-82
  dr1Amount: number;                             // 83-94
  dr2Amount?: number | undefined;                // 95-106
  cr1Amount: number;                             // 107-118
  cr2Amount?: number | undefined;                // 119-130
  dr1AmountFx?: number | undefined;              // 131-142
  dr2AmountFx?: number | undefined;              // 143-154
  cr1AmountFx?: number | undefined;              // 155-166
  cr2AmountFx?: number | undefined;              // 167-178
}

export function buildRawRecord(input: MoveInRecordInput): string {
  const fields: readonly string[] = [
    alphaLeft(input.transactionType, 3),
    numericLong(input.reference1, 5),
    toDdmmyy(input.documentDate),
    numericLong(input.reference2 ?? 0, 5),
    toDdmmyy(input.valueDate),
    alphaLeft(input.currency, 3),
    alphaLeft(input.details, 22),
    alphaLeft(input.dr1Account, 8),
    alphaLeft(input.dr2Account ?? '', 8),
    alphaLeft(input.cr1Account, 8),
    alphaLeft(input.cr2Account ?? '', 8),
    decimal92(input.dr1Amount),
    decimal92(input.dr2Amount ?? 0),
    decimal92(input.cr1Amount),
    decimal92(input.cr2Amount ?? 0),
    decimal92(input.dr1AmountFx ?? 0),
    decimal92(input.dr2AmountFx ?? 0),
    decimal92(input.cr1AmountFx ?? 0),
    decimal92(input.cr2AmountFx ?? 0),
  ];
  const record = fields.join('');
  if (record.length !== RECORD_LENGTH) {
    throw new Error(`record length ${record.length} ≠ ${RECORD_LENGTH}`);
  }
  return record;
}

/**
 * High-level helper: build a record directly from a canonical invoice + a
 * company-level config. Used when no manual JE editing is required.
 */
export function buildRecord(rawInvoice: CanonicalInvoice, rawConfig: MoveInConfig): string {
  const invoice = CanonicalInvoiceSchema.parse(rawInvoice);
  const config = MoveInConfigSchema.parse(rawConfig);

  const subtotal = invoice.totals.subtotal;
  const total = invoice.totals.total;
  const vat = roundCents(total - subtotal);
  const supplierAcct = invoice.supplier.internal_code_priority;
  const invoiceNum = invoice.invoice.number;
  const isoDate = invoice.invoice.date;
  const details = `${config.detailsPrefix} ${invoiceNum}`;

  return buildRawRecord({
    transactionType: config.transactionType,
    reference1: invoiceNum,
    documentDate: isoDate,
    valueDate: isoDate,
    currency: config.currency,
    details,
    dr1Account: config.expenseAccount,
    dr1Amount: subtotal,
    dr2Account: config.vatInputAccount,
    dr2Amount: vat,
    cr1Account: supplierAcct,
    cr1Amount: total,
  });
}

export function generateMoveIn(invoices: CanonicalInvoice[], config: MoveInConfig): Buffer {
  if (invoices.length === 0) {
    throw new Error('generateMoveIn: at least one invoice required');
  }
  const text = invoices.map((inv) => buildRecord(inv, config) + '\r\n').join('');
  const buffer = iconv.encode(text, ENCODING);
  const expectedSize = invoices.length * LINE_LENGTH;
  if (buffer.length !== expectedSize) {
    throw new Error(`buffer size ${buffer.length} ≠ ${expectedSize} (expected ${LINE_LENGTH} bytes per invoice)`);
  }
  return buffer;
}

/**
 * Encode an array of pre-built 178-char records into a CP1255 Buffer with
 * CR+LF line endings (180 bytes per line).
 */
export function encodeMoveInBuffer(records: string[]): Buffer {
  if (records.length === 0) {
    throw new Error('encodeMoveInBuffer: at least one record required');
  }
  const text = records.map((r) => {
    if (r.length !== RECORD_LENGTH) {
      throw new Error(`record length ${r.length} ≠ ${RECORD_LENGTH}`);
    }
    return r + '\r\n';
  }).join('');
  const buffer = iconv.encode(text, ENCODING);
  const expectedSize = records.length * LINE_LENGTH;
  if (buffer.length !== expectedSize) {
    throw new Error(`buffer size ${buffer.length} ≠ ${expectedSize}`);
  }
  return buffer;
}
