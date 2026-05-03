'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  calculateMonthlyDepreciation,
  constructAssetDepreciationJE,
  constructAssetPurchaseJE,
  constructAssetSaleJE,
  type AssetJERecord,
} from '@priority-cpa/je-constructor';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { type CompanySettings } from '@/lib/company-config';

export interface ActionResult {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const CategoryEnum = z.enum([
  'office_equipment',
  'computers',
  'vehicles',
  'furniture',
  'machinery',
  'buildings',
  'leasehold_improvements',
  'software',
  'other',
]);

const CreateAssetInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
  category: CategoryEnum,
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchase_amount: z.coerce.number().positive(),
  vat_amount: z.coerce.number().nonnegative().default(0),
  depreciation_rate_percent: z.coerce.number().positive().max(100), // user enters 33 not 0.33
  salvage_value: z.coerce.number().nonnegative().default(0),
  asset_account: z.string().trim().min(1).max(20),
  accumulated_depreciation_account: z.string().trim().min(1).max(20),
  depreciation_expense_account: z.string().trim().min(1).max(20),
  cost_center: z.string().trim().max(50).optional().or(z.literal('').transform(() => undefined)),
  source_invoice_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  counterparty_account: z.string().trim().min(1).max(20),
  is_immediate_payment: z.coerce.boolean().default(false),
  serial_number: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
});

function buildJEPayload(record: AssetJERecord, companyId: string, userId: string, fixedAssetId: string) {
  return {
    company_id: companyId,
    fixed_asset_id: fixedAssetId,
    scenario: record.scenario,
    movein_format: '180',
    status: 'draft',
    transaction_type: record.transactionType,
    reference1: record.reference1,
    document_date: record.documentDate,
    value_date: record.valueDate,
    vat_reporting_date: new Date().toISOString().slice(0, 10),
    currency: 'ILS',
    details: record.details,
    created_by: userId,
    validation_results: {
      asset_scenario: record.scenario,
      notes: record.notes,
    },
  };
}

async function insertJE(
  admin: ReturnType<typeof getAdminClient>,
  record: AssetJERecord,
  companyId: string,
  userId: string,
  fixedAssetId: string,
): Promise<string | null> {
  const { data: jeRow, error } = await admin
    .from('journal_entries')
    .insert(buildJEPayload(record, companyId, userId, fixedAssetId))
    .select('id')
    .single();
  if (error || !jeRow) return null;
  const linesPayload = record.lines.map((l, i) => ({
    je_id: jeRow.id,
    line_no: i + 1,
    account: l.account,
    debit: l.debit,
    credit: l.credit,
    ...(l.details ? { details: l.details } : {}),
    ...(l.costCenter ? { cost_center: l.costCenter } : {}),
  }));
  await admin.from('journal_entry_lines').insert(linesPayload);
  return jeRow.id as string;
}

