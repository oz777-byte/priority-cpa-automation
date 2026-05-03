'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  constructCashBankJE,
  type CashBankConfig,
  type CashBankScenario,
} from '@priority-cpa/je-constructor';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { type CompanySettings } from '@/lib/company-config';

const Input = z.object({
  companyId: z.string().uuid(),
  txnId: z.string().uuid(),
  scenario: z.enum([
    'BANK_FEE',
    'INTEREST_INCOME',
    'INTEREST_EXPENSE',
    'INTER_ACCOUNT_TRANSFER',
    'CASH_DEPOSIT',
    'CASH_WITHDRAWAL',
    'BOUNCED_CHECK',
    'CARD_CLEARING_FEE',
  ]),
  destinationBankAccount: z
    .string()
    .trim()
    .max(15)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  customerAccount: z
    .string()
    .trim()
    .max(15)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  bouncedFee: z
    .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
    .optional(),
});

export interface CreateCashBankJEResult {
  ok: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Build a JE for a bank transaction that's not tied to an invoice
 * (fees, interest, transfers, bounced checks, etc.) and link the JE
 * to the source bank_transactions row. Marks the txn as 'matched'.
 */
export async function createJEFromBankTxnAction(
  formData: FormData,
): Promise<CreateCashBankJEResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    txnId: formData.get('txnId'),
    scenario: formData.get('scenario'),
    destinationBankAccount: formData.get('destinationBankAccount') ?? undefined,
    customerAccount: formData.get('customerAccount') ?? undefined,
    bouncedFee: formData.get('bouncedFee') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, txnId, scenario, ...extras } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { data: txn } = await admin
    .from('bank_transactions')
    .select(
      'id, txn_date, description, reference, amount_ils, bank_account_number, status',
    )
    .eq('id', txnId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!txn) {
    return { ok: false, error: 'התנועה לא נמצאה' };
  }
  if (txn.status === 'matched') {
    return { ok: false, error: 'התנועה כבר מותאמת ל-JE קיים' };
  }

  const settings = (company.settings ?? {}) as CompanySettings;
  const config: CashBankConfig = {
    bankAccount: settings.payment_account_bank ?? '121-0',
    cashAccount: settings.payment_account_cash ?? '100-0',
    bankFeesAccount: '522-0',
    interestIncomeAccount: '743-0',
    interestExpenseAccount: '624-0',
    cardClearingAccount: settings.card_clearing_account ?? '125-0',
    cardFeesAccount: '522-1',
    transactionType: settings.transaction_type ?? 'מ',
  };

  const result = constructCashBankJE(
    {
      scenario: scenario as CashBankScenario,
      amount: Math.abs(Number(txn.amount_ils)),
      date: txn.txn_date as string,
      description: txn.description as string,
      ...((txn.reference ? { reference: txn.reference as string } : {}) as object),
      ...(txn.bank_account_number
        ? { sourceBankAccount: settings.payment_account_bank ?? '121-0' }
        : {}),
      ...(extras.destinationBankAccount
        ? { destinationBankAccount: extras.destinationBankAccount }
        : {}),
      ...(extras.customerAccount ? { customerAccount: extras.customerAccount } : {}),
      ...(extras.bouncedFee !== undefined ? { bouncedFee: extras.bouncedFee } : {}),
    },
    config,
  );

  const record = result.record;

  const { data: jeRow, error: jeErr } = await admin
    .from('journal_entries')
    .insert({
      company_id: company.id,
      scenario: record.scenario,
      movein_format: '180',
      status: 'draft',
      transaction_type: record.transactionType,
      reference1: record.reference1,
      document_date: record.documentDate,
      value_date: record.valueDate,
      vat_reporting_date: new Date().toISOString().slice(0, 10),
      currency: 'ILS',
      details: record.details,
      created_by: me.id,
      validation_results: {
        cash_bank_scenario: record.scenario,
        notes: record.notes,
        warnings: result.warnings,
        source_bank_txn_id: txnId,
      },
    })
    .select('id')
    .single();
  if (jeErr || !jeRow) {
    return { ok: false, error: jeErr?.message ?? 'יצירת JE נכשלה' };
  }

  const linesPayload = record.lines.map((l, i) => ({
    je_id: jeRow.id,
    line_no: i + 1,
    account: l.account,
    debit: l.debit,
    credit: l.credit,
    ...(l.details ? { details: l.details } : {}),
  }));
  await admin.from('journal_entry_lines').insert(linesPayload);

  // Link the bank txn to its JE and mark as matched.
  await admin
    .from('bank_transactions')
    .update({ status: 'matched', matched_je_id: jeRow.id })
    .eq('id', txnId)
    .eq('company_id', company.id);

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'je.create',
    entityType: 'journal_entry',
    entityId: jeRow.id as string,
    payload: {
      bank_txn_id: txnId,
      scenario: record.scenario,
      side: 'cash_bank',
      amount: Math.abs(Number(txn.amount_ils)),
      created_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return { ok: true, warnings: result.warnings };
}
