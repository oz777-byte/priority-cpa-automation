'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import type { CompanySettings } from '@/lib/company-config';

// Account fields use Israeli chart-of-accounts conventions: digits,
// optionally with hyphenated suffix (e.g. 502-0, 200087, 121-0).
const account = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]+(-[0-9A-Za-z]+)?$/, 'מספר חשבון לא תקין')
  .max(15);

const optAccount = account.optional().or(z.literal('').transform(() => undefined));

const Input = z.object({
  companyId: z.string().uuid(),
  expense_account: optAccount,
  vat_input_account: optAccount,
  transaction_type: z.string().trim().max(3).optional().or(z.literal('').transform(() => undefined)),
  details_prefix: z.string().trim().max(30).optional().or(z.literal('').transform(() => undefined)),
  currency: z.enum(['ILS', 'USD', 'EUR', 'GBP']).optional(),
  payment_account_cash: optAccount,
  payment_account_card: optAccount,
  payment_account_bank: optAccount,
  withholding_account: optAccount,
  non_deductible_account: optAccount,
  // Top-level VAT meta on companies table (not in settings jsonb).
  vat_basis: z.enum(['accrual', 'cash']).optional(),
  vat_filing_frequency: z.enum(['monthly', 'bimonthly', 'annual']).optional(),
});

export interface UpdateSettingsResult {
  ok: boolean;
  error?: string;
}

export async function updateCompanySettingsAction(
  formData: FormData,
): Promise<UpdateSettingsResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    expense_account: formData.get('expense_account') ?? undefined,
    vat_input_account: formData.get('vat_input_account') ?? undefined,
    transaction_type: formData.get('transaction_type') ?? undefined,
    details_prefix: formData.get('details_prefix') ?? undefined,
    currency: formData.get('currency') ?? undefined,
    payment_account_cash: formData.get('payment_account_cash') ?? undefined,
    payment_account_card: formData.get('payment_account_card') ?? undefined,
    payment_account_bank: formData.get('payment_account_bank') ?? undefined,
    withholding_account: formData.get('withholding_account') ?? undefined,
    non_deductible_account: formData.get('non_deductible_account') ?? undefined,
    vat_basis: formData.get('vat_basis') ?? undefined,
    vat_filing_frequency: formData.get('vat_filing_frequency') ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }
  const { companyId, vat_basis, vat_filing_frequency, ...incoming } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Merge with existing — only overwrite fields actually present in the form.
  const previous = (company.settings ?? {}) as CompanySettings;
  const merged: CompanySettings = { ...previous };
  for (const [k, v] of Object.entries(incoming) as Array<[keyof CompanySettings, string | undefined]>) {
    if (v === undefined) {
      delete merged[k];
    } else {
      (merged as Record<string, string>)[k] = v;
    }
  }

  // Build top-level update payload (vat_basis + vat_filing_frequency are columns, not jsonb).
  const updatePayload: Record<string, unknown> = { settings: merged };
  if (vat_basis) updatePayload.vat_basis = vat_basis;
  if (vat_filing_frequency) updatePayload.vat_filing_frequency = vat_filing_frequency;

  const { error } = await admin
    .from('companies')
    .update(updatePayload)
    .eq('id', company.id);
  if (error) {
    return { ok: false, error: error.message };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'company.settings.update',
    entityType: 'company',
    entityId: company.id,
    payload: {
      changed_by: me.email,
      previous,
      next: merged,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}`, 'layout');
  return { ok: true };
}
