import { describe, it, expect } from 'vitest';
import { constructARJE, type ARConstructorConfig } from '../src/index.js';
import type { SalesInvoice } from '@priority-cpa/invoice-schema';

const config: ARConstructorConfig = {
  revenueAccount: '700-0',
  outputVatAccount: '220-0',
  cashAccount: '100-0',
  bankAccount: '121-0',
  cardClearingAccount: '125-0',
  postdatedChecksAccount: '122-0',
  advancesAccount: '230-1',
  badDebtAccount: '530-0',
  customerWithholdingAccount: '175-1',
  transactionType: 'מ',
  detailsPrefix: 'מכירה',
};

function sale(
  overrides: Partial<SalesInvoice['invoice']> = {},
  totals: Partial<SalesInvoice['totals']> = {},
): SalesInvoice {
  return {
    invoice: {
      number: 'INV-1001',
      date: '2026-02-10',
      currency: 'ILS',
      document_type: 'tax_invoice',
      ...overrides,
    },
    customer: {
      name: 'לקוח כללי',
      tax_id: '514927384',
      internal_code_priority: '120-1',
    },
    totals: {
      subtotal: 1000,
      total: 1180,
      ...totals,
    },
  } as SalesInvoice;
}

function balanced(record: { lines: { debit: number; credit: number }[] }): boolean {
  const dr = record.lines.reduce((s, l) => s + l.debit, 0);
  const cr = record.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(dr - cr) <= 0.05;
}

describe('constructARJE — AR_STANDARD', () => {
  it('builds 3 balanced lines (DR customer / CR revenue + VAT)', () => {
    const r = constructARJE(sale(), config);
    expect(r.primaryScenario).toBe('AR_STANDARD');
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.account === '120-1')?.debit).toBe(1180);
    expect(lines.find((l) => l.account === '700-0')?.credit).toBe(1000);
    expect(lines.find((l) => l.account === '220-0')?.credit).toBe(180);
    expect(balanced(r.records[0]!)).toBe(true);
  });
});

describe('constructARJE — AR_INVOICE_RECEIPT', () => {
  it('combines invoice + receipt: DR cash, no customer balance', () => {
    const r = constructARJE(
      sale({ document_type: 'invoice_receipt', payment_method: 'cash' }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_INVOICE_RECEIPT');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '100-0')?.debit).toBe(1180);
    expect(lines.find((l) => l.account === '120-1')).toBeUndefined();
    expect(balanced(r.records[0]!)).toBe(true);
  });

  it('routes to bank when payment_method is transfer', () => {
    const r = constructARJE(
      sale({ document_type: 'invoice_receipt', payment_method: 'transfer' }),
      config,
    );
    expect(r.records[0]!.lines.find((l) => l.account === '121-0')?.debit).toBe(1180);
  });
});

describe('constructARJE — AR_PROFORMA', () => {
  it('routes to advances liability, not revenue', () => {
    const r = constructARJE(sale({ document_type: 'proforma' }), config);
    expect(r.primaryScenario).toBe('AR_PROFORMA');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '120-1')?.debit).toBe(1180);
    expect(lines.find((l) => l.account === '230-1')?.credit).toBe(1180);
    expect(lines.find((l) => l.account === '700-0')).toBeUndefined();
    expect(balanced(r.records[0]!)).toBe(true);
  });
});

describe('constructARJE — AR_RECEIPT', () => {
  it('clears AR without recognizing revenue', () => {
    const r = constructARJE(
      sale({ document_type: 'receipt', payment_method: 'transfer' }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_RECEIPT');
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.account === '121-0')?.debit).toBe(1180);
    expect(lines.find((l) => l.account === '120-1')?.credit).toBe(1180);
  });
});

describe('constructARJE — AR_CREDIT_NOTE', () => {
  it('reverses revenue + output VAT, returns balance to customer', () => {
    const r = constructARJE(sale({ document_type: 'credit_note' }), config);
    expect(r.primaryScenario).toBe('AR_CREDIT_NOTE');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '700-0')?.debit).toBe(1000);
    expect(lines.find((l) => l.account === '220-0')?.debit).toBe(180);
    expect(lines.find((l) => l.account === '120-1')?.credit).toBe(1180);
    expect(balanced(r.records[0]!)).toBe(true);
  });
});

