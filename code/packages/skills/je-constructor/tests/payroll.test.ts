import { describe, it, expect } from 'vitest';
import { constructPayrollJEs, type PayrollConfig, type PayrollEntry } from '../src/index.js';

const config: PayrollConfig = {
  grossSalaryAccount: '600-0',
  socialExpensesAccount: '601-0',
  niLiabilityAccount: '230-1',
  incomeTaxLiabilityAccount: '230-2',
  pensionLiabilityAccount: '230-3',
  studyFundLiabilityAccount: '230-4',
  severanceLiabilityAccount: '230-5',
  netToEmployeeAccount: '230-9',
  bankAccount: '121-0',
  transactionType: 'מ',
};

function entry(overrides: Partial<PayrollEntry> = {}): PayrollEntry {
  return {
    employeeId: 'EMP-001',
    employeeName: 'דני כהן',
    monthDate: '2026-05-31',
    gross: 15000,
    niEmployee: 1500,
    incomeTax: 2500,
    pensionEmployee: 900,
    studyFundEmployee: 450,
    niEmployer: 1200,
    pensionEmployer: 900,
    studyFundEmployer: 750,
    severanceEmployer: 1250,
    ...overrides,
  };
}

function balanced(record: { lines: { debit: number; credit: number }[] }): boolean {
  const dr = record.lines.reduce((s, l) => s + l.debit, 0);
  const cr = record.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(dr - cr) <= 0.05;
}

describe('constructPayrollJEs — full payroll', () => {
  it('produces 3 records (monthly + employer + payment)', () => {
    const r = constructPayrollJEs(entry(), config);
    expect(r.records).toHaveLength(3);
    expect(r.records[0]!.scenario).toBe('PAYROLL_MONTHLY');
    expect(r.records[1]!.scenario).toBe('PAYROLL_EMPLOYER');
    expect(r.records[2]!.scenario).toBe('PAYROLL_PAYMENT');
  });

  it('record 1: DR gross / CR all employee deductions + net', () => {
    const r = constructPayrollJEs(entry(), config);
    const lines = r.records[0]!.lines;
    expect(lines.find((l) => l.account === '600-0')?.debit).toBe(15000);
    expect(lines.find((l) => l.account === '230-1')?.credit).toBe(1500);
    expect(lines.find((l) => l.account === '230-2')?.credit).toBe(2500);
    expect(lines.find((l) => l.account === '230-3')?.credit).toBe(900);
    expect(lines.find((l) => l.account === '230-4')?.credit).toBe(450);
    expect(lines.find((l) => l.account === '230-9')?.credit).toBe(9650);
    expect(balanced(r.records[0]!)).toBe(true);
  });

  it('record 2: DR social expenses / CR all employer contributions', () => {
    const r = constructPayrollJEs(entry(), config);
    const lines = r.records[1]!.lines;
    expect(lines.find((l) => l.account === '601-0')?.debit).toBe(4100);
    expect(lines.find((l) => l.account === '230-1')?.credit).toBe(1200);
    expect(lines.find((l) => l.account === '230-3')?.credit).toBe(900);
    expect(lines.find((l) => l.account === '230-4')?.credit).toBe(750);
    expect(lines.find((l) => l.account === '230-5')?.credit).toBe(1250);
    expect(balanced(r.records[1]!)).toBe(true);
  });

  it('record 3: DR net liability / CR bank', () => {
    const r = constructPayrollJEs(entry(), config);
    const lines = r.records[2]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.account === '230-9')?.debit).toBe(9650);
    expect(lines.find((l) => l.account === '121-0')?.credit).toBe(9650);
    expect(balanced(r.records[2]!)).toBe(true);
  });

  it('all 3 records share the same reference1', () => {
    const r = constructPayrollJEs(entry({ employeeId: 'EMP-007' }), config);
    expect(r.records[0]!.reference1).toBe('EMP-007');
    expect(r.records[1]!.reference1).toBe('EMP-007');
    expect(r.records[2]!.reference1).toBe('EMP-007');
  });

  it('total employer cost (record 2 DR) sums to 4100', () => {
    const r = constructPayrollJEs(entry(), config);
    const social = r.records[1]!.lines.find((l) => l.account === '601-0');
    expect(social?.debit).toBe(1200 + 900 + 750 + 1250);
  });

  it('notes describe gross/net split + total cost', () => {
    const r = constructPayrollJEs(entry(), config);
    const allNotes = r.records.flatMap((rec) => rec.notes).join(' ');
    expect(allNotes).toContain('15000');
    expect(allNotes).toContain('9650');
    expect(allNotes).toContain('4100');
  });
});

describe('constructPayrollJEs — edge cases', () => {
  it('skips employer record when employer contributions are zero', () => {
    const r = constructPayrollJEs(
      entry({
        niEmployer: 0,
        pensionEmployer: 0,
        studyFundEmployer: 0,
        severanceEmployer: 0,
      }),
      config,
    );
    expect(r.records).toHaveLength(2);
    expect(r.records.find((rec) => rec.scenario === 'PAYROLL_EMPLOYER')).toBeUndefined();
  });

  it('warns when deductions exceed gross', () => {
    const r = constructPayrollJEs(
      entry({
        gross: 5000,
        niEmployee: 2000,
        incomeTax: 2000,
        pensionEmployee: 1500,
        studyFundEmployee: 500,
      }),
      config,
    );
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes('שלילי') || w.includes('גדול'))).toBe(true);
  });

  it('omits zero-amount lines', () => {
    const r = constructPayrollJEs(
      entry({
        studyFundEmployee: 0,
        studyFundEmployer: 0,
      }),
      config,
    );
    expect(r.records[0]!.lines.find((l) => l.account === '230-4')).toBeUndefined();
    expect(r.records[1]!.lines.find((l) => l.account === '230-4')).toBeUndefined();
    // Still balanced
    for (const rec of r.records) expect(balanced(rec)).toBe(true);
  });

  it('skips payment record when net is zero (full deduction case)', () => {
    const r = constructPayrollJEs(
      entry({
        gross: 4000,
        niEmployee: 1000,
        incomeTax: 1000,
        pensionEmployee: 1000,
        studyFundEmployee: 1000,
      }),
      config,
    );
    expect(r.records.find((rec) => rec.scenario === 'PAYROLL_PAYMENT')).toBeUndefined();
  });
});

describe('constructPayrollJEs — sanity', () => {
  it('every record is balanced for a standard entry', () => {
    const r = constructPayrollJEs(entry(), config);
    for (const rec of r.records) {
      expect(balanced(rec)).toBe(true);
    }
  });

  it('every record carries the company transaction type', () => {
    const r = constructPayrollJEs(entry(), { ...config, transactionType: 'מש' });
    for (const rec of r.records) {
      expect(rec.transactionType).toBe('מש');
    }
  });
});
