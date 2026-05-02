'use server';

import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { getAdminClient } from '@/lib/supabase/admin';
import type { CompanySettings } from '@/lib/company-config';

/**
 * Backfill: ensure every queued/classified invoice in `companyId` has a
 * draft JE. Idempotent. Called from the JE editor page on every visit.
 */
export async function ensureDraftJEsForCompany(
  companyId: string,
  userId: string,
  _userEmail: string,
): Promise<{ created: number }> {
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const { data: company } = await admin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) return { created: 0 };
  const settings = ((company.settings ?? {}) as CompanySettings);

  const { data: orphans } = await admin
    .from('invoices_inbox')
    .select('id, canonical')
    .eq('company_id', companyId)
    .in('status', ['received', 'processing', 'classified', 'queued']);

  let created = 0;
  for (const inv of orphans ?? []) {
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
        company_id: companyId,
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
        created_by: userId,
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
      companyId,
      userId,
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
