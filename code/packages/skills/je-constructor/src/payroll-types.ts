/**
 * Payroll JE scenarios — three records per employee-month:
 *   1. PAYROLL_MONTHLY  — gross → deductions + net
 *   2. PAYROLL_EMPLOYER — employer contributions (NI, pension, severance)
 *   3. PAYROLL_PAYMENT  — bank transfer that clears the net liability
 *
 * Built from a single PayrollEntry input.
 */

export type PayrollScenario =
  | 'PAYROLL_MONTHLY'
  | 'PAYROLL_EMPLOYER'
  | 'PAYROLL_PAYMENT';

export interface PayrollConfig {
  // Expense (employer-side) accounts
  grossSalaryAccount: string;        // 600-0
  socialExpensesAccount: string;     // 601-0

  // Liability accounts (deductions held until paid to authority)
  niLiabilityAccount: string;        // 230-1 ביטוח לאומי
  incomeTaxLiabilityAccount: string; // 230-2 מס הכנסה
  pensionLiabilityAccount: string;   // 230-3 פנסיה
  studyFundLiabilityAccount: string; // 230-4 השתלמות
  severanceLiabilityAccount: string; // 230-5 פיצויים

  // Payable to the employee (cleared on payment)
  netToEmployeeAccount: string;      // 230-9

  // Bank from which net is paid
  bankAccount: string;               // 121-0

  transactionType: string;
}

export interface PayrollEntry {
  /** Employee identifier (ת.ז or internal code). Used as reference1. */
  employeeId: string;
  /** Display name. */
  employeeName: string;
  /** Month being paid for, ISO YYYY-MM-DD (typically last day of the month). */
  monthDate: string;
  /** Gross salary before any deductions. */
  gross: number;

  /* ── employee-side deductions (come off gross) ── */
  niEmployee: number;        // ביטוח לאומי עובד
  incomeTax: number;         // מס הכנסה
  pensionEmployee: number;   // פנסיה עובד
  studyFundEmployee: number; // השתלמות עובד

  /* ── employer-side contributions (additional cost on top of gross) ── */
  niEmployer: number;        // ביטוח לאומי מעביד
  pensionEmployer: number;   // פנסיה מעביד
  studyFundEmployer: number; // השתלמות מעביד
  severanceEmployer: number; // פיצויים מעביד
}

export interface PayrollJELine {
  account: string;
  debit: number;
  credit: number;
  details?: string;
}

export interface PayrollJERecord {
  scenario: PayrollScenario;
  reference1: string;
  documentDate: string;
  valueDate: string;
  details: string;
  transactionType: string;
  recordIndex: number;
  lines: PayrollJELine[];
  notes: string[];
}

export interface PayrollConstructResult {
  records: PayrollJERecord[]; // typically 3, in order
  warnings: string[];
}
