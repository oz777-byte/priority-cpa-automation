import type { SalesScenario } from '@priority-cpa/invoice-schema';

/**
 * Configuration for the AR (sales) constructor. Customers, like
 * suppliers, have their own internal accounts; revenue/VAT-out are
 * shared. Defaults align with the seeded baseline COA from migration
 * 0009.
 */
export interface ARConstructorConfig {
  /** Default revenue account (700-0). */
  revenueAccount: string;
  /** Default services revenue account (710-0). For service-only invoices. */
  servicesRevenueAccount?: string;
  /** Output VAT account (220-0). */
  outputVatAccount: string;
  /** Active receivable / clearing accounts. */
  cashAccount?: string;            // 100-0
  bankAccount?: string;            // 121-0
  cardClearingAccount?: string;    // 125-0
  postdatedChecksAccount?: string; // 122-0 (optional, fallback to bank)
  /** Liability account for advance payments + proforma invoices. */
  advancesAccount?: string;        // 230-1
  /** Bad debt expense account. */
  badDebtAccount?: string;         // 530-0
  /** Withholding (tax authority A/R) account when customer deducts. */
  customerWithholdingAccount?: string;
  /** Transaction type code. */
  transactionType: string;
  /** Prefix for the JE details field. */
  detailsPrefix: string;
}

export interface ARJELine {
  account: string;
  debit: number;
  credit: number;
  debitFx?: number;
  creditFx?: number;
  details?: string;
  costCenter?: string;
}

export interface ARJERecord {
  reference1: string;
  reference2?: string;
  documentDate: string;
  valueDate: string;
  currency: string;
  details: string;
  transactionType: string;
  scenario: SalesScenario;
  recordIndex: number;
  lines: ARJELine[];
  notes: string[];
}

export interface ARConstructResult {
  primaryScenario: SalesScenario;
  records: ARJERecord[];
  warnings: string[];
}
