'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import type { CompanySettings } from '@/lib/company-config';

/**
 * Make sure every queued/classified invoice in the current company has a
 * draft JE. Idempotent.
 */
export async function ensureDraftJEsForCurrentCompany(): Promise<{ created: number }> {
  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) return { created: 0 };

  const admin = getAdminClient();
  const settings = (company.settings ?? {}) as CompanySettings;
  const audit = new SupabaseAuditStore(admin);

  const { data: orphans } = await admin
    .from('invoices_inbox')
    .select('id, canonical')
    .eq('company_id', company.id)
    .in('status', ['received', 'processing', 'classified', 'queued'])
    .is('id', 'not.null');

  let created = 0;
  for (const inv of orphans ?? []) {
    // Has JE already?
    const { data: existing } = await admin
      .from('journal_entries')
      .select('id')
      .eq('invoice_id', inv.id)
      .maybeSingle();
    if (existing) continue;

    const parsed = CanonicalInvoiceSchema.safeParse(inv.canonical);
    if (!parsed.success) continue;
    const c: CanonicalInvoice = parsed.data;

    const subtotal = c.totals.subtotal;
    const total = c.totals.total;
    const vat = Math.round((total - subtotal) * 100) / 100;

    const { data: jeRow, error: jeErr } = await admin
      .from('journal_entries')
      .insert({
        company_id: company.id,
        invoice_id: inv.id,
        scenario: 'STANDARD',
        movein_format: '180',
        status: 'draft',
        transaction_type: settings.transaction_type ?? 'מ',
        reference1: c.invoice.number,
        document_date: c.invoice.date,
        value_date: c.invoice.date,
        currency: c.invoice.currency,
        details: `${settings.details_prefix ?? 'קניות'} ${c.invoice.number}`,
        created_by: me.id,
      })
      .select('id')
      .single();
    if (jeErr || !jeRow) continue;

    await admin.from('journal_entry_lines').insert([
      {
        je_id: jeRow.id,
        line_no: 1,
        account: settings.expense_account ?? '502-0',
        debit: subtotal,
        credit: 0,
      },
      {
        je_id: jeRow.id,
        line_no: 2,
        account: settings.vat_input_account ?? '205-2',
        debit: vat,
        credit: 0,
      },
      {
        je_id: jeRow.id,
        line_no: 3,
        account: c.supplier.internal_code_priority,
        debit: 0,
        credit: total,
      },
    ]);

    await admin
      .from('invoices_inbox')
      .update({ status: 'classified' })
      .eq('id', inv.id);

    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'je.create',
      entityType: 'journal_entry',
      entityId: jeRow.id as string,
      payload: {
        invoice_id: inv.id,
        scenario: 'STANDARD',
        auto_drafted: true,
      },
    });
    created++;
  }
  return { created };
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
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) return { ok: false, error: 'אין חברה נבחרת' };

  const parsed = UpdateJEHeaderInput.safeParse({
    jeId: formData.get('jeId'),
    details: formData.get('details') ?? undefined,
    documentDate: formData.get('documentDate') ?? undefined,
    valueDate: formData.get('valueDate') ?? undefined,
    reference1: formData.get('reference1') ?? undefined,
    transactionType: formData.get('transactionType') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const { data: existing } = await admin
    .from('journal_entries')
    .select('id, company_id, status')
    .eq('id', parsed.data.jeId)
    .maybeSingle();
  if (!existing || existing.company_id !== company.id) {
    return { ok: false, error: 'פקודת יומן לא נמצאה' };
  }
  if (existing.status === 'exported') {
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
    companyId: company.id,
    userId: me.id,
    action: 'je.update',
    entityType: 'journal_entry',
    entityId: parsed.data.jeId,
    payload: { fields: Object.keys(update), edited_by: me.email },
  });

  revalidatePath('/dashboard/journal-entries');
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
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) return { ok: false, error: 'אין חברה נבחרת' };

  const parsed = UpdateLineInput.safeParse({
    lineId: formData.get('lineId'),
    account: formData.get('account') ?? undefined,
    debit: formData.get('debit') ?? undefined,
    credit: formData.get('credit') ?? undefined,
    details: formData.get('details') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  // Verify ownership
  const { data: line } = await admin
    .from('journal_entry_lines')
    .select('id, je_id, journal_entries!inner(company_id, status)')
    .eq('id', parsed.data.lineId)
    .maybeSingle();
  // RLS-bypass admin client returns embedded row as object or array; normalize
  const je = Array.isArray((line as unknown as { journal_entries: unknown[] })?.journal_entries)
    ? ((line as unknown as { journal_entries: { company_id: string; status: string }[] }).journal_entries[0])
    : ((line as unknown as { journal_entries: { company_id: string; status: string } })?.journal_entries);
  if (!line || !je || je.company_id !== company.id) {
    return { ok: false, error: 'שורה לא נמצאה' };
  }
  if (je.status === 'exported') {
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
    companyId: company.id,
    userId: me.id,
    action: 'je.line_update',
    entityType: 'journal_entry_line',
    entityId: parsed.data.lineId,
    payload: { fields: Object.keys(update), edited_by: me.email },
  });

  revalidatePath('/dashboard/journal-entries');
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
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) return { ok: false, error: 'אין חברה נבחרת' };

  const parsed = AddLineInput.safeParse({
    jeId: formData.get('jeId'),
    account: formData.get('account'),
    debit: formData.get('debit') ?? 0,
    credit: formData.get('credit') ?? 0,
  });
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const { data: je } = await admin
    .from('journal_entries')
    .select('id, company_id, status')
    .eq('id', parsed.data.jeId)
    .maybeSingle();
  if (!je || je.company_id !== company.id) return { ok: false, error: 'JE לא נמצא' };
  if (je.status === 'exported') return { ok: false, error: 'JE שיוצא אינו ניתן לעריכה' };

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
    companyId: company.id,
    userId: me.id,
    action: 'je.line_add',
    entityType: 'journal_entry',
    entityId: parsed.data.jeId,
    payload: { account: parsed.data.account, by: me.email },
  });

  revalidatePath('/dashboard/journal-entries');
  return { ok: true };
}

export async function removeLineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) return { ok: false, error: 'אין חברה נבחרת' };

  const lineIdRaw = formData.get('lineId');
  if (typeof lineIdRaw !== 'string') return { ok: false, error: 'מזהה לא תקין' };

  const { data: line } = await admin
    .from('journal_entry_lines')
    .select('id, je_id, journal_entries!inner(company_id, status)')
    .eq('id', lineIdRaw)
    .maybeSingle();
  const je = Array.isArray((line as unknown as { journal_entries: unknown[] })?.journal_entries)
    ? ((line as unknown as { journal_entries: { company_id: string; status: string }[] }).journal_entries[0])
    : ((line as unknown as { journal_entries: { company_id: string; status: string } })?.journal_entries);
  if (!line || !je || je.company_id !== company.id) return { ok: false, error: 'שורה לא נמצאה' };
  if (je.status === 'exported') return { ok: false, error: 'JE שיוצא אינו ניתן לעריכה' };

  const { error } = await admin.from('journal_entry_lines').delete().eq('id', lineIdRaw);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'je.line_remove',
    entityType: 'journal_entry_line',
    entityId: lineIdRaw,
    payload: { by: me.email },
  });

  revalidatePath('/dashboard/journal-entries');
  return { ok: true };
}