export async function createAssetAction(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const admin = getAdminClient();

  const parsed = CreateAssetInput.safeParse({
    companyId: formData.get('companyId'),
    name: formData.get('name'),
    description: formData.get('description'),
    category: formData.get('category'),
    purchase_date: formData.get('purchase_date'),
    purchase_amount: formData.get('purchase_amount'),
    vat_amount: formData.get('vat_amount'),
    depreciation_rate_percent: formData.get('depreciation_rate_percent'),
    salvage_value: formData.get('salvage_value'),
    asset_account: formData.get('asset_account'),
    accumulated_depreciation_account: formData.get('accumulated_depreciation_account'),
    depreciation_expense_account: formData.get('depreciation_expense_account'),
    cost_center: formData.get('cost_center'),
    source_invoice_id: formData.get('source_invoice_id'),
    counterparty_account: formData.get('counterparty_account'),
    is_immediate_payment: formData.get('is_immediate_payment') === 'on' || formData.get('is_immediate_payment') === 'true',
    serial_number: formData.get('serial_number'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const p = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, p.companyId);

  const annualRate = p.depreciation_rate_percent / 100;
  const usefulLifeMonths = Math.max(1, Math.ceil((1 - p.salvage_value / p.purchase_amount) * 12 / annualRate));
  const settings = (company.settings ?? {}) as CompanySettings;
  const transactionType = settings.transaction_type ?? 'מ';

  const insertPayload = {
    company_id: company.id,
    name: p.name,
    description: p.description ?? null,
    category: p.category,
    serial_number: p.serial_number ?? null,
    purchase_date: p.purchase_date,
    purchase_amount: p.purchase_amount,
    depreciation_rate_annual: annualRate,
    salvage_value: p.salvage_value,
    useful_life_months: usefulLifeMonths,
    asset_account: p.asset_account,
    accumulated_depreciation_account: p.accumulated_depreciation_account,
    depreciation_expense_account: p.depreciation_expense_account,
    cost_center: p.cost_center ?? null,
    status: 'active' as const,
    in_service_date: p.purchase_date,
    accumulated_depreciation: 0,
    source_invoice_id: p.source_invoice_id ?? null,
    created_by: me.id,
  };

  const { data: assetRow, error } = await admin
    .from('fixed_assets')
    .insert(insertPayload)
    .select('id')
    .single();
  if (error || !assetRow) return { ok: false, error: error?.message ?? 'יצירת הנכס נכשלה' };

  const assetId = assetRow.id as string;

  // Generate ASSET_PURCHASE JE.
  const purchase = constructAssetPurchaseJE({
    assetName: p.name,
    invoiceNumber: p.source_invoice_id ? p.source_invoice_id.slice(0, 8) : `ASSET-${assetId.slice(0, 8)}`,
    documentDate: p.purchase_date,
    subtotal: p.purchase_amount,
    vat: p.vat_amount,
    counterpartyAccount: p.counterparty_account,
    isImmediatePayment: p.is_immediate_payment,
    assetAccount: p.asset_account,
    vatInputAccount: settings.vat_input_account ?? '205-2',
    ...(p.cost_center ? { costCenter: p.cost_center } : {}),
    transactionType,
  });

  for (const rec of purchase.records) {
    await insertJE(admin, rec, company.id, me.id, assetId);
  }

  revalidatePath(`/dashboard/c/${company.id}/assets`);
  return { ok: true, details: { assetId, usefulLifeMonths } };
}

const RunDepreciationInput = z.object({
  companyId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function runMonthlyDepreciationAction(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const parsed = RunDepreciationInput.safeParse({
    companyId: formData.get('companyId'),
    year: formData.get('year'),
    month: formData.get('month'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  const { companyId, year, month } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);
  const settings = (company.settings ?? {}) as CompanySettings;
  const transactionType = settings.transaction_type ?? 'מ';

  // Period guard: don't run if the period is already locked.
  const { data: period } = await admin
    .from('accounting_periods')
    .select('status')
    .eq('company_id', company.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (period && period.status !== 'open') {
    return { ok: false, error: `התקופה ${month}/${year} נעולה — לא ניתן להריץ פחת.` };
  }

  // Pull all active assets in service before/within this month.
  const monthEnd = new Date(year, month, 0); // last day
  const monthEndIso = monthEnd.toISOString().slice(0, 10);

  const { data: assets } = await admin
    .from('fixed_assets')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'active')
    .lte('in_service_date', monthEndIso);

  let runsCreated = 0;
  let skipped = 0;
  let totalAmount = 0;

  for (const asset of (assets ?? []) as Array<{
    id: string;
    name: string;
    purchase_amount: number;
    salvage_value: number;
    useful_life_months: number;
    accumulated_depreciation: number;
    depreciation_expense_account: string;
    accumulated_depreciation_account: string;
    cost_center: string | null;
  }>) {
    // Skip if a run already exists for this (asset, year, month) — idempotent.
    const { data: existing } = await admin
      .from('fixed_asset_depreciation_runs')
      .select('id')
      .eq('asset_id', asset.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const monthlyAmount = calculateMonthlyDepreciation({
      purchaseAmount: Number(asset.purchase_amount),
      salvageValue: Number(asset.salvage_value),
      usefulLifeMonths: asset.useful_life_months,
      accumulatedDepreciation: Number(asset.accumulated_depreciation),
    });
    if (monthlyAmount <= 0) {
      skipped += 1;
      continue;
    }

    const result = constructAssetDepreciationJE({
      assetId: asset.id,
      assetName: asset.name,
      monthEndDate: monthEndIso,
      monthlyAmount,
      depreciationExpenseAccount: asset.depreciation_expense_account,
      accumulatedDepreciationAccount: asset.accumulated_depreciation_account,
      ...(asset.cost_center ? { costCenter: asset.cost_center } : {}),
      transactionType,
    });

    if (result.records.length === 0) {
      skipped += 1;
      continue;
    }

    const jeId = await insertJE(admin, result.records[0]!, company.id, me.id, asset.id);
    if (!jeId) continue;

    await admin.from('fixed_asset_depreciation_runs').insert({
      asset_id: asset.id,
      company_id: company.id,
      year,
      month,
      amount: monthlyAmount,
      je_id: jeId,
    });

    await admin
      .from('fixed_assets')
      .update({
        accumulated_depreciation: Number(asset.accumulated_depreciation) + monthlyAmount,
        last_depreciation_date: monthEndIso,
      })
      .eq('id', asset.id);

    runsCreated += 1;
    totalAmount += monthlyAmount;
  }

  revalidatePath(`/dashboard/c/${company.id}/assets`);
  return {
    ok: true,
    details: { runsCreated, skipped, totalAmount: Number(totalAmount.toFixed(2)) },
  };
}

const SellInput = z.object({
  companyId: z.string().uuid(),
  assetId: z.string().uuid(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proceedsSubtotal: z.coerce.number().nonnegative().default(0),
  proceedsVat: z.coerce.number().nonnegative().default(0),
  proceedsAccount: z.string().trim().min(1).max(20),
  isDisposal: z.coerce.boolean().default(false),
});

export async function sellAssetAction(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const parsed = SellInput.safeParse({
    companyId: formData.get('companyId'),
    assetId: formData.get('assetId'),
    saleDate: formData.get('saleDate'),
    proceedsSubtotal: formData.get('proceedsSubtotal'),
    proceedsVat: formData.get('proceedsVat'),
    proceedsAccount: formData.get('proceedsAccount'),
    isDisposal: formData.get('isDisposal') === 'on' || formData.get('isDisposal') === 'true',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  const p = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, p.companyId);
  const settings = (company.settings ?? {}) as CompanySettings;
  const transactionType = settings.transaction_type ?? 'מ';

  const { data: asset } = await admin
    .from('fixed_assets')
    .select('*')
    .eq('id', p.assetId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!asset) return { ok: false, error: 'הנכס לא נמצא' };
  if (asset.status !== 'active') return { ok: false, error: 'הנכס אינו פעיל' };

  const result = constructAssetSaleJE({
    assetId: p.assetId,
    assetName: asset.name as string,
    saleDate: p.saleDate,
    assetAccount: asset.asset_account as string,
    purchaseAmount: Number(asset.purchase_amount),
    accumulatedDepreciation: Number(asset.accumulated_depreciation),
    accumulatedDepreciationAccount: asset.accumulated_depreciation_account as string,
    proceedsSubtotal: p.isDisposal ? 0 : p.proceedsSubtotal,
    proceedsVat: p.isDisposal ? 0 : p.proceedsVat,
    proceedsAccount: p.proceedsAccount,
    outputVatAccount: settings.output_vat_account ?? '220-0',
    gainAccount: '744-0',
    lossAccount: '625-0',
    transactionType,
  });

  const jeId = await insertJE(admin, result.records[0]!, company.id, me.id, p.assetId);

  await admin
    .from('fixed_assets')
    .update({
      status: p.isDisposal ? 'disposed' : 'sold',
      retired_date: p.saleDate,
      retirement_proceeds: p.isDisposal ? null : p.proceedsSubtotal,
      retirement_je_id: jeId,
    })
    .eq('id', p.assetId);

  revalidatePath(`/dashboard/c/${company.id}/assets`);
  return { ok: true, details: { jeId, warnings: result.warnings } };
}
