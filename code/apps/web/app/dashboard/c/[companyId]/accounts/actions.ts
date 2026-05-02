'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const accountCode = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]+(-[0-9A-Za-z]+)?$/, 'מספר חשבון לא תקין')
  .max(15);

const optString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const Input = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  code: accountCode,
  name: z.string().trim().min(1).max(120),
  type: z.enum(['asset', 'liability', 'income', 'expense', 'equity']),
  parent_account_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  is_active: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
    .transform((v) => v === 'on' || v === 'true')
    .optional(),
  notes: optString(500),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export async function upsertAccountAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    code: formData.get('code'),
    name: formData.get('name'),
    type: formData.get('type'),
    parent_account_id: formData.get('parent_account_id') ?? undefined,
    is_active: (formData.get('is_active') as string | null) ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, is_active, ...rest } = parsed.data;
  const payload = { ...rest, is_active: is_active ?? true };
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  if (id) {
    const { error } = await admin
      .from('accounts')
      .update(payload)
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'קוד חשבון כבר קיים' };
      return { ok: false, error: error.message };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'account.update',
      entityType: 'account',
      entityId: id,
      payload: { changed_by: me.email, ...payload },
    });
  } else {
    const { data: row, error } = await admin
      .from('accounts')
      .insert({ company_id: company.id, ...payload })
      .select('id')
      .single();
    if (error || !row) {
      if (error?.code === '23505') return { ok: false, error: 'קוד חשבון כבר קיים' };
      return { ok: false, error: error?.message ?? 'יצירת חשבון נכשלה' };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'account.create',
      entityType: 'account',
      entityId: row.id as string,
      payload: { created_by: me.email, ...payload },
    });
  }

  revalidatePath(`/dashboard/c/${company.id}/accounts`);
  return { ok: true };
}

export async function deleteAccountAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const accountId = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Block deletion of system accounts (the seeded baseline COA).
  const { data: account } = await admin
    .from('accounts')
    .select('code, name, is_system')
    .eq('id', accountId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!account) return { ok: false, error: 'החשבון לא נמצא' };
  if (account.is_system) {
    return {
      ok: false,
      error: 'חשבונות מערכת בסיסיים לא ניתנים למחיקה — ניתן לסמן כלא-פעילים',
    };
  }

  const { error } = await admin
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'account.delete',
    entityType: 'account',
    entityId: accountId,
    payload: { deleted_by: me.email, code: account.code, name: account.name },
  });

  revalidatePath(`/dashboard/c/${company.id}/accounts`);
  return { ok: true };
}
