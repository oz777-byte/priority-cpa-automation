'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitRuleNoteAction(formData: FormData): Promise<SubmitResult> {
  const me = await requireUser();

  const ruleId = Number(formData.get('ruleId'));
  const ruleCode = String(formData.get('ruleCode') ?? '').trim();
  const ruleTitle = String(formData.get('ruleTitle') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const companyIdRaw = formData.get('companyId');
  const companyId = typeof companyIdRaw === 'string' && companyIdRaw.length > 0 ? companyIdRaw : null;

  if (!Number.isFinite(ruleId) || ruleId <= 0) {
    return { ok: false, error: 'מזהה חוק לא תקין' };
  }
  if (!ruleCode || !ruleTitle) {
    return { ok: false, error: 'חסר קוד או כותרת חוק' };
  }
  if (note.length < 10) {
    return { ok: false, error: 'ההערה חייבת לכלול לפחות 10 תווים' };
  }
  if (note.length > 2000) {
    return { ok: false, error: 'ההערה ארוכה מדי (מקסימום 2000 תווים)' };
  }

  const admin = getAdminClient();
  const { error } = await admin.from('rule_improvement_notes').insert({
    rule_id: ruleId,
    rule_code: ruleCode,
    rule_title: ruleTitle,
    user_id: me.id,
    user_email: me.email,
    company_id: companyId,
    note,
    status: 'open',
  });

  if (error) {
    return { ok: false, error: `שמירה נכשלה: ${error.message}` };
  }

  revalidatePath('/dashboard/accounting-rules');
  revalidatePath('/dashboard/admin/rule-notes');
  return { ok: true };
}

export type AdminUpdateInput = {
  noteId: string;
  status: 'open' | 'reviewing' | 'planned' | 'shipped' | 'rejected' | 'duplicate';
  response: string;
};

export async function adminUpdateNoteAction(formData: FormData): Promise<SubmitResult> {
  const me = await requireUser();
  if (me.role !== 'admin') {
    return { ok: false, error: 'הרשאת אדמין נדרשת' };
  }

  const noteId = String(formData.get('noteId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() as AdminUpdateInput['status'];
  const response = String(formData.get('response') ?? '').trim();

  const allowed: AdminUpdateInput['status'][] = [
    'open',
    'reviewing',
    'planned',
    'shipped',
    'rejected',
    'duplicate',
  ];
  if (!allowed.includes(status)) {
    return { ok: false, error: 'סטטוס לא חוקי' };
  }
  if (!noteId) {
    return { ok: false, error: 'מזהה הערה חסר' };
  }

  const admin = getAdminClient();
  const { error } = await admin
    .from('rule_improvement_notes')
    .update({
      status,
      admin_response: response || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
    })
    .eq('id', noteId);

  if (error) {
    return { ok: false, error: `עדכון נכשל: ${error.message}` };
  }

  revalidatePath('/dashboard/admin/rule-notes');
  return { ok: true };
}
