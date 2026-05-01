import { describe, it, expect } from 'vitest';
import {
  getStandardVatRate,
  calculateVat,
  isAllocationRequired,
  getAllocationThreshold,
  applyMixedDeduction,
  reconcileRounding,
  RoundingMismatchError,
} from '../src/index.js';

describe('getStandardVatRate', () => {
  it('returns 17 for dates before 2025-01-01', () => {
    expect(getStandardVatRate('2024-12-31')).toBe(17);
    expect(getStandardVatRate('2024-01-01')).toBe(17);
  });
  it('returns 18 for 2025-01-01 and after', () => {
    expect(getStandardVatRate('2025-01-01')).toBe(18);
    expect(getStandardVatRate('2026-02-10')).toBe(18);
  });
  it('throws on bad input', () => {
    expect(() => getStandardVatRate('10/02/2026')).toThrow();
  });
});

describe('calculateVat', () => {
  it('computes 18% on 484.78 ≈ 87.26', () => {
    expect(calculateVat(484.78, 18)).toBe(87.26);
  });
  it('computes 17% on 1000 = 170.00', () => {
    expect(calculateVat(1000, 17)).toBe(170);
  });
  it('handles zero', () => {
    expect(calculateVat(0, 18)).toBe(0);
  });
  it('rejects negative subtotal', () => {
    expect(() => calculateVat(-1, 18)).toThrow();
  });
});

describe('allocation threshold', () => {
  it('returns null before regulation took effect (2024)', () => {
    expect(getAllocationThreshold('2023-06-01')).toBeNull();
  });
  it('returns 25K for 2024', () => {
    expect(getAllocationThreshold('2024-06-01')).toBe(25000);
  });
  it('returns 20K for 2025+', () => {
    expect(getAllocationThreshold('2025-06-01')).toBe(20000);
    expect(getAllocationThreshold('2026-06-01')).toBe(20000);
  });
  it('falls back to 20K for years past the table', () => {
    expect(getAllocationThreshold('2030-06-01')).toBe(20000);
  });
  it('isAllocationRequired strictly above threshold', () => {
    expect(isAllocationRequired(25000.01, '2024-06-01')).toBe(true);
    expect(isAllocationRequired(25000, '2024-06-01')).toBe(false);
    expect(isAllocationRequired(20000.01, '2026-06-01')).toBe(true);
    expect(isAllocationRequired(572, '2026-02-10')).toBe(false);
  });
});

describe('applyMixedDeduction', () => {
  it('vehicle = 2/3 deductible', () => {
    const r = applyMixedDeduction('vehicle', 1000, 180);
    expect(r.deductibleExpense).toBe(666.67);
    expect(r.nonDeductibleExpense).toBe(333.33);
    expect(r.deductibleVat).toBe(120);
    expect(r.nonDeductibleVat).toBe(60);
  });
  it('meals = 1/4 deductible', () => {
    const r = applyMixedDeduction('meals', 100, 18);
    expect(r.deductibleExpense).toBe(25);
    expect(r.nonDeductibleExpense).toBe(75);
    expect(r.deductibleVat).toBe(4.5);
    expect(r.nonDeductibleVat).toBe(13.5);
  });
  it('standard = 100%', () => {
    const r = applyMixedDeduction('standard', 100, 18);
    expect(r.deductibleExpense).toBe(100);
    expect(r.nonDeductibleExpense).toBe(0);
  });
  it('non_deductible = 0%', () => {
    const r = applyMixedDeduction('non_deductible', 100, 18);
    expect(r.deductibleExpense).toBe(0);
    expect(r.deductibleVat).toBe(0);
  });
});

describe('reconcileRounding', () => {
  it('passes the Wertheim case (POC) within tolerance', () => {
    // OCR reported VAT 87.25, but subtotal+VAT=572.03 vs total=572.00 → diff 0.03 ≤ 0.05.
    // Reconciled: trust total, recompute VAT = 572.00 - 484.78 = 87.22.
    const r = reconcileRounding({ subtotal: 484.78, vat: 87.25, total: 572.0 });
    expect(r.vat).toBe(87.22);
    expect(r.total).toBe(572.0);
    expect(r.adjustment).toBe(-0.03);
  });
  it('throws beyond tolerance', () => {
    expect(() =>
      reconcileRounding({ subtotal: 100, vat: 18, total: 120 }),
    ).toThrow(RoundingMismatchError);
  });
  it('zero adjustment when stated already matches', () => {
    const r = reconcileRounding({ subtotal: 5488.14, vat: 987.86, total: 6476.0 });
    expect(r.adjustment).toBe(0);
  });
});
