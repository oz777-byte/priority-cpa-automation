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

const optString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const optAmount = z
  .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
  .optional();

const RuleInput = z.object({
  companyId: z.string().uuid(),
  id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  match_supplier_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  match_amount_min: optAmount,
  match_amount_max: optAmount,
  expense_account: account,
  vat_account: account,
  cost_center: optString(15),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export async function upsertMappingRuleAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = RuleInput.safeParse({
    companyId: formData.get('companyId'),
    id: formData.get('id') ?? undefined,
    priority: formData.get('priority') ?? 100,
    match_supplier_id: formData.get('match_supplier_id') ?? undefined,
    match_amount_min: formData.get('match_amount_min') ?? undefined,
    match_amount_max: formData.get('match_amount_max') ?? undefined,
    expense_account: formData.get('expense_account'),
    vat_account: formData.get('vat_account'),
    cost_center: formData.get('cost_center') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, id, ...payload } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  if (
    payload.match_amount_min !== undefined &&
    payload.match_amount_max !== undefined &&
    payload.match_amount_min > payload.match_amount_max
  ) {
    return { ok: false, error: 'סכום מינימום לא יכול להיות גדול מהמקסימום' };
  }

  if (id) {
    const { error } = await admin
      .from('account_mapping_rules')
      .update(payload)
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) return { ok: false, error: error.message };
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'mapping_rule.update',
      entityType: 'mapping_rule',
      entityId: id,
      payload: { changed_by: me.email, ...payload },
    });
  } else {
    const { data: row, error } = await admin
      .from('account_mapping_rules')
      .insert({ company_id: company.id, ...payload })
      .select('id')
      .single();
    if (error || !row) {
      return { ok: false, error: error?.message ?? 'יצירת כלל נכשלה' };
    }
    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'mapping_rule.create',
      entityType: 'mapping_rule',
      entityId: row.id as string,
      payload: { created_by: me.email, ...payload },
    });
  }

  revalidatePath(`/dashboard/c/${company.id}/account-mapping`);
  return { ok: true };
}

export async function deleteMappingRuleAction(
  formData: FormData,
): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const companyId = z.string().uuid().parse(formData.get('companyId'));
  const ruleId = z.string().uuid().parse(formData.get('id'));
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { error } = await admin
    .from('account_mapping_rules')
    .delete()
    .eq('id', ruleId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'mapping_rule.delete',
    entityType: 'mapping_rule',
    entityId: ruleId,
    payload: { deleted_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/account-mapping`);
  return { ok: true };
}