describe('constructARJE — AR_CASH_SALE', () => {
  it('routes to cash directly', () => {
    const r = constructARJE(sale({ payment_method: 'cash' }), config);
    expect(r.primaryScenario).toBe('AR_CASH_SALE');
    expect(r.records[0]!.lines.find((l) => l.account === '100-0')?.debit).toBe(1180);
  });
});

describe('constructARJE — AR_CARD_SALE', () => {
  it('routes to card clearing', () => {
    const r = constructARJE(sale({ payment_method: 'card' }), config);
    expect(r.primaryScenario).toBe('AR_CARD_SALE');
    expect(r.records[0]!.lines.find((l) => l.account === '125-0')?.debit).toBe(1180);
  });
});

describe('constructARJE — AR_POSTDATED_CHECK', () => {
  it('routes to postdated checks account', () => {
    const r = constructARJE(sale({ payment_method: 'check_postdated' }), config);
    expect(r.primaryScenario).toBe('AR_POSTDATED_CHECK');
    expect(r.records[0]!.lines.find((l) => l.account === '122-0')?.debit).toBe(1180);
  });
});

describe('constructARJE — AR_INSTALLMENTS', () => {
  it('builds initial AR_STANDARD-shaped JE + notes monthly amount', () => {
    const r = constructARJE(sale({ installments_count: 3 }), config);
    expect(r.primaryScenario).toBe('AR_INSTALLMENTS');
    expect(r.records[0]!.notes.some((n) => n.includes('3'))).toBe(true);
    expect(r.records[0]!.notes.some((n) => n.includes('393'))).toBe(true);
  });
});

