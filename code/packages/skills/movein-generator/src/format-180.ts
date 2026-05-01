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

  const fields: readonly string[] = [
    alphaLeft(config.transactionType, 3),    // 1-3
    numericLong(invoiceNum, 5),              // 4-8
    toDdmmyy(isoDate),                       // 9-14
    numericLong(0, 5),                       // 15-19
    toDdmmyy(isoDate),                       // 20-25
    alphaLeft(config.currency, 3),           // 26-28
    alphaLeft(details, 22),                  // 29-50
    alphaLeft(config.expenseAccount, 8),     // 51-58
    alphaLeft(config.vatInputAccount, 8),    // 59-66
    alphaLeft(supplierAcct, 8),              // 67-74
    alphaLeft('', 8),                        // 75-82
    decimal92(subtotal),                     // 83-94
    decimal92(vat),                          // 95-106
    decimal92(total),                        // 107-118
    decimal92(0),                            // 119-130
    decimal92(0),                            // 131-142
    decimal92(0),                            // 143-154
    decimal92(0),                            // 155-166
    decimal92(0),                            // 167-178
  ];
  const record = fields.join('');
  if (record.length !== RECORD_LENGTH) {
    throw new Error(`record length ${record.length} ≠ ${RECORD_LENGTH}`);
  }
  return record;
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
