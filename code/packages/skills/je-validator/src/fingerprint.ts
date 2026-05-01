import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';

/**
 * Stable fingerprint to detect duplicate invoice ingestion.
 * Combines: supplier tax_id, invoice number, document date, and total (rounded to cents).
 */
export function invoiceFingerprint(invoice: CanonicalInvoice): string {
  return [
    invoice.supplier.tax_id.trim().toLowerCase(),
    invoice.invoice.number.trim(),
    invoice.invoice.date,
    invoice.totals.total.toFixed(2),
  ].join('|');
}