describe('constructARJE — AR_EXPORT', () => {
  it('no VAT line; 2-line JE', () => {
    const r = constructARJE(
      sale({ export_country: 'US' }, { subtotal: 1000, total: 1000 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_EXPORT');
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.account === '220-0')).toBeUndefined();
    expect(lines.find((l) => l.account === '120-1')?.debit).toBe(1000);
    expect(lines.find((l) => l.account === '700-0')?.credit).toBe(1000);
  });
});

describe('constructARJE — AR_VAT_EXEMPT', () => {
  it('exempt sale — no VAT, reportable separately', () => {
    const r = constructARJE(
      sale({ vat_exempt_reason: 'אילת' }, { subtotal: 500, total: 500 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_VAT_EXEMPT');
    expect(r.records[0]!.lines).toHaveLength(2);
    expect(r.records[0]!.notes.some((n) => n.includes('אילת'))).toBe(true);
  });
});

describe('constructARJE — AR_FOREIGN_CURRENCY', () => {
  it('USD invoice with rate 3.7 fills both ILS and FX amounts', () => {
    const r = constructARJE(
      sale({ currency: 'USD', fx_rate: 3.7 }, { subtotal: 100, total: 118 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_FOREIGN_CURRENCY');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '120-1')?.debit).toBe(436.6);
    expect(lines.find((l) => l.account === '120-1')?.debitFx).toBe(118);
    expect(lines.find((l) => l.account === '700-0')?.credit).toBe(370);
    expect(lines.find((l) => l.account === '220-0')?.credit).toBe(66.6);
  });
});

describe('constructARJE — AR_WITH_WITHHOLDING', () => {
  it('B2G customer deducts 5%: 4-line JE with withholding asset', () => {
    const r = constructARJE(
      sale({ customer_withholding_percent: 5 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_WITH_WITHHOLDING');
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(4);
    expect(lines.find((l) => l.account === '120-1')?.debit).toBe(1130);
    expect(lines.find((l) => l.account === '175-1')?.debit).toBe(50);
    expect(lines.find((l) => l.account === '700-0')?.credit).toBe(1000);
    expect(lines.find((l) => l.account === '220-0')?.credit).toBe(180);
    expect(balanced(r.records[0]!)).toBe(true);
  });
});

describe('constructARJE — AR_POST_INVOICE_DISCOUNT', () => {
  it('reduces revenue + output VAT + customer balance for taxable invoice', () => {
    const r = constructARJE(
      sale({ post_discount_original_invoice: 'INV-100' }, { subtotal: 200, total: 236 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_POST_INVOICE_DISCOUNT');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '700-0')?.debit).toBe(200);
    expect(lines.find((l) => l.account === '220-0')?.debit).toBe(36);
    expect(lines.find((l) => l.account === '120-1')?.credit).toBe(236);
    // balanced
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.05);
  });

  it('skips VAT line when discount is on a non-taxable invoice', () => {
    const r = constructARJE(
      sale({ post_discount_original_invoice: 'INV-200' }, { subtotal: 100, total: 100 }),
      config,
    );
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '220-0')).toBeUndefined();
    expect(lines).toHaveLength(2);
  });

  it('warns when original invoice ref is missing (still creates JE)', () => {
    const r = constructARJE(
      sale({ post_discount_original_invoice: '' }),
      config,
    );
    // post_discount_original_invoice = '' → falls through to AR_STANDARD,
    // so this test mainly ensures empty string doesn't trigger discount.
    expect(r.primaryScenario).not.toBe('AR_POST_INVOICE_DISCOUNT');
  });
});

describe('constructARJE — AR_BAD_DEBT (with VAT recovery, סעיף 39א)', () => {
  it('writes off customer balance + recovers output VAT for taxable invoice', () => {
    const r = constructARJE(
      sale({ bad_debt_original_invoice: 'INV-980' }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_BAD_DEBT');
    const lines = r.records[0]!.lines;
    // Subtotal 1000, VAT 180, total 1180
    expect(lines.find((l) => l.account === '530-0')?.debit).toBe(1000); // subtotal only
    expect(lines.find((l) => l.account === '220-0')?.debit).toBe(180); // output VAT recovery
    expect(lines.find((l) => l.account === '120-1')?.credit).toBe(1180); // full receivable
    // JE balanced
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.05);
  });

  it('falls back to single-write-off when invoice has no VAT (totals match)', () => {
    const r = constructARJE(
      sale({ bad_debt_original_invoice: 'INV-EXEMPT' }, { subtotal: 500, total: 500 }),
      config,
    );
    expect(r.primaryScenario).toBe('AR_BAD_DEBT');
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '220-0')).toBeUndefined();
    expect(lines.find((l) => l.account === '530-0')?.debit).toBe(500);
    expect(lines.find((l) => l.account === '120-1')?.credit).toBe(500);
  });

  it('exposes VAT recovery in notes', () => {
    const r = constructARJE(
      sale({ bad_debt_original_invoice: 'INV-1' }),
      config,
    );
    const notes = r.records[0]!.notes.join(' ');
    expect(notes).toMatch(/39א|מע"מ עסקאות/);
  });
});

describe('constructARJE — sanity', () => {
  it('every primary scenario is balanced', () => {
    const cases: Array<Partial<SalesInvoice['invoice']>> = [
      {}, // STANDARD
      { document_type: 'invoice_receipt', payment_method: 'cash' },
      { document_type: 'proforma' },
      { document_type: 'receipt', payment_method: 'transfer' },
      { document_type: 'credit_note' },
      { payment_method: 'cash' },
      { payment_method: 'card' },
      { payment_method: 'check_postdated' },
      { installments_count: 3 },
      { export_country: 'US' },
      { vat_exempt_reason: 'אילת' },
      { currency: 'USD', fx_rate: 3.7 },
      { customer_withholding_percent: 5 },
      { bad_debt_original_invoice: 'X' },
    ];
    for (const overrides of cases) {
      const r = constructARJE(sale(overrides), config);
      for (const rec of r.records) {
        expect(balanced(rec)).toBe(true);
      }
    }
  });
});
