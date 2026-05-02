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
  .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
  .optional();

const Input = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  name: z.string().trim().min(1).max(120),
  internal_code: z.string().trim().min(1).max(20),
  description: optString(500),
  unit: optString(20),
  default_unit_price: optNumber,
  default_revenue_account: optAccount,
  vat_category: z.enum(['standard', 'zero', 'exempt']).default('standard'),
  is_active: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
    .transform((v) => v === 'on' || v === 'true')
    .optional(),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export async function upsertItemAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    name: formData.get('name'),
    internal_code: formData.get('internal_code'),
    description: formData.get('description') ?? undefined,
    unit: formData.get('unit') ?? undefined,
    default_unit_price: formData.get('default_unit_price') ?? undefined,
    default_revenue_account: formData.get('default_revenue_account') ?? undefined,
    vat_category: formData.get('vat_category') ?? 'standard',
    is_active: (formData.get('is_active') as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, is_active, ...rest } = parsed.data;
  const payload = { ...rest, is_active: is_active ?? true };
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  if (id) {
    const { error } = await admin
      .from('items')
      .update(payload)
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'קוד פריט כבר קיים' };
      return { ok: false, error: error.message };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'item.update',
      entityType: 'item',
      entityId: id,
      payload: { changed_by: me.email, ...payload },
    });
  } else {
    const { data: row, error } = await admin
      .from('items')
      .insert({ company_id: company.id, ...payload })
      .select('id')
      .single();
    if (error || !row) {
      if (error?.code === '23505') return { ok: false, error: 'קוד פריט כבר קיים' };
      return { ok: false, error: error?.message ?? 'יצירת פריט נכשלה' };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'item.create',
      entityType: 'item',
      entityId: row.id as string,
      payload: { created_by: me.email, ...payload },
    });
  }

  revalidatePath(`/dashboard/c/${company.id}/items`);
  return { ok: true };
}

export async function deleteItemAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const itemId = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { error } = await admin
    .from('items')
    .delete()
    .eq('id', itemId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'item.delete',
    entityType: 'item',
    entityId: itemId,
    payload: { deleted_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/items`);
  return { ok: true };
}
