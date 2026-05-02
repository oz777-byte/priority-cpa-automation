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
const optNumber = z
  .union([z.coerce.number(), z.literal('').transform(() => undefined)])
  .optional();

const Input = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  name: z.string().trim().min(2, 'שם לקוח חייב להיות לפחות 2 תווים').max(100),
  internal_code: z.string().trim().min(1, 'קוד לקוח נדרש').max(15),
  tax_id: optString(15),
  email: optString(120),
  phone: optString(40),
  address: optString(200),
  default_revenue_account: optAccount,
  withholding_percent: optNumber,
  payment_terms: optString(40),
  notes: optString(500),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export async function upsertCustomerAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    name: formData.get('name'),
    internal_code: formData.get('internal_code'),
    tax_id: formData.get('tax_id') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    address: formData.get('address') ?? undefined,
    default_revenue_account: formData.get('default_revenue_account') ?? undefined,
    withholding_percent: formData.get('withholding_percent') ?? undefined,
    payment_terms: formData.get('payment_terms') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, ...payload } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  if (id) {
    const { error } = await admin
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'קוד לקוח כבר קיים' };
      return { ok: false, error: error.message };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      payload: { changed_by: me.email, ...payload },
    });
  } else {
    const { data: row, error } = await admin
      .from('customers')
      .insert({ company_id: company.id, ...payload })
      .select('id')
      .single();
    if (error || !row) {
      if (error?.code === '23505') return { ok: false, error: 'קוד לקוח כבר קיים' };
      return { ok: false, error: error?.message ?? 'יצירת לקוח נכשלה' };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'customer.create',
      entityType: 'customer',
      entityId: row.id as string,
      payload: { created_by: me.email, ...payload },
    });
  }

  revalidatePath(`/dashboard/c/${company.id}/customers`);
  return { ok: true };
}

export async function deleteCustomerAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const customerId = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { data: customer } = await admin
    .from('customers')
    .select('name, internal_code')
    .eq('id', customerId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!customer) return { ok: false, error: 'הלקוח לא נמצא' };

  const { error } = await admin
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'customer.delete',
    entityType: 'customer',
    entityId: customerId,
    payload: {
      deleted_by: me.email,
      name: customer.name,
      internal_code: customer.internal_code,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/customers`);
  return { ok: true };
}
