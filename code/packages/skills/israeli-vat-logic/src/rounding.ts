import { round } from './rates.js';

export const DEFAULT_ROUNDING_TOLERANCE = 0.05;

export interface StatedTotals {
  subtotal: number;
  vat: number;
  total: number;
}

export interface ReconciledTotals {
  subtotal: number;
  vat: number;
  total: number;
  adjustment: number;
}

export class RoundingMismatchError extends Error {
  readonly stated: StatedTotals;
  readonly diff: number;
  readonly tolerance: number;
  constructor(stated: StatedTotals, diff: number, tolerance: number) {
    super(
      `rounding mismatch: subtotal+vat=${round(stated.subtotal + stated.vat)} ` +
        `total=${stated.total} diff=${round(diff)} tolerance=${tolerance}`,
    );
    this.name = 'RoundingMismatchError';
    this.stated = stated;
    this.diff = diff;
    this.tolerance = tolerance;
  }
}

export function reconcileRounding(
  stated: StatedTotals,
  tolerance: number = DEFAULT_ROUNDING_TOLERANCE,
): ReconciledTotals {
  const computed = round(stated.subtotal + stated.vat);
  const diff = round(computed - stated.total);
  if (Math.abs(diff) > tolerance) {
    throw new RoundingMismatchError(stated, diff, tolerance);
  }
  const reconciledVat = round(stated.total - stated.subtotal);
  return {
    subtotal: stated.subtotal,
    vat: reconciledVat,
    total: stated.total,
    adjustment: round(reconciledVat - stated.vat),
  };
}
