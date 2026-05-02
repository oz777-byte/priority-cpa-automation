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

export interface AutoMatchResult {
  ok: boolean;
  error?: string;
  scanned?: number;
  matched?: number;
  ambiguous?: number;
  unmatched?: number;
}

const MATCH_WINDOW_DAYS = 7;
const AMOUNT_TOLERANCE = 0.01;

/**
 * Scan unreconciled bank transactions and link each to a JE when the
 * match is unambiguous. Match criteria:
 *   - bank txn is an outflow (negative amount)
 *   - some JE has |bank amount| = sum-of-debits (== sum-of-credits)
 *   - JE document_date within ±7 days of txn_date
 *   - JE not already matched to a different bank txn
 * If multiple JEs match a single txn, the txn is left for manual review.
 */
export async function autoMatchAction(
  formData: FormData,
): Promise<AutoMatchResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Bank txns to consider: unreconciled, with negative amount (outflows).
  const { data: txnRows } = await admin
    .from('bank_transactions')
    .select('id, txn_date, amount_ils')
    .eq('company_id', company.id)
    .eq('status', 'unreconciled')
    .lt('amount_ils', 0);
  const txns = (txnRows ?? []) as Array<{
    id: string;
    txn_date: string;
    amount_ils: number;
  }>;

  if (txns.length === 0) {
    return { ok: true, scanned: 0, matched: 0, ambiguous: 0, unmatched: 0 };
  }

  // Candidate JEs: not already linked to a bank txn (i.e., no bank txn has
  // matched_je_id = this JE's id).
  const { data: jeRows } = await admin
    .from('journal_entries')
    .select('id, document_date')
    .eq('company_id', company.id);

  const { data: lineRows } = await admin
    .from('journal_entry_lines')
    .select('je_id, debit')
    .in(
      'je_id',
      ((jeRows ?? []) as Array<{ id: string }>).map((j) => j.id),
    );

  const { data: alreadyMatched } = await admin
    .from('bank_transactions')
    .select('matched_je_id')
    .eq('company_id', company.id)
    .not('matched_je_id', 'is', null);
  const matchedSet = new Set(
    ((alreadyMatched ?? []) as Array<{ matched_je_id: string | null }>)
      .map((r) => r.matched_je_id)
      .filter((v): v is string => !!v),
  );

  // total per JE = sum of debit amounts (== credit by balance).
  const totalByJE = new Map<string, number>();
  for (const l of (lineRows ?? []) as Array<{ je_id: string; debit: number }>) {
    totalByJE.set(l.je_id, (totalByJE.get(l.je_id) ?? 0) + Number(l.debit));
  }

  const candidates = ((jeRows ?? []) as Array<{ id: string; document_date: string }>)
    .filter((j) => !matchedSet.has(j.id))
    .map((j) => ({
      id: j.id,
      date: j.document_date,
      total: Math.round((totalByJE.get(j.id) ?? 0) * 100) / 100,
    }))
    .filter((j) => j.total > 0);

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const usedJEIds = new Set<string>();

  // Sort txns by date to make matching deterministic when there are dupes.
  txns.sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  for (const txn of txns) {
    const target = Math.round(Math.abs(Number(txn.amount_ils)) * 100) / 100;
    const txnTime = new Date(txn.txn_date).getTime();

    const found = candidates.filter((c) => {
      if (usedJEIds.has(c.id)) return false;
      if (Math.abs(c.total - target) > AMOUNT_TOLERANCE) return false;
      const days =
        Math.abs(txnTime - new Date(c.date).getTime()) / (24 * 60 * 60 * 1000);
      return days <= MATCH_WINDOW_DAYS;
    });

    if (found.length === 1) {
      const je = found[0]!;
      const { error } = await admin
        .from('bank_transactions')
        .update({ status: 'matched', matched_je_id: je.id })
        .eq('id', txn.id)
        .eq('company_id', company.id);
      if (!error) {
        matched++;
        usedJEIds.add(je.id);
      }
    } else if (found.length > 1) {
      ambiguous++;
    } else {
      unmatched++;
    }
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'bank_txn.auto_match',
    entityType: 'company',
    entityId: company.id,
    payload: {
      scanned: txns.length,
      matched,
      ambiguous,
      unmatched,
      window_days: MATCH_WINDOW_DAYS,
      requested_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/bank-reconciliation`);
  return {
    ok: true,
    scanned: txns.length,
    matched,
    ambiguous,
    unmatched,
  };
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
