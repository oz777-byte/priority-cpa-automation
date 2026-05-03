import { roundCents } from './helpers.js';
import type {
  PayrollConfig,
  PayrollEntry,
  PayrollJELine,
  PayrollJERecord,
  PayrollConstructResult,
} from './payroll-types.js';

export type {
  PayrollScenario,
  PayrollConfig,
  PayrollEntry,
  PayrollJELine,
  PayrollJERecord,
  PayrollConstructResult,
} from './payroll-types.js';

/**
 * Build the three payroll JEs for a single employee-month entry.
 *
 * Record 1 — PAYROLL_MONTHLY (the gross-to-net split):
 *   DR  gross_salary               gross
 *   CR  ni_liability               ni_employee
 *   CR  income_tax_liability       income_tax
 *   CR  pension_liability          pension_employee
 *   CR  study_fund_liability       study_fund_employee
 *   CR  net_to_employee            net (= gross - all deductions)
 *
 * Record 2 — PAYROLL_EMPLOYER (employer contributions on top of gross):
 *   DR  social_expenses            ni_e + pension_e + study_e + severance_e
 *   CR  ni_liability               ni_employer
 *   CR  pension_liability          pension_employer
 *   CR  study_fund_liability       study_fund_employer
 *   CR  severance_liability        severance_employer
 *
 * Record 3 — PAYROLL_PAYMENT (clears the net-to-employee liability):
 *   DR  net_to_employee            net
 *   CR  bank                       net
 *
 * All three records share `reference1` so they can be linked in Priority.
 */
