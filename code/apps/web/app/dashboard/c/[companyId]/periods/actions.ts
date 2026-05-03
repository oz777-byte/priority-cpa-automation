'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const PeriodInput = z.object({
  companyId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const StatusInput = PeriodInput.extend({
  notes: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
});

export interface MutationResult {
  ok: boolean;
  error?: string;
}

/**
 * Lock a period — once locked, no new JEs can be inserted with a
 * document_date in that month, and existing JEs cannot be edited.
 * Used at month-close after VAT reporting is filed.
 */
export async function lockPeriodAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = StatusInput.safeParse({
    companyId: formData.get('companyId'),
    year: formData.get('year'),
    month: formData.get('month'),
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, year, month, notes } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Upsert (create if missing, then lock).
  const { error } = await admin
    .from('accounting_periods')
    .upsert(
      {
        company_id: company.id,
        year,
        month,
        status: 'locked',
        locked_at: new Date().toISOString(),
        locked_by: me.id,
        ...(notes ? { notes } : {}),
      },
      { onConflict: 'company_id,year,month' },
    );
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'period.lock',
    entityType: 'accounting_period',
    entityId: `${year}-${String(month).padStart(2, '0')}`,
    payload: {
      year,
      month,
      locked_by: me.email,
      ...(notes ? { notes } : {}),
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/periods`);
  return { ok: true };
}

export async function reopenPeriodAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = PeriodInput.safeParse({
    companyId: formData.get('companyId'),
    year: formData.get('year'),
    month: formData.get('month'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, year, month } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  const { data: existing } = await admin
    .from('accounting_periods')
    .select('status')
    .eq('company_id', company.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: 'התקופה לא קיימת' };
  }
  if (existing.status === 'closed') {
    return {
      ok: false,
      error: 'תקופה סגורה לאחר סגירת שנה לא ניתנת לפתיחה — דורש פנייה לאדמין-על.',
    };
  }
  if (existing.status === 'open') {
    return { ok: false, error: 'התקופה כבר פתוחה' };
  }

  const { error } = await admin
    .from('accounting_periods')
    .update({ status: 'open', locked_at: null, locked_by: null })
    .eq('company_id', company.id)
    .eq('year', year)
    .eq('month', month);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'period.reopen',
    entityType: 'accounting_period',
    entityId: `${year}-${String(month).padStart(2, '0')}`,
    payload: { year, month, reopened_by: me.email },
  });

  revalidatePath(`/dashboard/c/${company.id}/periods`);
  return { ok: true };
}

export async function ensurePeriodAction(formData: FormData): Promise<MutationResult> {
  const me = await requireUser();
  const admin = getAdminClient();

  const parsed = PeriodInput.safeParse({
    companyId: formData.get('companyId'),
    year: formData.get('year'),
    month: formData.get('month'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, year, month } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  await admin
    .from('accounting_periods')
    .upsert(
      { company_id: company.id, year, month, status: 'open' },
      { onConflict: 'company_id,year,month', ignoreDuplicates: true },
    );

  revalidatePath(`/dashboard/c/${company.id}/periods`);
  return { ok: true };
}
