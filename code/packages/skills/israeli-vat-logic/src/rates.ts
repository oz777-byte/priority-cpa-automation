const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(isoDate: string): void {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`expected ISO date YYYY-MM-DD, got: ${isoDate}`);
  }
}

export const STANDARD_VAT_CHANGEOVER_DATE = '2025-01-01';
export const VAT_RATE_PRE_2025 = 17;
export const VAT_RATE_FROM_2025 = 18;

export type StandardVatRate = 17 | 18;

/**
 * Full historical Israeli VAT rates table — mirrors `vat_rates_history` in DB.
 * Sorted descending by effective date so first match wins.
 */
export const VAT_RATE_HISTORY: ReadonlyArray<{ from: string; rate: number }> = [
  { from: '2025-01-01', rate: 18 },
  { from: '2015-10-01', rate: 17 },
  { from: '2013-06-02', rate: 18 },
  { from: '2010-01-01', rate: 16 },
  { from: '2009-07-01', rate: 15.5 },
];

/**
 * Returns VAT rate (as percent) effective at `supplyDate`. Falls back to
 * 15.5% for dates before the first known entry. The "supply date" is
 * normally the invoice date — if a 2024 invoice arrives in 2025, the
 * 17% rate applies, not 18%.
 */
export function getVatRateForDate(supplyDate: string): number {
  assertDate(supplyDate);
  for (const r of VAT_RATE_HISTORY) {
    if (supplyDate >= r.from) return r.rate;
  }
  return 15.5;
}

/**
 * Legacy helper — kept for back-compat. New code should use
 * getVatRateForDate which handles full history.
 */
export function getStandardVatRate(isoDate: string): StandardVatRate {
  assertDate(isoDate);
  return isoDate >= STANDARD_VAT_CHANGEOVER_DATE ? VAT_RATE_FROM_2025 : VAT_RATE_PRE_2025;
}

export function calculateVat(subtotalIls: number, ratePercent: number): number {
  if (!Number.isFinite(subtotalIls) || subtotalIls < 0) {
    throw new Error(`calculateVat: subtotal must be non-negative finite, got ${subtotalIls}`);
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    throw new Error(`calculateVat: rate must be non-negative finite, got ${ratePercent}`);
  }
  return round(subtotalIls * (ratePercent / 100));
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