export function constructPayrollJEs(
  entry: PayrollEntry,
  config: PayrollConfig,
): PayrollConstructResult {
  const warnings: string[] = [];

  const gross = roundCents(entry.gross);
  const niE = roundCents(entry.niEmployee);
  const incomeTax = roundCents(entry.incomeTax);
  const pensionE = roundCents(entry.pensionEmployee);
  const studyE = roundCents(entry.studyFundEmployee);
  const totalEmployeeDeductions = roundCents(niE + incomeTax + pensionE + studyE);
  const net = roundCents(gross - totalEmployeeDeductions);

  if (net < 0) {
    warnings.push(
      `נטו שלילי (${net.toFixed(2)}) — בדוק שניכויי העובד אינם חורגים מהסכום הברוטו.`,
    );
  }
  if (totalEmployeeDeductions > gross) {
    warnings.push('סך ניכויי העובד גדול מהשכר הברוטו.');
  }

  const niEmp = roundCents(entry.niEmployer);
  const pensionEmp = roundCents(entry.pensionEmployer);
  const studyEmp = roundCents(entry.studyFundEmployer);
  const severance = roundCents(entry.severanceEmployer);
  const totalEmployer = roundCents(niEmp + pensionEmp + studyEmp + severance);

  const reference1 = entry.employeeId;
  const baseDetails = `שכר ${entry.employeeName} ${entry.monthDate.slice(0, 7)}`;

  /* ── Record 1: gross to deductions + net ───────────────────────── */
  const r1Lines: PayrollJELine[] = [
    {
      account: config.grossSalaryAccount,
      debit: gross,
      credit: 0,
      details: 'שכר ברוטו',
    },
  ];
  if (niE > 0) {
    r1Lines.push({
      account: config.niLiabilityAccount,
      debit: 0,
      credit: niE,
      details: 'ביטוח לאומי (עובד)',
    });
  }
  if (incomeTax > 0) {
    r1Lines.push({
      account: config.incomeTaxLiabilityAccount,
      debit: 0,
      credit: incomeTax,
      details: 'מס הכנסה',
    });
  }
  if (pensionE > 0) {
    r1Lines.push({
      account: config.pensionLiabilityAccount,
      debit: 0,
      credit: pensionE,
      details: 'פנסיה (עובד)',
    });
  }
  if (studyE > 0) {
    r1Lines.push({
      account: config.studyFundLiabilityAccount,
      debit: 0,
      credit: studyE,
      details: 'השתלמות (עובד)',
    });
  }
  if (net > 0) {
    r1Lines.push({
      account: config.netToEmployeeAccount,
      debit: 0,
      credit: net,
      details: `נטו לעובד ${entry.employeeName}`,
    });
  }

  const record1: PayrollJERecord = {
    scenario: 'PAYROLL_MONTHLY',
    reference1,
    documentDate: entry.monthDate,
    valueDate: entry.monthDate,
    details: `${baseDetails} (גרוס/נטו)`,
    transactionType: config.transactionType,
    recordIndex: 0,
    lines: r1Lines,
    notes: [
      `שכר ברוטו: ${gross.toFixed(2)} ₪`,
      `נטו לעובד: ${net.toFixed(2)} ₪`,
      `סך ניכויים מהעובד: ${totalEmployeeDeductions.toFixed(2)} ₪`,
    ],
  };

  /* ── Record 2: employer contributions ───────────────────────────── */
  const records: PayrollJERecord[] = [record1];

  if (totalEmployer > 0) {
    const r2Lines: PayrollJELine[] = [
      {
        account: config.socialExpensesAccount,
        debit: totalEmployer,
        credit: 0,
        details: 'הוצאות סוציאליות מעסיק',
      },
    ];
    if (niEmp > 0) {
      r2Lines.push({
        account: config.niLiabilityAccount,
        debit: 0,
        credit: niEmp,
        details: 'ביטוח לאומי (מעביד)',
      });
    }
    if (pensionEmp > 0) {
      r2Lines.push({
        account: config.pensionLiabilityAccount,
        debit: 0,
        credit: pensionEmp,
        details: 'פנסיה (מעביד)',
      });
    }
    if (studyEmp > 0) {
      r2Lines.push({
        account: config.studyFundLiabilityAccount,
        debit: 0,
        credit: studyEmp,
        details: 'השתלמות (מעביד)',
      });
    }
    if (severance > 0) {
      r2Lines.push({
        account: config.severanceLiabilityAccount,
        debit: 0,
        credit: severance,
        details: 'פיצויים (מעביד)',
      });
    }

    records.push({
      scenario: 'PAYROLL_EMPLOYER',
      reference1,
      documentDate: entry.monthDate,
      valueDate: entry.monthDate,
      details: `${baseDetails} (הפרשות מעביד)`,
      transactionType: config.transactionType,
      recordIndex: 1,
      lines: r2Lines,
      notes: [
        `סך עלות מעביד מעבר לברוטו: ${totalEmployer.toFixed(2)} ₪`,
        `עלות העסקה כוללת: ${roundCents(gross + totalEmployer).toFixed(2)} ₪`,
      ],
    });
  }

  /* ── Record 3: net payment to employee ──────────────────────────── */
  if (net > 0) {
    records.push({
      scenario: 'PAYROLL_PAYMENT',
      reference1,
      documentDate: entry.monthDate,
      valueDate: entry.monthDate,
      details: `${baseDetails} (תשלום נטו)`,
      transactionType: config.transactionType,
      recordIndex: 2,
      lines: [
        {
          account: config.netToEmployeeAccount,
          debit: net,
          credit: 0,
          details: `סגירת חוב לעובד ${entry.employeeName}`,
        },
        {
          account: config.bankAccount,
          debit: 0,
          credit: net,
          details: 'תשלום משכורת',
        },
      ],
      notes: ['העברה בפועל לעובד; סוגרת את חשבון 230-9.'],
    });
  }

  // Sanity: every record balanced.
  for (const rec of records) {
    const dr = rec.lines.reduce((s, l) => s + l.debit, 0);
    const cr = rec.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(dr - cr) > 0.05) {
      warnings.push(
        `${rec.scenario}: לא מאוזן (DR=${dr.toFixed(2)}, CR=${cr.toFixed(2)}).`,
      );
    }
  }

  return { records, warnings };
}
