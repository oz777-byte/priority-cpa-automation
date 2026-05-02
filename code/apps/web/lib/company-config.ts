import type { ValidationContext } from '@priority-cpa/je-validator';
import type { MoveInConfig } from '@priority-cpa/movein-generator';

export interface CompanySettings {
  expense_account?: string;
  vat_input_account?: string;
  details_prefix?: string;
  transaction_type?: string;
  currency?: string;
}

export function buildMoveInConfig(settings: CompanySettings): MoveInConfig {
  return {
    transactionType: settings.transaction_type ?? 'מ',
    expenseAccount: settings.expense_account ?? '502-0',
    vatInputAccount: settings.vat_input_account ?? '205-2',
    currency: settings.currency ?? 'ILS',
    detailsPrefix: settings.details_prefix ?? 'קניות',
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
    expenseAccount: settings.expense_account ?? '502-0',
    vatInputAccount: settings.vat_input_account ?? '205-2',
    knownAccounts: new Set(knownAccounts),
    knownSupplierCodes: new Set(knownSupplierCodes),
    todayIso: new Date().toISOString().slice(0, 10),
  };
}
