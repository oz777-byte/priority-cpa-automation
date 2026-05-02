import type { Scenario } from '@priority-cpa/invoice-schema';

export interface ConstructorConfig {
  expenseAccount: string;
  vatInputAccount: string;
  detailsPrefix: string;
  transactionType: string;
  /**
   * For IMMEDIATE_PAYMENT scenarios — which account paid (bank, cash, credit card).
   * If absent, fall back to the supplier account (= regular A/P).
   */
  paymentAccount?: string;
  /**
   * For WITH_WITHHOLDING scenarios — the tax-authority withholding account.
   */
  withholdingAccount?: string;
  /**
   * For MIXED_DEDUCTION scenarios — the non-deductible side account.
   */
  nonDeductibleAccount?: string;
  /**
   * For CREDIT_NOTE scenarios — keep transaction_type or override with reversal type.
   */
  creditNoteTransactionType?: string;
}

export interface JELine {
  account: string;
  debit: number;
  credit: number;
  /** Foreign-currency debit amount (only for FOREIGN_CURRENCY scenario). */
  debitFx?: number;
  /** Foreign-currency credit amount (only for FOREIGN_CURRENCY scenario). */
  creditFx?: number;
  details?: string;
  costCenter?: string;
}

export interface JERecord {
  reference1: string;
  reference2?: string;
  documentDate: string;
  valueDate: string;
  currency: string;
  details: string;
  transactionType: string;
  scenario: Scenario;
  /** Index in a multi-record JE; 0 for single-record. */
  recordIndex: number;
  lines: JELine[];
  /** Notes for the CPA (e.g. "split because multi-expense", "FLEXIBLE format required"). */
  notes: string[];
}

export interface ConstructResult {
  primaryScenario: Scenario;
  overlays: Scenario[];
  records: JERecord[];
  /** Aggregate validation flags from the construction step (separate from je-validator's gate). */
  warnings: string[];
}
