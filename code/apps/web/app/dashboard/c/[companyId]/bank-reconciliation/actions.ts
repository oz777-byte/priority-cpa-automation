'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { parseBankCsv, hashRow, type ParsedTxn } from './csv-parser';

const optString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const ManualInput = z.object({
  companyId: z.string().uuid(),
  bank_name: optString(40),
  bank_account_number: optString(40),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות YYYY-MM-DD'),
  description: z.string().trim().min(2).max(200),
  reference: optString(40),
  amount_ils: z.coerce.number(),
  currency: z.string().trim().default('ILS'),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export async function addManualTxnAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = ManualInput.safeParse({
    companyId: formData.get('companyId'),
    bank_name: formData.get('bank_name') ?? undefined,
    bank_account_number: formData.get('bank_account_number') ?? undefined,
    txn_date: formData.get('txn_date'),
    description: formData.get('description'),
    reference: formData.get('reference') ?? undefined,
    amount_ils: formData.get('amount_ils'),
    currency: formData.get('currency') ?? 'ILS',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, ...payload } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { data: row, error } = await admin
    .from('bank_transactions')
    .insert({
      company_id: company.id,
      ...payload,
      source: 'manual',
      created_by: me.id,
    })
    .select('id')
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'יצירת תנועה נכשלה' };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'bank_txn.create',
    entityType: 'bank_transaction',
    entityId: row.id as string,
    payload: { source: 'manual', ...payload, created_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return { ok: true };
}

export interface CsvImportResult {
  ok: boolean;
  error?: string;
  imported?: number;
  duplicates?: number;
  rejected?: number;
}

export async function importCsvAction(
  formData: FormData,
): Promise<CsvImportResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyIdParse = z.string().uuid().safeParse(formData.get('companyId'));
  if (!companyIdParse.success) return { ok: false, error: 'companyId לא תקין' };

  const bankName = ((formData.get('bank_name') as string | null) ?? '').trim();
  const bankAccount = ((formData.get('bank_account_number') as string | null) ?? '').trim();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'נא לבחור קובץ CSV' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'קובץ גדול מדי — מקסימום 5MB' };
  }

  const text = await file.text();
  const { rows, rejected } = parseBankCsv(text);
  if (rows.length === 0) {
    return { ok: false, error: 'לא נמצאו תנועות בקובץ', rejected: rejected.length };
  }

  const company = await loadCompanyForUser(me.id, me.email, companyIdParse.data);

  // Build dedup keys; importing the same statement twice should be a no-op.
  const importBatchId = createHash('sha256')
    .update(text)
    .digest('hex')
    .slice(0, 16);

  const records = rows.map((r: ParsedTxn) => ({
    company_id: company.id,
    bank_name: bankName || null,
    bank_account_number: bankAccount || null,
    txn_date: r.date,
    description: r.description,
    reference: r.reference,
    amount_ils: r.amount,
    currency: 'ILS',
    balance_after: r.balance,
    source: 'csv' as const,
    source_id: hashRow(bankAccount || importBatchId, r.date, r.amount, r.balance),
    created_by: me.id,
  }));

  // Upsert with ignore-duplicates semantics on (company_id, source, source_id).
  const { data: inserted, error } = await admin
    .from('bank_transactions')
    .upsert(records, {
      onConflict: 'company_id,source,source_id',
      ignoreDuplicates: true,
    })
    .select('id');
  if (error) {
    return { ok: false, error: error.message };
  }

  const importedCount = (inserted ?? []).length;
  const duplicates = rows.length - importedCount;

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'bank_txn.import_csv',
    entityType: 'company',
    entityId: company.id,
    payload: {
      bank_name: bankName || null,
      bank_account_number: bankAccount || null,
      imported: importedCount,
      duplicates,
      rejected: rejected.length,
      file_name: file.name,
      imported_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return {
    ok: true,
    imported: importedCount,
    duplicates,
    rejected: rejected.length,
  };
}

export async function deleteTxnAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const txnId = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { error } = await admin
    .from('bank_transactions')
    .delete()
    .eq('id', txnId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'bank_txn.delete',
    entityType: 'bank_transaction',
    entityId: txnId,
    payload: { deleted_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return { ok: true };
}

export async function setTxnStatusAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const txnId = z.string().uuid().parse(formData.get('id'));
  const status = z
    .enum(['unreconciled', 'matched', 'ignored'])
    .parse(formData.get('status'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { error } = await admin
    .from('bank_transactions')
    .update({ status })
    .eq('id', txnId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'bank_txn.status_change',
    entityType: 'bank_transaction',
    entityId: txnId,
    payload: { status, changed_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return { ok: true };
}
