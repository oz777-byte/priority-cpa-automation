'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const account = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]+(-[0-9A-Za-z]+)?$/, 'מספר חשבון לא תקין')
  .max(15);

const optAccount = account.optional().or(z.literal('').transform(() => undefined));
const optString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const SupplierInput = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  name: z.string().trim().min(2, 'שם ספק חייב להיות לפחות 2 תווים').max(100),
  internal_code: z
    .string()
    .trim()
    .min(1, 'קוד ספק נדרש')
    .max(15),
  tax_id: optString(15),
  dealer_status: z.enum(['registered', 'exempt', 'foreign']).default('registered'),
  default_expense_account: optAccount,
  default_cost_center: optString(15),
  payment_terms: optString(40),
});

export interface SupplierMutationResult {
  ok: boolean;
  error?: string;
}

export async function upsertSupplierAction(
  formData: FormData,
): Promise<SupplierMutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = SupplierInput.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    name: formData.get('name'),
    internal_code: formData.get('internal_code'),
    tax_id: formData.get('tax_id') ?? undefined,
    dealer_status: formData.get('dealer_status') ?? 'registered',
    default_expense_account: formData.get('default_expense_account') ?? undefined,
    default_cost_center: formData.get('default_cost_center') ?? undefined,
    payment_terms: formData.get('payment_terms') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, ...payload } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  if (id) {
    const { error } = await admin
      .from('suppliers')
      .update({ ...payload })
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'קוד ספק כבר קיים בחברה זו' };
      }
      return { ok: false, error: error.message };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'supplier.update',
      entityType: 'supplier',
      entityId: id,
      payload: { changed_by: me.email, ...payload },
    });
  } else {
    const { data: row, error } = await admin
      .from('suppliers')
      .insert({ company_id: company.id, ...payload })
      .select('id')
      .single();
    if (error || !row) {
      if (error?.code === '23505') {
        return { ok: false, error: 'קוד ספק כבר קיים בחברה זו' };
      }
      return { ok: false, error: error?.message ?? 'יצירת ספק נכשלה' };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'supplier.create',
      entityType: 'supplier',
      entityId: row.id as string,
      payload: { created_by: me.email, ...payload },
    });
  }

  revalidatePath(`/dashboard/c/${company.id}/suppliers`);
  return { ok: true };
}

export async function deleteSupplierAction(
  formData: FormData,
): Promise<SupplierMutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const supplierId = z.string().uuid().parse(formData.get('id'));

  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Block deletion if any invoice references this supplier's tax_id within
  // the same company. Prevents orphaning historical canonical data.
  const { data: supplier } = await admin
    .from('suppliers')
    .select('tax_id, internal_code, name')
    .eq('id', supplierId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!supplier) {
    return { ok: false, error: 'הספק לא נמצא' };
  }

  if (supplier.tax_id) {
    const { count } = await admin
      .from('invoices_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .filter('canonical->supplier->>tax_id', 'eq', supplier.tax_id);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `לא ניתן למחוק — קיימות ${count} חשבוניות מקושרות לספק זה`,
      };
    }
  }

  const { error } = await admin
    .from('suppliers')
    .delete()
    .eq('id', supplierId)
    .eq('company_id', company.id);
  if (error) {
    return { ok: false, error: error.message };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'supplier.delete',
    entityType: 'supplier',
    entityId: supplierId,
    payload: {
      deleted_by: me.email,
      name: supplier.name,
      internal_code: supplier.internal_code,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/suppliers`);
  return { ok: true };
}
