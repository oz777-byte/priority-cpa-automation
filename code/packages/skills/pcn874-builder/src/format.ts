/**
 * PCN874 record builders.
 *
 * Layout overview (per Sha'am public docs — verify before submission):
 *
 *  - Header record (type "O" / "1") — one per file:
 *      pos 1     : record type
 *      pos 2-10  : עוסק VAT ID (9 digits, right-padded with zeros)
 *      pos 11-16 : period YYYYMM
 *      pos 17-22 : generation date YYYYMMDD (truncated)
 *      pos ...   : counts + totals (see header builder)
 *
 *  - Detail records — one per transaction:
 *      type "S1" sale, "S2" sale to registered, "L" other income,
 *      type "T"  input invoice, "Y" fixed-asset input, "I" import,
 *      type "M"  petty/cash aggregation
 *      pos 2-10  : counterparty VAT ID (or zeros for petty)
 *      pos 11-16 : invoice date YYYYMMDD (compact)
 *      pos ...   : invoice number, allocation, subtotal, vat
 *
 *  - Trailer record (type "X" / "9"):
 *      total counts + grand totals + checksum
 *
 * All numeric fields are right-aligned, zero-padded (no decimal point —
 * amounts are in agorot × 100 → integer). Hebrew text fields are
 * Windows-1255 encoded, left-aligned, space-padded.
 */

import type { Pcn874Transaction } from './types.js';

const PAD = ' ';

/** Right-align number, zero-pad to fixed width. */
export function padN(n: number, width: number): string {
  const s = String(Math.abs(Math.trunc(n)));
  if (s.length > width) {
    throw new Error(`Numeric overflow: ${n} exceeds ${width} digits`);
  }
  return s.padStart(width, '0');
}

/** Left-align text, space-pad / truncate to fixed width. */
export function padT(value: string | undefined | null, width: number): string {
  const s = (value ?? '').toString();
  if (s.length >= width) return s.slice(0, width);
  return s + PAD.repeat(width - s.length);
}

/** Convert ILS amount to agorot integer (× 100, rounded). */
export function agorot(amount: number): number {
  return Math.round(amount * 100);
}

/** Compact YYYYMMDD from ISO date "YYYY-MM-DD". */
export function compactDate(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8);
}

/* ─────────────────────── Record builders ─────────────────────── */

export interface HeaderInput {
  vatId: string;       // 9 digits
  year: number;        // 2024+
  month: number;       // 1..12
  totalSalesCount: number;
  totalInputsCount: number;
  totalSalesVat: number;     // ₪ (positive)
  totalInputsVat: number;    // ₪ (positive)
  totalSalesSubtotal: number;
  totalInputsSubtotal: number;
}

export function buildHeader(h: HeaderInput): string {
  const period = `${h.year}${String(h.month).padStart(2, '0')}`;
  const today = new Date();
  const ymd =
    `${today.getUTCFullYear()}` +
    `${String(today.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(today.getUTCDate()).padStart(2, '0')}`;

  // Composite header: "O" + vat(9) + period(6) + gen_date(8) +
  //                   sales_count(7) + inputs_count(7) +
  //                   sales_vat(11) + inputs_vat(11) +
  //                   sales_subtotal(13) + inputs_subtotal(13) +
  //                   reserved space → total 90 chars.
  const fields = [
    'O',
    padN(Number(h.vatId), 9),
    period,
    ymd,
    padN(h.totalSalesCount, 7),
    padN(h.totalInputsCount, 7),
    padN(agorot(h.totalSalesVat), 11),
    padN(agorot(h.totalInputsVat), 11),
    padN(agorot(h.totalSalesSubtotal), 13),
    padN(agorot(h.totalInputsSubtotal), 13),
  ];
  return padT(fields.join(''), 90);
}

/* Detail record types — one per (input/sales) transaction. */

const INPUT_TYPE_CODE: Record<Pcn874Transaction['subType'], string> = {
  standard: 'T',
  asset: 'Y',
  import: 'I',
  petty: 'M',
  self: 'T',
};

const SALES_TYPE_CODE: Record<Pcn874Transaction['subType'], string> = {
  standard: 'S1',
  asset: 'S1',
  import: 'S1',
  petty: 'L',
  self: 'S1',
};

/** Sale record (record code S1/S2/L) — 80 chars. */
export function buildSaleRecord(t: Pcn874Transaction): string {
  const isRegistered = !!(t.counterpartyVatId && t.counterpartyVatId.length === 9);
  const typeCode =
    t.subType === 'petty'
      ? 'L'
      : isRegistered
        ? 'S2'
        : SALES_TYPE_CODE[t.subType];

  const fields = [
    padT(typeCode, 2),
    padN(Number(t.counterpartyVatId ?? '0'), 9),
    compactDate(t.documentDate),
    padT(t.referenceNumber, 9),
    padT(t.allocationNumber ?? '', 12),
    padN(agorot(t.subtotal), 11),
    padN(agorot(t.vat), 9),
  ];
  return padT(fields.join(''), 80);
}

/** Input record (T/Y/I/M) — 80 chars. */
export function buildInputRecord(t: Pcn874Transaction): string {
  const typeCode = INPUT_TYPE_CODE[t.subType];
  const fields = [
    padT(typeCode, 2),
    padN(Number(t.counterpartyVatId ?? '0'), 9),
    compactDate(t.documentDate),
    padT(t.referenceNumber, 9),
    padT(t.allocationNumber ?? '', 12),
    padN(agorot(t.subtotal), 11),
    padN(agorot(t.vat), 9),
  ];
  return padT(fields.join(''), 80);
}

/** Trailer record — 90 chars, code "X". */
export function buildTrailer(input: {
  totalRecords: number;
  totalVatToPay: number; // sales_vat - inputs_vat (signed)
}): string {
  const sign = input.totalVatToPay >= 0 ? '+' : '-';
  const fields = [
    'X',
    padN(input.totalRecords, 9),
    sign,
    padN(agorot(input.totalVatToPay), 12),
  ];
  return padT(fields.join(''), 90);
}
