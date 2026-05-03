/**
 * PCN874 input shape — built by the API route from journal_entries +
 * supplier/customer master data, then handed to `buildPcn874()`.
 *
 * Format reference: רשות המסים — מבנה קובץ דיווח מקוון (PCN874).
 *
 * NOTE: Field byte offsets in this implementation reflect the publicly
 * documented structure. Before submitting to Sha'am, verify against the
 * latest official spec — the authority occasionally revises layout.
 */

export interface Pcn874Input {
  vatId: string;             // ע.מ של המדווח (9 digits)
  year: number;              // 2024..
  month: number;             // 1..12 — single-month report
  /** Inputs (תשומות) — supplier-side invoices. */
  inputs: Pcn874Transaction[];
  /** Sales (עסקאות) — customer-side invoices + cash sales. */
  sales: Pcn874Transaction[];
  /** Optional override for record terminator — defaults to CR+LF. */
  lineTerminator?: '\r\n' | '\n';
}

export interface Pcn874Transaction {
  /** Counterparty tax ID. Required for non-petty registered transactions. */
  counterpartyVatId: string | null;
  /** ISO date of the document (YYYY-MM-DD). */
  documentDate: string;
  /** Document reference number. */
  referenceNumber: string;
  /** Allocation number (חוק 2024+) — optional. */
  allocationNumber?: string;
  /** Subtotal (לפני מע"מ) in ILS. */
  subtotal: number;
  /** VAT amount in ILS. */
  vat: number;
  /**
   * Sub-type indicator — distinguishes:
   * - 'standard' = regular invoice
   * - 'asset' = fixed-asset purchase (תשומות ציוד)
   * - 'import' = import (יבוא)
   * - 'petty' = petty/cash aggregation (no counterparty)
   * - 'self' = self-invoice (חשבונית עצמית)
   * Used to pick the correct PCN874 record type code.
   */
  subType: 'standard' | 'asset' | 'import' | 'petty' | 'self';
}

export interface Pcn874Result {
  /** Final text content (ready to encode to Windows-1255). */
  text: string;
  /** Summary of counts and totals (for UI preview + DB snapshot). */
  summary: Pcn874Summary;
  /** Buffer encoded in Windows-1255 (codepage required by Sha'am). */
  buffer: Buffer;
}

export interface Pcn874Summary {
  totalInputsSubtotal: number;
  totalInputsVat: number;
  totalSalesSubtotal: number;
  totalSalesVat: number;
  vatToPay: number;          // sales_vat − inputs_vat (חיובי = לתשלום)
  inputsCount: number;
  salesCount: number;
}
