'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  constructPayrollJEs,
  type PayrollConfig,
  type PayrollEntry,
} from '@priority-cpa/je-constructor';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { type CompanySettings } from '@/lib/company-config';

const Input = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  employee_id: z.string().trim().min(1).max(20),
  employee_name: z.string().trim().min(1).max(100),
  month_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות YYYY-MM-DD'),
  gross: z.coerce.number().nonnegative(),
  ni_employee: z.coerce.number().nonnegative().default(0),
  income_tax: z.coerce.number().nonnegative().default(0),
  pension_employee: z.coerce.number().nonnegative().default(0),
  study_fund_employee: z.coerce.number().nonnegative().default(0),
  ni_employer: z.coerce.number().nonnegative().default(0),
  pension_employer: z.coerce.number().nonnegative().default(0),
  study_fund_employer: z.coerce.number().nonnegative().default(0),
  severance_employer: z.coerce.number().nonnegative().default(0),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

function buildConfig(settings: CompanySettings): PayrollConfig {
  return {
    grossSalaryAccount: '600-0',
    socialExpensesAccount: '601-0',
    niLiabilityAccount: '230-1',
    incomeTaxLiabilityAccount: '230-2',
    pensionLiabilityAccount: '230-3',
    studyFundLiabilityAccount: '230-4',
    severanceLiabilityAccount: '230-5',
    netToEmployeeAccount: '230-9',
    bankAccount: settings.payment_account_bank ?? '121-0',
    transactionType: settings.transaction_type ?? 'מ',
  };
}

function coerceNumber(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

export async function upsertPayrollEntryAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    employee_id: formData.get('employee_id'),
    employee_name: formData.get('employee_name'),
    month_date: formData.get('month_date'),
    gross: formData.get('gross'),
    ni_employee: coerceNumber(formData.get('ni_employee')) ?? 0,
    income_tax: coerceNumber(formData.get('income_tax')) ?? 0,
    pension_employee: coerceNumber(formData.get('pension_employee')) ?? 0,
    study_fund_employee: coerceNumber(formData.get('study_fund_employee')) ?? 0,
    ni_employer: coerceNumber(formData.get('ni_employer')) ?? 0,
    pension_employer: coerceNumber(formData.get('pension_employer')) ?? 0,
    study_fund_employer: coerceNumber(formData.get('study_fund_employer')) ?? 0,
    severance_employer: coerceNumber(formData.get('severance_employer')) ?? 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, ...payload } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Insert or update the entry itself.
  let entryId: string;
  if (id) {
    const { error } = await admin
      .from('payroll_entries')
      .update(payload)
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) {
      if (error.code === '23505')
        return { ok: false, error: 'רשומה לעובד הזה בחודש הזה כבר קיימת' };
      return { ok: false, error: error.message };
    }
    entryId = id;
  } else {
    const { data: row, error } = await admin
      .from('payroll_entries')
      .insert({ company_id: company.id, status: 'queued', ...payload })
      .select('id')
      .single();
    if (error || !row) {
      if (error?.code === '23505')
        return { ok: false, error: 'רשומה לעובד הזה בחודש הזה כבר קיימת' };
      return { ok: false, error: error?.message ?? 'יצירת רשומת שכר נכשלה' };
    }
    entryId = row.id as string;
  }

  // Build the 3 JEs. Always re-create on every save: clear old JEs first.
  const settings = (company.settings ?? {}) as CompanySettings;
  const config = buildConfig(settings);

  const entry: PayrollEntry = {
    employeeId: payload.employee_id,
    employeeName: payload.employee_name,
    monthDate: payload.month_date,
    gross: payload.gross,
    niEmployee: payload.ni_employee,
    incomeTax: payload.income_tax,
    pensionEmployee: payload.pension_employee,
    studyFundEmployee: payload.study_fund_employee,
    niEmployer: payload.ni_employer,
    pensionEmployer: payload.pension_employer,
    studyFundEmployer: payload.study_fund_employer,
    severanceEmployer: payload.severance_employer,
  };
  const result = constructPayrollJEs(entry, config);

  // Remove any prior JEs linked to this entry (re-creation flow).
  await admin
    .from('journal_entry_lines')
    .delete()
    .in(
      'je_id',
      // Subquery via 'in' selecting all JEs linked to this payroll entry
      ((
        await admin
          .from('journal_entries')
          .select('id')
          .eq('payroll_entry_id', entryId)
      ).data ?? []).map((r) => r.id as string),
    );
  await admin.from('journal_entries').delete().eq('payroll_entry_id', entryId);

  // Insert the new JEs.
  for (const record of result.records) {
    const { data: jeRow, error: jeErr } = await admin
      .from('journal_entries')
      .insert({
        company_id: company.id,
        payroll_entry_id: entryId,
        scenario: record.scenario,
        movein_format: '180',
        status: 'draft',
        transaction_type: record.transactionType,
        reference1: record.reference1,
        document_date: record.documentDate,
        value_date: record.valueDate,
        currency: 'ILS',
        details: record.details,
        created_by: me.id,
        validation_results: {
          payroll_scenario: record.scenario,
          notes: record.notes,
          warnings: result.warnings,
        },
      })
      .select('id')
      .single();
    if (jeErr || !jeRow) continue;

    const linesPayload = record.lines.map((l, i) => ({
      je_id: jeRow.id,
      line_no: i + 1,
      account: l.account,
      debit: l.debit,
      credit: l.credit,
      ...(l.details ? { details: l.details } : {}),
    }));
    await admin.from('journal_entry_lines').insert(linesPayload);
  }

  await admin
    .from('payroll_entries')
    .update({ status: 'posted' })
    .eq('id', entryId);

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: id ? 'payroll.update' : 'payroll.create',
    entityType: 'payroll_entry',
    entityId: entryId,
    payload: {
      employee_id: payload.employee_id,
      employee_name: payload.employee_name,
      month: payload.month_date,
      gross: payload.gross,
      records_built: result.records.length,
      created_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/payroll`);
  return { ok: true };
}

export async function deletePayrollEntryAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const id = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Cascade delete the linked JEs first.
  const { data: jes } = await admin
    .from('journal_entries')
    .select('id')
    .eq('payroll_entry_id', id);
  const jeIds = ((jes ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (jeIds.length > 0) {
    await admin.from('journal_entry_lines').delete().in('je_id', jeIds);
    await admin.from('journal_entries').delete().in('id', jeIds);
  }

  const { error } = await admin
    .from('payroll_entries')
    .delete()
    .eq('id', id)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'payroll.delete',
    entityType: 'payroll_entry',
    entityId: id,
    payload: { deleted_by: me.email, je_count: jeIds.length },
  });

  revalidatePath(`/dashboard/c/${company.id}/payroll`);
  return { ok: true };
}
