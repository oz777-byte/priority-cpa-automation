import type { ValidationContext } from '@priority-cpa/je-validator';
import type { ConstructorConfig, ARConstructorConfig } from '@priority-cpa/je-constructor';
import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';
import type { MoveInConfig } from '@priority-cpa/movein-generator';

/**
 * Per-company configuration. Stored as JSON on `companies.settings`.
 * Every field is optional — the helpers below substitute sensible
 * Israeli defaults when a value is not configured.
 */
export interface CompanySettings {
  /* ---- defaults used by the JE constructor ---- */
  expense_account?: string;       // 502-0
  vat_input_account?: string;     // 205-2
  details_prefix?: string;        // "קניות"
  transaction_type?: string;      // "מ"
  currency?: string;              // ILS

  /* ---- payment accounts (IMMEDIATE_PAYMENT scenario) ---- */
  payment_account_cash?: string;       // e.g. 100-0
  payment_account_card?: string;       // e.g. 125-0
  payment_account_bank?: string;       // e.g. 121-0  (used for "transfer")

  /* ---- special accounts ---- */
  withholding_account?: string;        // tax authority A/P, e.g. 175-0
  non_deductible_account?: string;     // for MIXED_DEDUCTION, e.g. 502-1

  /* ---- AR (sales) accounts ---- */
  revenue_account?: string;            // 700-0
  services_revenue_account?: string;   // 710-0
  output_vat_account?: string;         // 220-0
  card_clearing_account?: string;      // 125-0
  postdated_checks_account?: string;   // 122-0
  advances_account?: string;           // 230-1 (advance payments from customers)
  bad_debt_account?: string;           // 530-0
  customer_withholding_account?: string; // 175-1 (B2G withholding refundable)
}

export const DEFAULT_SETTINGS = {
  expense_account: '502-0',
  vat_input_account: '205-2',
  details_prefix: 'קניות',
  transaction_type: 'מ',
  currency: 'ILS',
} as const;

export function buildMoveInConfig(settings: CompanySettings): MoveInConfig {
  return {
    transactionType: settings.transaction_type ?? DEFAULT_SETTINGS.transaction_type,
    expenseAccount: settings.expense_account ?? DEFAULT_SETTINGS.expense_account,
    vatInputAccount: settings.vat_input_account ?? DEFAULT_SETTINGS.vat_input_account,
    currency: settings.currency ?? DEFAULT_SETTINGS.currency,
    detailsPrefix: settings.details_prefix ?? DEFAULT_SETTINGS.details_prefix,
  };
}

/**
 * Pick the right payment account for an invoice given its payment_method.
 * Returns undefined if the company hasn't configured an account for that
 * method — the constructor will then fall back to the supplier account
 * and emit a warning.
 */
export function paymentAccountFor(
  s: CompanySettings,
  paymentMethod: CanonicalInvoice['invoice']['payment_method'],
): string | undefined {
  switch (paymentMethod) {
    case 'cash':
      return s.payment_account_cash;
    case 'card':
      return s.payment_account_card;
    case 'transfer':
      return s.payment_account_bank;
    default:
      return undefined;
  }
}

/**
 * Build the full ConstructorConfig for a single invoice. paymentAccount
 * is selected based on the invoice's payment_method.
 */
export function constructorConfigFor(
  settings: CompanySettings,
  canonical: CanonicalInvoice,
): ConstructorConfig {
  const paymentAccount = paymentAccountFor(settings, canonical.invoice.payment_method);
  return {
    expenseAccount: settings.expense_account ?? DEFAULT_SETTINGS.expense_account,
    vatInputAccount: settings.vat_input_account ?? DEFAULT_SETTINGS.vat_input_account,
    detailsPrefix: settings.details_prefix ?? DEFAULT_SETTINGS.details_prefix,
    transactionType: settings.transaction_type ?? DEFAULT_SETTINGS.transaction_type,
    ...(paymentAccount ? { paymentAccount } : {}),
    ...(settings.withholding_account ? { withholdingAccount: settings.withholding_account } : {}),
    ...(settings.non_deductible_account
      ? { nonDeductibleAccount: settings.non_deductible_account }
      : {}),
  };
}

/**
 * Build the AR (sales) constructor config from a company's settings.
 * Defaults align with the seeded baseline COA from migration 0009.
 */
export function arConstructorConfigFor(settings: CompanySettings): ARConstructorConfig {
  return {
    revenueAccount: settings.revenue_account ?? '700-0',
    ...(settings.services_revenue_account
      ? { servicesRevenueAccount: settings.services_revenue_account }
      : {}),
    outputVatAccount: settings.output_vat_account ?? '220-0',
    cashAccount: settings.payment_account_cash ?? '100-0',
    bankAccount: settings.payment_account_bank ?? '121-0',
    cardClearingAccount: settings.card_clearing_account ?? '125-0',
    postdatedChecksAccount: settings.postdated_checks_account ?? '122-0',
    advancesAccount: settings.advances_account ?? '230-1',
    badDebtAccount: settings.bad_debt_account ?? '530-0',
    customerWithholdingAccount: settings.customer_withholding_account ?? '175-1',
    transactionType: settings.transaction_type ?? DEFAULT_SETTINGS.transaction_type,
    detailsPrefix: 'מכירה',
  };
}

export function buildValidationContext(
  companyId: string,
  settings: CompanySettings,
  knownAccounts: Iterable<string>,
  knownSupplierCodes: Iterable<string>,
): ValidationContext {
  return {
    companyId,
    expenseAccount: settings.expense_account ?? DEFAULT_SETTINGS.expense_account,
    vatInputAccount: settings.vat_input_account ?? DEFAULT_SETTINGS.vat_input_account,
    knownAccounts: new Set(knownAccounts),
    knownSupplierCodes: new Set(knownSupplierCodes),
    todayIso: new Date().toISOString().slice(0, 10),
  };
}
