'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

export type ActionResult = { ok: true; details?: Record<string, unknown> } | { ok: false; error: string };

const ReopenInput = z.object({
  companyId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z.string().trim().min(10, 'נא לתאר את הסיבה לפתיחה (לפחות 10 תווים)').max(500),
});

/**
 * Reopens a previously-locked period to allow JE adjustments before issuing
 * a corrective PCN874. Records an audit log in period_reopens. The period
 * is moved back to 'open' status; user can then add/edit JEs; and on next
 * 874 generation, the system will mark it as a correction.
 */
export async function reopenPeriodForCorrectionAction(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = ReopenInput.safeParse({
    companyId: formData.get('companyId'),
    year: formData.get('year'),
    month: formData.get('month'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, year, month, reason } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Verify there's a prior 874 to correct.
  const { data: priorExports } = await admin
    .from('pcn874_exports')
    .select('id')
    .eq('company_id', company.id)
    .eq('year', year)
    .eq('month', month)
    .limit(1);
  if (!priorExports || priorExports.length === 0) {
    return {
      ok: false,
      error: 'אין דיווח 874 קיים לתקופה זו — אין מה לתקן. אם התקופה נעולה ידנית, פתח אותה דרך מסך התקופות.',
    };
  }

  // Check that the period is locked.
  const { data: period } = await admin
    .from('accounting_periods')
    .select('id, status')
    .eq('company_id', company.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!period) {
    return { ok: false, error: 'התקופה לא קיימת' };
  }
  if (period.status === 'open') {
    return { ok: false, error: 'התקופה כבר פתוחה — אין צורך לפתוח שוב' };
  }

  // Move period back to 'open'.
  await admin
    .from('accounting_periods')
    .update({ status: 'open', locked_at: null, locked_by: null })
    .eq('id', period.id);

  // Audit log.
  const { error: reopenErr } = await admin.from('period_reopens').insert({
    company_id: company.id,
    year,
    month,
    reason,
    reopened_by: me.id,
  });
  if (reopenErr) {
    return { ok: false, error: `שמירת לוג נכשלה: ${reopenErr.message}` };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'period.reopen_for_correction',
    entityType: 'accounting_period',
    entityId: period.id as string,
    payload: { year, month, reason },
  });

  revalidatePath(`/dashboard/c/${company.id}/pcn874`);
  revalidatePath(`/dashboard/c/${company.id}/periods`);
  return { ok: true };
}
