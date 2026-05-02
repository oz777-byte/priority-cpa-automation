import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function vatFromTotals(invoice: CanonicalInvoice): number {
  return roundCents(invoice.totals.total - invoice.totals.subtotal);
}

export function valueDateOf(invoice: CanonicalInvoice): string {
  return invoice.invoice.value_date ?? invoice.invoice.date;
}
