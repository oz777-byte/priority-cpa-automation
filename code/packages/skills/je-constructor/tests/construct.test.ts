import { describe, it, expect } from 'vitest';
import { constructJE } from '../src/index.js';
import type { ConstructorConfig } from '../src/index.js';
import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';

const config: ConstructorConfig = {
  expenseAccount: '502-0',
  vatInputAccount: '205-2',
  detailsPrefix: 'קניות',
  transactionType: 'מ',
};

function inv(overrides: Partial<CanonicalInvoice['invoice']> = {}, totals: Partial<CanonicalInvoice['totals']> = {}): CanonicalInvoice {
  return {
    invoice: {
      number: '4427930',
      date: '2026-02-10',
      currency: 'ILS',
      ...overrides,
    },
    supplier: {
      name: 'וירטהיים',
      tax_id: '510847064',
      internal_code_priority: '200087',
    },
    totals: {
      subtotal: 484.78,
      total: 572,
      ...totals,
    },
  } as CanonicalInvoice;
}

function balanced(record: { lines: { debit: number; credit: number }[] }): boolean {
  const dr = record.lines.reduce((s, l) => s + l.debit, 0);
  const cr = record.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(dr - cr) <= 0.05;
}

describe('constructJE — STANDARD', () => {
  it('builds 3 balanced lines', () => {
    const r = constructJE(inv(), config);
    expect(r.primaryScenario).toBe('STANDARD');
    expect(r.records).toHaveLength(1);
    expect(r.records[0]?.lines).toHaveLength(3);
    expect(balanced(r.records[0]!)).toBe(true);
  });

  it('puts subtotal on expense, vat on VAT account, total on supplier', () => {
    const r = constructJE(inv(), config);
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '502-0')?.debit).toBe(484.78);
    expect(lines.find((l) => l.account === '205-2')?.debit).toBe(87.22);
    expect(lines.find((l) => l.account === '200087')?.credit).toBe(572);
  });
});

describe('constructJE — WITH_ALLOCATION', () => {
  it('detects allocation_number and warns when > 5 chars', () => {
    const r = constructJE(inv({ allocation_number: '1I4427930' }), config);
    expect(r.primaryScenario).toBe('WITH_ALLOCATION');
    expect(r.warnings.some((w) => w.includes('FLEXIBLE'))).toBe(true);
  });

  it('does not warn when allocation_number ≤ 5 chars', () => {
    const r = constructJE(inv({ allocation_number: '12345' }), config);
    expect(r.primaryScenario).toBe('WITH_ALLOCATION');
    expect(r.warnings).toHaveLength(0);
  });
});

describe('constructJE — IMMEDIATE_PAYMENT', () => {
  it('uses paymentAccount instead of supplier on credit side', () => {
    const r = constructJE(
      inv({ payment_method: 'cash' }),
      { ...config, paymentAccount: '100-0' },
    );
    expect(r.primaryScenario).toBe('IMMEDIATE_PAYMENT');
    const credit = r.records[0]!.lines.find((l) => l.credit > 0);
    expect(credit?.account).toBe('100-0');
  });

  it('warns and falls back to supplier when paymentAccount missing', () => {
    const r = constructJE(inv({ payment_method: 'cash' }), config);
    expect(r.warnings.length).toBeGreaterThan(0);
    const credit = r.records[0]!.lines.find((l) => l.credit > 0);
    expect(credit?.account).toBe('200087');
  });
});

describe('constructJE — CREDIT_NOTE', () => {
  it('reverses DR/CR direction', () => {
    const r = constructJE(inv({ is_credit_note: true }), config);
    expect(r.primaryScenario).toBe('CREDIT_NOTE');
    const lines = r.records[0]!.lines;
    // Supplier side: now DR (positive amount taken back)
    expect(lines.find((l) => l.account === '200087')?.debit).toBe(572);
    // Expense + VAT: now CR
    expect(lines.find((l) => l.account === '502-0')?.credit).toBe(484.78);
    expect(lines.find((l) => l.account === '205-2')?.credit).toBe(87.22);
    expect(balanced(r.records[0]!)).toBe(true);
  });
});

describe('constructJE — MISSING_ALLOCATION', () => {
  it('still builds JE but warns clearly', () => {
    const r = constructJE(inv({ date: '2026-02-10' }, { subtotal: 30000, total: 35400 }), config);
    expect(r.primaryScenario).toBe('MISSING_ALLOCATION');
    expect(r.warnings.some((w) => w.includes('הקצאה'))).toBe(true);
  });
});

describe('constructJE — overlays', () => {
  it('exposes DIFFERENT_DATES overlay', () => {
    const r = constructJE(inv({ value_date: '2026-03-01' }), config);
    expect(r.overlays).toContain('DIFFERENT_DATES');
    expect(r.records[0]!.valueDate).toBe('2026-03-01');
    expect(r.records[0]!.documentDate).toBe('2026-02-10');
  });
});

describe('constructJE — complex scenarios fall back to STANDARD with warning', () => {
  for (const scenario of ['MULTI_EXPENSE', 'WITH_COST_CENTER', 'MIXED_DEDUCTION', 'FOREIGN_CURRENCY', 'WITH_WITHHOLDING'] as const) {
    it(`${scenario}: returns STANDARD-shaped JE + clear warning`, () => {
      const detector =
        scenario === 'FOREIGN_CURRENCY' ? { /* triggered via currency */ }
        : scenario === 'WITH_WITHHOLDING' ? { withholdingPercent: 5 }
        : scenario === 'MIXED_DEDUCTION' ? { mixedDeductionCategory: 'vehicle' as const }
        : scenario === 'WITH_COST_CENTER' ? { costCenter: 'PROJ-A' }
        : scenario === 'MULTI_EXPENSE' ? { hasMultipleExpenseCategories: true }
        : {};
      const invoice = scenario === 'FOREIGN_CURRENCY'
        ? inv({ currency: 'USD' })
        : inv();
      const r = constructJE(invoice, config, detector);
      expect(r.primaryScenario).toBe(scenario);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.records).toHaveLength(1);
      expect(balanced(r.records[0]!)).toBe(true);
    });
  }
});
