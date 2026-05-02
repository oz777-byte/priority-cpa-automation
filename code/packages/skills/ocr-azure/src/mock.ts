import { createHash } from 'node:crypto';
import type { ExtractedInvoice } from './types.js';

/**
 * Deterministic mock used when Azure credentials are not configured.
 * Returns Wirthheim-shaped data, with the invoice number derived from
 * the buffer hash so different PDFs look different. This lets the UI
 * flow be exercised end-to-end before paying for Azure.
 */
export function mockExtract(buffer: Buffer): ExtractedInvoice {
  const hash = createHash('sha256').update(buffer).digest('hex');
  // Use 7 hex digits → an integer that looks like an Israeli invoice number.
  const numeric = parseInt(hash.slice(0, 7), 16) % 10_000_000;
  const invoiceNumber = String(4_000_000 + numeric).padStart(7, '0');

  // Date pegged to 7 days ago — recent but stable enough that re-extracting
  // the same PDF gives the same result.
  const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Subtotal varies by hash; VAT 18% (post-2025 rate).
  const subtotal = Math.round((100 + (numeric % 900)) * 100) / 100;
  const vat = Math.round(subtotal * 0.18 * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  return {
    supplier: {
      name: 'וירטהיים בע"מ',
      tax_id: '510847064',
    },
    invoice: {
      number: invoiceNumber,
      date,
      currency: 'ILS',
    },
    totals: {
      subtotal,
      vat_amount: vat,
      total,
    },
    confidence: 0.0,
    source: 'mock',
  };
}
