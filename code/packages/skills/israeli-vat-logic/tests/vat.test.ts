import { describe, it, expect } from 'vitest';
import {
  getStandardVatRate,
  getVatRateForDate,
  calculateVat,
  isAllocationRequired,
  getAllocationThreshold,
  applyMixedDeduction,
  reconcileRounding,
  RoundingMismatchError,
  isWithinSixMonthRule,
  daysSinceInvoice,
  SIX_MONTH_RULE_DAYS,
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

describe('getVatRateForDate — historical rates', () => {
  it('returns 18% for 2025+', () => {
    expect(getVatRateForDate('2025-01-01')).toBe(18);
    expect(getVatRateForDate('2026-05-15')).toBe(18);
  });
  it('returns 17% for 2015-10-01 to 2024-12-31', () => {
    expect(getVatRateForDate('2024-12-31')).toBe(17);
    expect(getVatRateForDate('2020-06-15')).toBe(17);
    expect(getVatRateForDate('2015-10-01')).toBe(17);
  });
  it('returns 18% for 2013-06-02 to 2015-09-30', () => {
    expect(getVatRateForDate('2015-09-30')).toBe(18);
    expect(getVatRateForDate('2014-01-01')).toBe(18);
    expect(getVatRateForDate('2013-06-02')).toBe(18);
  });
  it('returns 16% for 2010-01-01 to 2013-06-01', () => {
    expect(getVatRateForDate('2013-06-01')).toBe(16);
    expect(getVatRateForDate('2011-12-31')).toBe(16);
  });
  it('returns 15.5% for 2009-07-01 to 2009-12-31', () => {
    expect(getVatRateForDate('2009-08-15')).toBe(15.5);
    expect(getVatRateForDate('2009-12-31')).toBe(15.5);
  });
  it('falls back to 15.5% for very old dates', () => {
    expect(getVatRateForDate('2000-01-01')).toBe(15.5);
  });
});

describe('isWithinSixMonthRule + daysSinceInvoice', () => {
  it('counts days correctly', () => {
    expect(daysSinceInvoice('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysSinceInvoice('2026-01-01', '2026-02-01')).toBe(31);
    expect(daysSinceInvoice('2026-01-15', '2026-04-20')).toBe(95);
  });
  it('clamps to 0 if recording is before invoice', () => {
    expect(daysSinceInvoice('2026-05-01', '2026-04-30')).toBe(0);
  });
  it('within 6 months — VAT recoverable', () => {
    expect(isWithinSixMonthRule('2026-01-15', '2026-04-20')).toBe(true);
    expect(isWithinSixMonthRule('2026-01-01', '2026-06-29')).toBe(true);
  });
  it('past 6 months — VAT NOT recoverable', () => {
    expect(isWithinSixMonthRule('2026-01-01', '2026-09-01')).toBe(false);
    expect(isWithinSixMonthRule('2025-12-15', '2026-08-01')).toBe(false);
  });
  it('exactly at boundary (180 days) — still recoverable', () => {
    // 2026-01-01 + 180 days = 2026-06-30
    expect(isWithinSixMonthRule('2026-01-01', '2026-06-30')).toBe(true);
  });
  it('SIX_MONTH_RULE_DAYS constant is 180', () => {
    expect(SIX_MONTH_RULE_DAYS).toBe(180);
  });
});
