'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { validateInvoice } from '@priority-cpa/je-validator';
import { requireUser } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildValidationContext, type CompanySettings } from '@/lib/company-config';

const ApproveInput = z.object({ invoiceId: z.string().uuid() });

interface ApproveResult {
  ok: boolean;
  error?: string;
  jeId?: string;
}

export async function approveInvoiceAction(formData: FormData): Promise<ApproveResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = ApproveInput.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return { ok: false, error: 'מזהה חשבונית לא תקין' };
  const invoiceId = parsed.data.invoiceId;

  // Fetch invoice + company in one round trip
  const { data: invRow, error: invErr } = await admin
    .from('invoices_inbox')
    .select('id, company_id, canonical, status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invErr || !invRow) return { ok: false, error: 'חשבונית לא נמצאה' };
  if (invRow.status === 'approved' || invRow.status === 'exported') {
    return { ok: false, error: 'החשבונית כבר אושרה' };
  }

  const canonical = CanonicalInvoiceSchema.safeParse(invRow.canonical);
  if (!canonical.success) {
    return { ok: false, error: 'נתוני החשבונית פגומים' };
  }
  const inv: CanonicalInvoice = canonical.data;

  const { data: company } = await admin
    .from('companies')
    .select('id, settings')
    .eq('id', invRow.company_id)
    .single();
  if (!company) return { ok: false, error: 'חברה לא נמצאה' };
  const settings = (company.settings ?? {}) as CompanySettings;

  // Validate
  const { data: accounts } = await admin
    .from('suppliers')
    .select('internal_code')
    .eq('company_id', company.id);
  const supplierCodes = (accounts ?? []).map((s) => s.internal_code as string);
  const knownAccounts = new Set<string>([
    settings.expense_account ?? '502-0',
    settings.vat_input_account ?? '205-2',
    ...supplierCodes,
  ]);

  const ctx = buildValidationContext(
    company.id as string,
    settings,
    knownAccounts,
    supplierCodes,
  );
  const result = validateInvoice(inv, ctx);
  if (!result.passed) {
    return {
      ok: false,
      error: `הקשר validation: ${result.errors[0]?.messageHe ?? 'שגיאה'}`,
    };
  }

  // Build JE
  const subtotal = inv.totals.subtotal;
  const total = inv.totals.total;
  const vat = Math.round((total - subtotal) * 100) / 100;
  const supplierAcct = inv.supplier.internal_code_priority;

  const { data: jeRow, error: jeErr } = await admin
    .from('journal_entries')
    .insert({
      company_id: company.id as string,
      invoice_id: invoiceId,
      scenario: 'STANDARD',
      movein_format: '180',
      status: 'approved',
      transaction_type: settings.transaction_type ?? 'מ',
      reference1: inv.invoice.number,
      document_date: inv.invoice.date,
      value_date: inv.invoice.date,
      currency: inv.invoice.currency,
      details: `${settings.details_prefix ?? 'קניות'} ${inv.invoice.number}`,
      validation_results: { warnings: result.warnings, errors: result.errors },
      created_by: me.id,
    })
    .select('id')
    .single();
  if (jeErr || !jeRow) return { ok: false, error: jeErr?.message ?? 'יצירת JE נכשלה' };

  // Lines
  const linesPayload = [
    {
      je_id: jeRow.id as string,
      line_no: 1,
      account: settings.expense_account ?? '502-0',
      debit: subtotal,
      credit: 0,
    },
    {
      je_id: jeRow.id as string,
      line_no: 2,
      account: settings.vat_input_account ?? '205-2',
      debit: vat,
      credit: 0,
    },
    {
      je_id: jeRow.id as string,
      line_no: 3,
      account: supplierAcct,
      debit: 0,
      credit: total,
    },
  ];
  const { error: linesErr } = await admin
    .from('journal_entry_lines')
    .insert(linesPayload);
  if (linesErr) return { ok: false, error: linesErr.message };

  // Mark invoice approved
  await admin
    .from('invoices_inbox')
    .update({ status: 'approved', processed_at: new Date().toISOString() })
    .eq('id', invoiceId);

  await audit.log({
    companyId: company.id as string,
    userId: me.id,
    action: 'je.create',
    entityType: 'journal_entry',
    entityId: jeRow.id as string,
    payload: {
      invoice_id: invoiceId,
      scenario: 'STANDARD',
      total,
      approved_by: me.email,
    },
  });

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, jeId: jeRow.id as string };
}
