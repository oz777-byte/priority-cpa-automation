'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { ensureUserFirm } from '@/lib/bootstrap';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Verify that a JE belongs to the user's firm (via its company).
 * Returns the JE row + its company_id, or null if not found / no access.
 */
async function verifyJEAccess(
  jeId: string,
  userId: string,
  email: string,
): Promise<{ companyId: string; status: string } | null> {
  const firmId = await ensureUserFirm(userId, email);
  const admin = getAdminClient();
  const { data } = await admin
    .from('journal_entries')
    .select('id, company_id, status, companies!inner(firm_id)')
    .eq('id', jeId)
    .maybeSingle();
  if (!data) return null;
  // The embedded `companies` row may come as object or array depending on the
  // shape of the query — normalize.
  const companyRel = (data as unknown as { companies: { firm_id: string } | { firm_id: string }[] }).companies;
  const companyFirmId = Array.isArray(companyRel) ? companyRel[0]?.firm_id : companyRel?.firm_id;
  if (companyFirmId !== firmId) return null;
  return {
    companyId: data.company_id as string,
    status: data.status as string,
  };
}

async function verifyLineAccess(
  lineId: string,
  userId: string,
  email: string,
): Promise<{ jeId: string; companyId: string; status: string } | null> {
  const firmId = await ensureUserFirm(userId, email);
  const admin = getAdminClient();
  const { data } = await admin
    .from('journal_entry_lines')
    .select('id, je_id, journal_entries!inner(company_id, status, companies!inner(firm_id))')
    .eq('id', lineId)
    .maybeSingle();
  if (!data) return null;
  const je = (data as unknown as {
    journal_entries:
      | { company_id: string; status: string; companies: { firm_id: string } | { firm_id: string }[] }
      | { company_id: string; status: string; companies: { firm_id: string } | { firm_id: string }[] }[];
  }).journal_entries;
  const jeRow = Array.isArray(je) ? je[0] : je;
  if (!jeRow) return null;
  const companies = jeRow.companies;
  const companyFirmId = Array.isArray(companies) ? companies[0]?.firm_id : companies?.firm_id;
  if (companyFirmId !== firmId) return null;
  return {
    jeId: data.je_id as string,
    companyId: jeRow.company_id,
    status: jeRow.status,
  };
}

const UpdateJEHeaderInput = z.object({
  jeId: z.string().uuid(),
  details: z.string().min(1).max(60).optional(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference1: z.string().min(1).max(20).optional(),
  transactionType: z.string().min(1).max(3).optional(),
});

export async function updateJEHeaderAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = UpdateJEHeaderInput.safeParse({
    jeId: formData.get('jeId'),
    details: formData.get('details') ?? undefined,
    documentDate: formData.get('documentDate') ?? undefined,
    valueDate: formData.get('valueDate') ?? undefined,
    reference1: formData.get('reference1') ?? undefined,
    transactionType: formData.get('transactionType') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const access = await verifyJEAccess(parsed.data.jeId, me.id, me.email);
  if (!access) return { ok: false, error: 'פקודת יומן לא נמצאה' };
  if (access.status === 'exported') {
    return { ok: false, error: 'פקודת יומן שיוצאה אינה ניתנת לעריכה' };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.details !== undefined) update.details = parsed.data.details;
  if (parsed.data.documentDate !== undefined) update.document_date = parsed.data.documentDate;
  if (parsed.data.valueDate !== undefined) update.value_date = parsed.data.valueDate;
  if (parsed.data.reference1 !== undefined) update.reference1 = parsed.data.reference1;
  if (parsed.data.transactionType !== undefined) update.transaction_type = parsed.data.transactionType;

  if (Object.keys(update).length > 0) {
    const { error } = await admin
      .from('journal_entries')
      .update(update)
      .eq('id', parsed.data.jeId);
    if (error) return { ok: false, error: error.message };
  }

  await audit.log({
    companyId: access.companyId,
    userId: me.id,
    action: 'je.update',
    entityType: 'journal_entry',
    entityId: parsed.data.jeId,
    payload: { fields: Object.keys(update), edited_by: me.email },
  });

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

const UpdateLineInput = z.object({
  lineId: z.string().uuid(),
  account: z.string().min(1).max(8).optional(),
  debit: z.coerce.number().min(0).optional(),
  credit: z.coerce.number().min(0).optional(),
  details: z.string().max(80).optional(),
});

export async function updateLineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = UpdateLineInput.safeParse({
    lineId: formData.get('lineId'),
    account: formData.get('account') ?? undefined,
    debit: formData.get('debit') ?? undefined,
    credit: formData.get('credit') ?? undefined,
    details: formData.get('details') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const access = await verifyLineAccess(parsed.data.lineId, me.id, me.email);
  if (!access) return { ok: false, error: 'שורה לא נמצאה' };
  if (access.status === 'exported') {
    return { ok: false, error: 'שורה ב-JE שיוצא אינה ניתנת לעריכה' };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.account !== undefined) update.account = parsed.data.account;
  if (parsed.data.debit !== undefined) update.debit = parsed.data.debit;
  if (parsed.data.credit !== undefined) update.credit = parsed.data.credit;
  if (parsed.data.details !== undefined) update.details = parsed.data.details;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await admin
    .from('journal_entry_lines')
    .update(update)
    .eq('id', parsed.data.lineId);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: access.companyId,
    userId: me.id,
    action: 'je.line_update',
    entityType: 'journal_entry_line',
    entityId: parsed.data.lineId,
    payload: { fields: Object.keys(update), edited_by: me.email },
  });

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

const AddLineInput = z.object({
  jeId: z.string().uuid(),
  account: z.string().min(1).max(8),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
});

export async function addLineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = AddLineInput.safeParse({
    jeId: formData.get('jeId'),
    account: formData.get('account'),
    debit: formData.get('debit') ?? 0,
    credit: formData.get('credit') ?? 0,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const access = await verifyJEAccess(parsed.data.jeId, me.id, me.email);
  if (!access) return { ok: false, error: 'JE לא נמצא' };
  if (access.status === 'exported') return { ok: false, error: 'JE שיוצא אינו ניתן לעריכה' };

  const { data: maxLine } = await admin
    .from('journal_entry_lines')
    .select('line_no')
    .eq('je_id', parsed.data.jeId)
    .order('line_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextLineNo = ((maxLine?.line_no as number | undefined) ?? 0) + 1;

  const { error } = await admin.from('journal_entry_lines').insert({
    je_id: parsed.data.jeId,
    line_no: nextLineNo,
    account: parsed.data.account,
    debit: parsed.data.debit,
    credit: parsed.data.credit,
  });
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: access.companyId,
    userId: me.id,
    action: 'je.line_add',
    entityType: 'journal_entry',
    entityId: parsed.data.jeId,
    payload: { account: parsed.data.account, by: me.email },
  });

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

export async function removeLineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const lineIdRaw = formData.get('lineId');
  if (typeof lineIdRaw !== 'string') return { ok: false, error: 'מזהה לא תקין' };

  const access = await verifyLineAccess(lineIdRaw, me.id, me.email);
  if (!access) return { ok: false, error: 'שורה לא נמצאה' };
  if (access.status === 'exported') return { ok: false, error: 'JE שיוצא אינו ניתן לעריכה' };

  const { error } = await admin.from('journal_entry_lines').delete().eq('id', lineIdRaw);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: access.companyId,
    userId: me.id,
    action: 'je.line_remove',
    entityType: 'journal_entry_line',
    entityId: lineIdRaw,
    payload: { by: me.email },
  });

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
