import { describe, it, expect } from 'vitest';
import { detectScenario } from '../src/index.js';
import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';

function inv(
  overrides: Partial<CanonicalInvoice['invoice']> = {},
  totalsOverrides: Partial<CanonicalInvoice['totals']> = {},
): CanonicalInvoice {
  return {
    invoice: {
      number: '1',
      date: '2026-02-10',
      currency: 'ILS',
      ...overrides,
    },
    supplier: {
      name: 'X',
      tax_id: '111111111',
      internal_code_priority: '999',
    },
    totals: {
      subtotal: 100,
      total: 118,
      ...totalsOverrides,
    },
  } as CanonicalInvoice;
}

describe('detectScenario — primary picks', () => {
  it('CREDIT_NOTE wins when is_credit_note=true', () => {
    expect(detectScenario(inv({ is_credit_note: true })).scenario).toBe('CREDIT_NOTE');
  });

  it('FOREIGN_CURRENCY when currency != ILS', () => {
    expect(detectScenario(inv({ currency: 'USD' })).scenario).toBe('FOREIGN_CURRENCY');
  });

  it('MISSING_ALLOCATION above threshold + no allocation_number', () => {
    expect(
      detectScenario(inv({ date: '2026-02-10' }, { subtotal: 30000 })).scenario,
    ).toBe('MISSING_ALLOCATION');
  });

  it('WITH_ALLOCATION when allocation_number is present', () => {
    expect(detectScenario(inv({ allocation_number: '1I12345' })).scenario).toBe(
      'WITH_ALLOCATION',
    );
  });

  it('IMMEDIATE_PAYMENT when payment_method=cash/card/transfer', () => {
    expect(detectScenario(inv({ payment_method: 'cash' })).scenario).toBe('IMMEDIATE_PAYMENT');
    expect(detectScenario(inv({ payment_method: 'card' })).scenario).toBe('IMMEDIATE_PAYMENT');
    expect(detectScenario(inv({ payment_method: 'transfer' })).scenario).toBe('IMMEDIATE_PAYMENT');
  });

  it('WITH_WITHHOLDING when context has withholdingPercent', () => {
    const r = detectScenario(inv(), { withholdingPercent: 5 });
    expect(r.scenario).toBe('WITH_WITHHOLDING');
  });

  it('MIXED_DEDUCTION when context has mixedDeductionCategory', () => {
    expect(detectScenario(inv(), { mixedDeductionCategory: 'vehicle' }).scenario).toBe(
      'MIXED_DEDUCTION',
    );
    expect(detectScenario(inv(), { mixedDeductionCategory: 'meals' }).scenario).toBe(
      'MIXED_DEDUCTION',
    );
  });

  it('MULTI_EXPENSE when context flags multiple expense categories', () => {
    expect(
      detectScenario(inv(), { hasMultipleExpenseCategories: true }).scenario,
    ).toBe('MULTI_EXPENSE');
  });

  it('WITH_COST_CENTER when context has costCenter', () => {
    expect(detectScenario(inv(), { costCenter: 'PROJ-A' }).scenario).toBe(
      'WITH_COST_CENTER',
    );
  });

  it('STANDARD by default', () => {
    const r = detectScenario(inv());
    expect(r.scenario).toBe('STANDARD');
    expect(r.overlays).toEqual([]);
  });
});

describe('detectScenario — overlays', () => {
  it('DIFFERENT_DATES overlay when value_date differs from document date', () => {
    expect(detectScenario(inv({ value_date: '2026-03-01' })).overlays).toContain(
      'DIFFERENT_DATES',
    );
  });

  it('WITH_DISCOUNT overlay when discount_amount is non-zero', () => {
    expect(detectScenario(inv({}, { discount_amount: 5 })).overlays).toContain(
      'WITH_DISCOUNT',
    );
  });

  it('multiple overlays compose', () => {
    const r = detectScenario(
      inv({ value_date: '2026-03-01' }, { discount_amount: 5 }),
    );
    expect(r.overlays).toContain('DIFFERENT_DATES');
    expect(r.overlays).toContain('WITH_DISCOUNT');
  });
});

describe('detectScenario — allocation threshold edge cases', () => {
  it('not MISSING_ALLOCATION below threshold', () => {
    expect(
      detectScenario(inv(), { subtotal: 5000 }).scenario,
    ).not.toBe('MISSING_ALLOCATION');
  });

  it('MISSING_ALLOCATION above 2026 threshold (20K)', () => {
    expect(
      detectScenario(inv({ date: '2026-02-10' }, { subtotal: 20001 })).scenario,
    ).toBe('MISSING_ALLOCATION');
  });

  it('not flagged before 2024 (regulation did not exist)', () => {
    expect(
      detectScenario(inv({ date: '2023-12-31' }, { subtotal: 100000 })).scenario,
    ).not.toBe('MISSING_ALLOCATION');
  });
});
