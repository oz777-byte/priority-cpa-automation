/**
 * Israeli VAT law (סעיף 38א): a registered dealer can claim input VAT only
 * within 6 months from the invoice date. After this window, the VAT cannot
 * be recovered — the invoice is still expense-deductible for income tax,
 * but the VAT input line must be omitted from the JE.
 *
 * "6 months" in this context = 180 days for practical purposes (the law
 * uses calendar months but most accountants use 180 days as the cutoff).
 */

export const SIX_MONTH_RULE_DAYS = 180;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) {
    throw new Error(`expected ISO date YYYY-MM-DD, got: ${iso}`);
  }
  // Anchor to UTC noon to avoid timezone day shifts.
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Days elapsed between invoice date and recording date (must be ≥ 0).
 * Returns 0 if recording happened on or before invoice date.
 */
export function daysSinceInvoice(invoiceDate: string, recordingDate: string): number {
  const inv = parseDate(invoiceDate);
  const rec = parseDate(recordingDate);
  const diffMs = rec.getTime() - inv.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Returns true if the invoice can still claim input VAT (within 6 months
 * from issue). Applies to registered-dealer suppliers; doesn't apply to
 * exempt-dealer or self-invoice scenarios (those have their own logic).
 */
export function isWithinSixMonthRule(
  invoiceDate: string,
  recordingDate: string,
): boolean {
  return daysSinceInvoice(invoiceDate, recordingDate) <= SIX_MONTH_RULE_DAYS;
}
