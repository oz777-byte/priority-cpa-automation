'use server';

import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { constructJE } from '@priority-cpa/je-constructor';
import { getAdminClient } from '@/lib/supabase/admin';
import { type CompanySettings, constructorConfigFor } from '@/lib/company-config';

/**
 * Backfill: ensure every queued/classified invoice in `companyId` has a
 * draft JE. Uses the scenario detector + JE constructor to build the right
 * JE shape per scenario (STANDARD, WITH_ALLOCATION, IMMEDIATE_PAYMENT, etc.).
 * Idempotent — called from the JE editor page on every visit.
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
  const settings = (company.settings ?? {}) as CompanySettings;

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
    const canonical: CanonicalInvoice = parsed.data;

    // Build per-invoice config so paymentAccount / withholdingAccount /
    // nonDeductibleAccount are resolved against the invoice's payment_method.
    const config = constructorConfigFor(settings, canonical);
    const result = constructJE(canonical, config);

    // For now: each detected JERecord is stored as a separate journal_entries
    // row in the DB. (Multi-record scenarios will produce > 1 row.)
    for (const record of result.records) {
      const { data: jeRow, error: jeErr } = await admin
        .from('journal_entries')
        .insert({
          company_id: companyId,
          invoice_id: inv.id,
          scenario: record.scenario,
          movein_format: '180',
          status: 'draft',
          transaction_type: record.transactionType,
          reference1: record.reference1,
          ...(record.reference2 ? { reference2: record.reference2 } : {}),
          document_date: record.documentDate,
          value_date: record.valueDate,
          currency: record.currency,
          ...(canonical.invoice.fx_rate
            ? { fx_rate: canonical.invoice.fx_rate }
            : {}),
          details: record.details,
          created_by: userId,
          ...(result.warnings.length > 0
            ? {
                validation_results: {
                  constructor_warnings: result.warnings,
                  overlays: result.overlays,
                  notes: record.notes,
                },
              }
            : {}),
        })
        .select('id')
        .single();
      if (jeErr || !jeRow) continue;

      const linesPayload = record.lines.map((l, i) => ({
        je_id: jeRow.id,
        line_no: i + 1,
        account: l.account,
        debit: l.debit,
        credit: l.credit,
        ...(l.debitFx ? { debit_fx: l.debitFx } : {}),
        ...(l.creditFx ? { credit_fx: l.creditFx } : {}),
        ...(l.details ? { details: l.details } : {}),
      }));
      await admin.from('journal_entry_lines').insert(linesPayload);

      await audit.log({
        companyId,
        userId,
        action: 'je.create',
        entityType: 'journal_entry',
        entityId: jeRow.id as string,
        payload: {
          invoice_id: inv.id,
          scenario: record.scenario,
          overlays: result.overlays,
          auto_drafted: true,
          warnings: result.warnings,
          record_index: record.recordIndex,
        },
      });
      created++;
    }

    await admin
      .from('invoices_inbox')
      .update({ status: 'classified' })
      .eq('id', inv.id);
  }
  return { created };
}
