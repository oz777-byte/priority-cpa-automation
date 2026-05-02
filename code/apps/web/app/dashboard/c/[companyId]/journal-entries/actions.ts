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

  // Pull the supplier master once so per-supplier defaults can override
  // company-level defaults (matched by tax_id, then by internal_code).
  const { data: supplierRows } = await admin
    .from('suppliers')
    .select('id, internal_code, tax_id, default_expense_account, default_cost_center')
    .eq('company_id', companyId);
  const supplierByTaxId = new Map<
    string,
    {
      id: string;
      default_expense_account: string | null;
      default_cost_center: string | null;
    }
  >();
  const supplierByCode = new Map<
    string,
    {
      id: string;
      default_expense_account: string | null;
      default_cost_center: string | null;
    }
  >();
  for (const s of supplierRows ?? []) {
    const v = {
      id: s.id as string,
      default_expense_account: (s.default_expense_account as string | null) ?? null,
      default_cost_center: (s.default_cost_center as string | null) ?? null,
    };
    if (s.tax_id) supplierByTaxId.set(s.tax_id as string, v);
    if (s.internal_code) supplierByCode.set(s.internal_code as string, v);
  }

  // Pull mapping rules in priority order. The first one whose conditions
  // match the invoice wins; rules override both supplier defaults and
  // company defaults.
  const { data: ruleRows } = await admin
    .from('account_mapping_rules')
    .select(
      'id, priority, match_supplier_id, match_amount_min, match_amount_max, expense_account, vat_account, cost_center',
    )
    .eq('company_id', companyId)
    .order('priority', { ascending: true });
  const rules = (ruleRows ?? []) as Array<{
    id: string;
    priority: number;
    match_supplier_id: string | null;
    match_amount_min: number | null;
    match_amount_max: number | null;
    expense_account: string;
    vat_account: string;
    cost_center: string | null;
  }>;

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
    let config = constructorConfigFor(settings, canonical);

    // Per-supplier override: if the master has a default expense account or
    // cost center for this supplier, prefer it over the company default.
    const supplierMatch =
      (canonical.supplier.tax_id
        ? supplierByTaxId.get(canonical.supplier.tax_id)
        : undefined) ??
      supplierByCode.get(canonical.supplier.internal_code_priority);
    if (supplierMatch) {
      if (supplierMatch.default_expense_account) {
        config = { ...config, expenseAccount: supplierMatch.default_expense_account };
      }
      // cost_center on the invoice header takes precedence; only fall back
      // to supplier default when the invoice doesn't carry one.
      if (
        supplierMatch.default_cost_center &&
        !canonical.invoice.cost_center
      ) {
        canonical.invoice.cost_center = supplierMatch.default_cost_center;
      }
    }

    // Highest precedence: account mapping rules. Pick the first rule whose
    // conditions all match this invoice. Overrides both supplier defaults
    // and company defaults.
    const matchedRule = rules.find((rule) => {
      if (
        rule.match_supplier_id &&
        rule.match_supplier_id !== (supplierMatch?.id ?? null)
      ) {
        return false;
      }
      const subtotal = canonical.totals.subtotal;
      if (rule.match_amount_min !== null && subtotal < rule.match_amount_min) {
        return false;
      }
      if (rule.match_amount_max !== null && subtotal > rule.match_amount_max) {
        return false;
      }
      return true;
    });
    if (matchedRule) {
      config = {
        ...config,
        expenseAccount: matchedRule.expense_account,
        vatInputAccount: matchedRule.vat_account,
      };
      if (matchedRule.cost_center && !canonical.invoice.cost_center) {
        canonical.invoice.cost_center = matchedRule.cost_center;
      }
    }

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
