/**
 * Cash / bank / credit-card JE scenarios — for transactions that aren't
 * tied to a supplier or customer invoice. Built standalone (not from a
 * canonical invoice) given a bank-transaction-shaped input.
 */
export type CashBankScenario =
  | 'BANK_FEE'              // עמלת ניהול / כרטיסים / OS
  | 'INTEREST_INCOME'       // ריבית זכות
  | 'INTEREST_EXPENSE'      // ריבית חובה (overdraft)
  | 'INTER_ACCOUNT_TRANSFER' // העברה בין חשבונות בנק
  | 'CASH_DEPOSIT'          // הפקדת מזומן לבנק
  | 'CASH_WITHDRAWAL'       // משיכת מזומן מהבנק
  | 'BOUNCED_CHECK'         // צ'ק שחזר
  | 'CARD_CLEARING_FEE';    // עמלת סולק אשראי

export interface CashBankConfig {
  /** Primary bank account (121-0). */
  bankAccount: string;
  /** Cash account (100-0). */
  cashAccount?: string;
  /** Bank fees expense (522-0). */
  bankFeesAccount?: string;
  /** Interest income (743-0). */
  interestIncomeAccount?: string;
  /** Interest / financing expense (624-0). */
  interestExpenseAccount?: string;
  /** Card clearing balance account (125-0). */
  cardClearingAccount?: string;
  /** Card-clearing fees expense (522-1). */
  cardFeesAccount?: string;
  transactionType: string;
}

export interface CashBankInput {
  scenario: CashBankScenario;
  /** Always positive — direction implied by scenario. */
  amount: number;
  /** ISO YYYY-MM-DD. */
  date: string;
  /** Source bank account code (optional override of config.bankAccount). */
  sourceBankAccount?: string;
  description: string;
  reference?: string;
  /** For INTER_ACCOUNT_TRANSFER — the receiving account. */
  destinationBankAccount?: string;
  /** For BOUNCED_CHECK — the customer whose check bounced. */
  customerAccount?: string;
  /** For BOUNCED_CHECK — bank's bounced-check fee. */
  bouncedFee?: number;
}

export interface CashBankJELine {
  account: string;
  debit: number;
  credit: number;
  details?: string;
}

export interface CashBankJERecord {
  scenario: CashBankScenario;
  reference1: string;
  documentDate: string;
  valueDate: string;
  details: string;
  transactionType: string;
  lines: CashBankJELine[];
  notes: string[];
}

export interface CashBankConstructResult {
  record: CashBankJERecord;
  warnings: string[];
}
