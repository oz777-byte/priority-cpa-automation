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
