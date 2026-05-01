import type { ValidationContext } from '@priority-cpa/je-validator';
import type { MoveInConfig } from '@priority-cpa/movein-generator';

/**
 * Hard-coded Tari company config matching the POC. This will move to the
 * `companies` table in the DB once we wire up multi-company management.
 */
export const TARI_VALIDATION_CONTEXT: ValidationContext = {
  companyId: 'tari',
  expenseAccount: '502-0',
  vatInputAccount: '205-2',
  knownAccounts: new Set(['502-0', '205-2', '200087', '200037']),
  knownSupplierCodes: new Set(['200087', '200037']),
};

export const TARI_MOVEIN_CONFIG: MoveInConfig = {
  transactionType: 'מ',
  expenseAccount: '502-0',
  vatInputAccount: '205-2',
  currency: 'ILS',
  detailsPrefix: 'קניות',
};
