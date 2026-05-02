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

describe('constructJE — MULTI_EXPENSE', () => {
  it('with 2 expense_splits: produces 2 balanced records sharing reference', () => {
    const r = constructJE(
      inv(
        {
          expense_splits: [
            { account: '503-0', amount: 1000, label: 'חומרי גלם' },
            { account: '504-0', amount: 500, label: 'שירותים' },
          ],
        },
        { subtotal: 1500, total: 1770 },
      ),
      config,
    );
    expect(r.primaryScenario).toBe('MULTI_EXPENSE');
    expect(r.records).toHaveLength(2);
    // Each record balanced
    expect(balanced(r.records[0]!)).toBe(true);
    expect(balanced(r.records[1]!)).toBe(true);
    // Both share reference1
    expect(r.records[0]!.reference1).toBe(r.records[1]!.reference1);
    // Sum of supplier credits = total
    const totalCredit = r.records.reduce(
      (s, rec) =>
        s +
        rec.lines
          .filter((l) => l.account === '200087')
          .reduce((s2, l) => s2 + l.credit, 0),
      0,
    );
    expect(totalCredit).toBeCloseTo(1770, 2);
  });

  it('warns when splits do not sum to subtotal', () => {
    const r = constructJE(
      inv(
        {
          expense_splits: [
            { account: '503-0', amount: 800 },
            { account: '504-0', amount: 500 },
          ],
        },
        { subtotal: 1500, total: 1770 },
      ),
      config,
    );
    expect(r.warnings.some((w) => w.includes('סכום הביניים'))).toBe(true);
  });

  it('falls back to STANDARD when context flags multi but no splits provided', () => {
    const r = constructJE(inv(), config, { hasMultipleExpenseCategories: true });
    expect(r.primaryScenario).toBe('MULTI_EXPENSE');
    expect(r.records).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('פיצולים'))).toBe(true);
  });
});

describe('constructJE — WITH_COST_CENTER', () => {
  it('puts cost center on expense and VAT lines, warns about FLEXIBLE format', () => {
    const r = constructJE(inv({ cost_center: 'PROJ-A' }), config);
    expect(r.primaryScenario).toBe('WITH_COST_CENTER');
    const lines = r.records[0]!.lines;
    const expense = lines.find((l) => l.account === '502-0');
    const vat = lines.find((l) => l.account === '205-2');
    expect(expense?.costCenter).toBe('PROJ-A');
    expect(vat?.costCenter).toBe('PROJ-A');
    expect(r.warnings.some((w) => w.includes('FLEXIBLE'))).toBe(true);
  });

  it('via context override (preferred to invoice field)', () => {
    const r = constructJE(inv(), config, { costCenter: 'OVR' });
    const expense = r.records[0]!.lines.find((l) => l.account === '502-0');
    expect(expense?.costCenter).toBe('OVR');
  });
});

describe('constructJE — WITH_WITHHOLDING', () => {
  it('builds 4 lines with supplier credit reduced by withholding', () => {
    const r = constructJE(
      inv({}, { subtotal: 1000, total: 1180 }),
      { ...config, withholdingAccount: '175-0' },
      { withholdingPercent: 5 },
    );
    expect(r.primaryScenario).toBe('WITH_WITHHOLDING');
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(4);
    expect(lines.find((l) => l.account === '502-0')?.debit).toBe(1000);
    expect(lines.find((l) => l.account === '205-2')?.debit).toBe(180);
    expect(lines.find((l) => l.account === '200087')?.credit).toBe(1130);
    expect(lines.find((l) => l.account === '175-0')?.credit).toBe(50);
    expect(balanced(r.records[0]!)).toBe(true);
  });

  it('warns when withholdingAccount is not configured', () => {
    const r = constructJE(inv(), config, { withholdingPercent: 5 });
    expect(r.warnings.some((w) => w.includes('רשות המסים'))).toBe(true);
  });
});

describe('constructJE — MIXED_DEDUCTION', () => {
  it('vehicle (2/3): 2 balanced records, deductible + non-deductible', () => {
    const r = constructJE(
      inv({}, { subtotal: 1000, total: 1180 }),
      { ...config, nonDeductibleAccount: '502-1' },
      { mixedDeductionCategory: 'vehicle' },
    );
    expect(r.primaryScenario).toBe('MIXED_DEDUCTION');
    expect(r.records).toHaveLength(2);

    const ded = r.records[0]!;
    expect(ded.lines.find((l) => l.account === '502-0')?.debit).toBe(666.67);
    expect(ded.lines.find((l) => l.account === '205-2')?.debit).toBe(120);
    expect(ded.lines.find((l) => l.account === '200087')?.credit).toBe(786.67);
    expect(balanced(ded)).toBe(true);

    const nd = r.records[1]!;
    expect(nd.lines.find((l) => l.account === '502-1')?.debit).toBeCloseTo(393.33, 2);
    expect(nd.lines.find((l) => l.account === '200087')?.credit).toBeCloseTo(393.33, 2);
    expect(balanced(nd)).toBe(true);
  });

  it('meals (1/4)', () => {
    const r = constructJE(
      inv({}, { subtotal: 100, total: 118 }),
      { ...config, nonDeductibleAccount: '502-1' },
      { mixedDeductionCategory: 'meals' },
    );
    const ded = r.records[0]!;
    expect(ded.lines.find((l) => l.account === '502-0')?.debit).toBe(25);
    expect(ded.lines.find((l) => l.account === '205-2')?.debit).toBe(4.5);
    expect(balanced(ded)).toBe(true);
  });

  it('shares reference1 across records', () => {
    const r = constructJE(
      inv({}, { subtotal: 1000, total: 1180 }),
      { ...config, nonDeductibleAccount: '502-1' },
      { mixedDeductionCategory: 'vehicle' },
    );
    expect(r.records[0]!.reference1).toBe(r.records[1]!.reference1);
  });
});

describe('constructJE — FOREIGN_CURRENCY', () => {
  it('USD invoice with rate 3.7 fills both ILS and FX amounts per line', () => {
    const r = constructJE(
      inv({ currency: 'USD', fx_rate: 3.7 }, { subtotal: 100, total: 118 }),
      config,
    );
    expect(r.primaryScenario).toBe('FOREIGN_CURRENCY');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '502-0')?.debit).toBe(370);
    expect(lines.find((l) => l.account === '502-0')?.debitFx).toBe(100);
    expect(lines.find((l) => l.account === '205-2')?.debit).toBe(66.6);
    expect(lines.find((l) => l.account === '205-2')?.debitFx).toBe(18);
    expect(lines.find((l) => l.account === '200087')?.credit).toBe(436.6);
    expect(lines.find((l) => l.account === '200087')?.creditFx).toBe(118);
    expect(balanced(r.records[0]!)).toBe(true);
  });

  it('warns when fx_rate is missing', () => {
    const r = constructJE(inv({ currency: 'USD' }, { subtotal: 100, total: 118 }), config);
    expect(r.warnings.some((w) => w.includes('שער חליפין'))).toBe(true);
  });
});
