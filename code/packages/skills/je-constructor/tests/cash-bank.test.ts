import { describe, it, expect } from 'vitest';
import { constructCashBankJE, type CashBankConfig } from '../src/index.js';

const config: CashBankConfig = {
  bankAccount: '121-0',
  cashAccount: '100-0',
  bankFeesAccount: '522-0',
  interestIncomeAccount: '743-0',
  interestExpenseAccount: '624-0',
  cardClearingAccount: '125-0',
  cardFeesAccount: '522-1',
  transactionType: 'מ',
};

function balanced(record: { lines: { debit: number; credit: number }[] }): boolean {
  const dr = record.lines.reduce((s, l) => s + l.debit, 0);
  const cr = record.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(dr - cr) <= 0.05;
}

describe('constructCashBankJE — BANK_FEE', () => {
  it('builds DR fees / CR bank', () => {
    const r = constructCashBankJE(
      {
        scenario: 'BANK_FEE',
        amount: 25,
        date: '2026-02-10',
        description: 'עמלת ניהול חשבון',
      },
      config,
    );
    expect(r.record.lines).toHaveLength(2);
    expect(r.record.lines.find((l) => l.account === '522-0')?.debit).toBe(25);
    expect(r.record.lines.find((l) => l.account === '121-0')?.credit).toBe(25);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — INTEREST_INCOME', () => {
  it('DR bank / CR interest income', () => {
    const r = constructCashBankJE(
      {
        scenario: 'INTEREST_INCOME',
        amount: 50,
        date: '2026-02-10',
        description: 'ריבית זכות חודשית',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '121-0')?.debit).toBe(50);
    expect(r.record.lines.find((l) => l.account === '743-0')?.credit).toBe(50);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — INTEREST_EXPENSE', () => {
  it('DR interest expense / CR bank (overdraft)', () => {
    const r = constructCashBankJE(
      {
        scenario: 'INTEREST_EXPENSE',
        amount: 120,
        date: '2026-02-10',
        description: 'ריבית חובה — אוברדראפט',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '624-0')?.debit).toBe(120);
    expect(r.record.lines.find((l) => l.account === '121-0')?.credit).toBe(120);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — INTER_ACCOUNT_TRANSFER', () => {
  it('DR destination bank / CR source bank', () => {
    const r = constructCashBankJE(
      {
        scenario: 'INTER_ACCOUNT_TRANSFER',
        amount: 10000,
        date: '2026-02-10',
        sourceBankAccount: '121-0',
        destinationBankAccount: '121-1',
        description: 'העברה בין חשבונות',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '121-1')?.debit).toBe(10000);
    expect(r.record.lines.find((l) => l.account === '121-0')?.credit).toBe(10000);
    expect(balanced(r.record)).toBe(true);
  });

  it('warns when destination is missing', () => {
    const r = constructCashBankJE(
      {
        scenario: 'INTER_ACCOUNT_TRANSFER',
        amount: 100,
        date: '2026-02-10',
        description: 'העברה',
      },
      config,
    );
    expect(r.warnings.some((w) => w.includes('destination'))).toBe(true);
  });
});

describe('constructCashBankJE — CASH_DEPOSIT', () => {
  it('DR bank / CR cash', () => {
    const r = constructCashBankJE(
      {
        scenario: 'CASH_DEPOSIT',
        amount: 5000,
        date: '2026-02-10',
        description: 'הפקדת מזומן',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '121-0')?.debit).toBe(5000);
    expect(r.record.lines.find((l) => l.account === '100-0')?.credit).toBe(5000);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — CASH_WITHDRAWAL', () => {
  it('DR cash / CR bank', () => {
    const r = constructCashBankJE(
      {
        scenario: 'CASH_WITHDRAWAL',
        amount: 1000,
        date: '2026-02-10',
        description: 'משיכת מזומן',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '100-0')?.debit).toBe(1000);
    expect(r.record.lines.find((l) => l.account === '121-0')?.credit).toBe(1000);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — BOUNCED_CHECK', () => {
  it('DR customer + DR fee / CR bank (with fee)', () => {
    const r = constructCashBankJE(
      {
        scenario: 'BOUNCED_CHECK',
        amount: 1180,
        bouncedFee: 30,
        customerAccount: '120-1',
        date: '2026-02-10',
        description: 'צ\'ק חזר ללא כיסוי',
      },
      config,
    );
    expect(r.record.lines).toHaveLength(3);
    expect(r.record.lines.find((l) => l.account === '120-1')?.debit).toBe(1180);
    expect(r.record.lines.find((l) => l.account === '522-0')?.debit).toBe(30);
    expect(r.record.lines.find((l) => l.account === '121-0')?.credit).toBe(1210);
    expect(balanced(r.record)).toBe(true);
  });

  it('2-line JE without fee', () => {
    const r = constructCashBankJE(
      {
        scenario: 'BOUNCED_CHECK',
        amount: 500,
        customerAccount: '120-2',
        date: '2026-02-10',
        description: 'צ\'ק חזר',
      },
      config,
    );
    expect(r.record.lines).toHaveLength(2);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — CARD_CLEARING_FEE', () => {
  it('DR card-fee expense / CR card-clearing', () => {
    const r = constructCashBankJE(
      {
        scenario: 'CARD_CLEARING_FEE',
        amount: 18.5,
        date: '2026-02-10',
        description: 'עמלת סולק 1.5%',
      },
      config,
    );
    expect(r.record.lines.find((l) => l.account === '522-1')?.debit).toBe(18.5);
    expect(r.record.lines.find((l) => l.account === '125-0')?.credit).toBe(18.5);
    expect(balanced(r.record)).toBe(true);
  });
});

describe('constructCashBankJE — sanity: every scenario balanced', () => {
  const cases: Array<{
    scenario:
      | 'BANK_FEE'
      | 'INTEREST_INCOME'
      | 'INTEREST_EXPENSE'
      | 'INTER_ACCOUNT_TRANSFER'
      | 'CASH_DEPOSIT'
      | 'CASH_WITHDRAWAL'
      | 'BOUNCED_CHECK'
      | 'CARD_CLEARING_FEE';
    extra?: Record<string, unknown>;
  }> = [
    { scenario: 'BANK_FEE' },
    { scenario: 'INTEREST_INCOME' },
    { scenario: 'INTEREST_EXPENSE' },
    { scenario: 'INTER_ACCOUNT_TRANSFER', extra: { destinationBankAccount: '121-1' } },
    { scenario: 'CASH_DEPOSIT' },
    { scenario: 'CASH_WITHDRAWAL' },
    { scenario: 'BOUNCED_CHECK', extra: { customerAccount: '120-1', bouncedFee: 30 } },
    { scenario: 'CARD_CLEARING_FEE' },
  ];
  for (const c of cases) {
    it(`${c.scenario} — balanced`, () => {
      const r = constructCashBankJE(
        {
          scenario: c.scenario,
          amount: 100,
          date: '2026-02-10',
          description: 'test',
          ...(c.extra ?? {}),
        },
        config,
      );
      expect(balanced(r.record)).toBe(true);
    });
  }
});
