'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { CurrencySchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

interface SplitFields {
  split1Account?: string | undefined;
  split1Amount?: number | undefined;
  split1Label?: string | undefined;
  split2Account?: string | undefined;
  split2Amount?: number | undefined;
  split2Label?: string | undefined;
}

function buildExpenseSplits(data: SplitFields):
  | Array<{ account: string; amount: number; label?: string }>
  | undefined {
  const splits: Array<{ account: string; amount: number; label?: string }> = [];
  if (data.split1Account && data.split1Amount && data.split1Amount > 0) {
    splits.push({
      account: data.split1Account,
      amount: data.split1Amount,
      ...(data.split1Label ? { label: data.split1Label } : {}),
    });
  }
  if (data.split2Account && data.split2Amount && data.split2Amount > 0) {
    splits.push({
      account: data.split2Account,
      amount: data.split2Amount,
      ...(data.split2Label ? { label: data.split2Label } : {}),
    });
  }
  return splits.length >= 2 ? splits : undefined;
}

const Input = z.object({
  companyId: z.string().uuid(),
  supplierName: z.string().min(2, 'שם ספק חייב להיות לפחות 2 תווים'),
  supplierTaxId: z.string().min(7).max(15),
  supplierInternalCode: z.string().min(1).max(8),
  invoiceNumber: z.string().min(1).max(20),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות בפורמט YYYY-MM-DD'),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: CurrencySchema.default('ILS'),
  subtotal: z.coerce.number().nonnegative(),
  total: z.coerce.number().nonnegative(),
  allocationNumber: z.string().optional(),
  // Advanced — drives JE constructor scenario detection
  isCreditNote: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  paymentMethod: z.enum(['credit', 'cash', 'card', 'transfer']).optional(),
  withholdingPercent: z.coerce.number().min(0).max(100).optional(),
  mixedDeductionCategory: z.enum(['vehicle', 'meals', 'non_deductible']).optional(),
  fxRate: z.coerce.number().positive().optional(),
  costCenter: z.string().max(20).optional(),
  // Up to two expense splits for MULTI_EXPENSE scenarios.
  split1Account: z.string().optional(),
  split1Amount: z.coerce.number().nonnegative().optional(),
  split1Label: z.string().optional(),
  split2Account: z.string().optional(),
  split2Amount: z.coerce.number().nonnegative().optional(),
  split2Label: z.string().optional(),
});

export interface CreateInvoiceResult {
  ok: boolean;
  error?: string;
  invoiceId?: string;
}

export async function createInvoiceManuallyAction(
  formData: FormData,
): Promise<CreateInvoiceResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    supplierName: formData.get('supplierName'),
    supplierTaxId: formData.get('supplierTaxId'),
    supplierInternalCode: formData.get('supplierInternalCode'),
    invoiceNumber: formData.get('invoiceNumber'),
    invoiceDate: formData.get('invoiceDate'),
    valueDate: formData.get('valueDate') || undefined,
    currency: formData.get('currency') ?? 'ILS',
    subtotal: formData.get('subtotal'),
    total: formData.get('total'),
    allocationNumber: formData.get('allocationNumber') || undefined,
    isCreditNote: (formData.get('isCreditNote') as string | null) ?? undefined,
    paymentMethod: formData.get('paymentMethod') || undefined,
    withholdingPercent: formData.get('withholdingPercent') || undefined,
    mixedDeductionCategory: formData.get('mixedDeductionCategory') || undefined,
    fxRate: formData.get('fxRate') || undefined,
    costCenter: formData.get('costCenter') || undefined,
    split1Account: formData.get('split1Account') || undefined,
    split1Amount: formData.get('split1Amount') || undefined,
    split1Label: formData.get('split1Label') || undefined,
    split2Account: formData.get('split2Account') || undefined,
    split2Amount: formData.get('split2Amount') || undefined,
    split2Label: formData.get('split2Label') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }

  const data = parsed.data;
  if (data.total < data.subtotal) {
    return { ok: false, error: 'סך הכול לא יכול להיות קטן מסכום הביניים' };
  }

  // Verify access to company.
  const company = await loadCompanyForUser(me.id, me.email, data.companyId);

  // Ensure supplier exists for this company (create on the fly).
  const { data: existingSupplier } = await admin
    .from('suppliers')
    .select('id')
    .eq('company_id', company.id)
    .eq('internal_code', data.supplierInternalCode)
    .maybeSingle();
  if (!existingSupplier) {
    await admin.from('suppliers').insert({
      company_id: company.id,
      internal_code: data.supplierInternalCode,
      name: data.supplierName,
      tax_id: data.supplierTaxId,
    });
  }

  const fingerprint = [
    data.supplierTaxId.trim().toLowerCase(),
    data.invoiceNumber.trim(),
    data.invoiceDate,
    data.total.toFixed(2),
  ].join('|');

  // Idempotency: skip if same fingerprint already exists for this company.
  const { data: existing } = await admin
    .from('invoices_inbox')
    .select('id')
    .eq('company_id', company.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: 'חשבונית זהה כבר קיימת במערכת (אותו ע.מ ספק + מס׳ חשבונית + תאריך + סכום)',
    };
  }

  const canonical = {
    invoice: {
      number: data.invoiceNumber,
      date: data.invoiceDate,
      ...(data.valueDate ? { value_date: data.valueDate } : {}),
      currency: data.currency,
      allocation_number: data.allocationNumber ?? null,
      ...(data.isCreditNote ? { is_credit_note: true } : {}),
      ...(data.paymentMethod ? { payment_method: data.paymentMethod } : {}),
      ...(data.withholdingPercent ? { withholding_percent: data.withholdingPercent } : {}),
      ...(data.mixedDeductionCategory
        ? { mixed_deduction_category: data.mixedDeductionCategory }
        : {}),
      ...(data.fxRate ? { fx_rate: data.fxRate } : {}),
      ...(data.costCenter ? { cost_center: data.costCenter } : {}),
      ...(buildExpenseSplits(data) ? { expense_splits: buildExpenseSplits(data) } : {}),
    },
    supplier: {
      name: data.supplierName,
      tax_id: data.supplierTaxId,
      internal_code_priority: data.supplierInternalCode,
    },
    totals: {
      subtotal: data.subtotal,
      total: data.total,
      vat_rate: data.invoiceDate >= '2025-01-01' ? 18 : 17,
      vat_amount: Math.round((data.total - data.subtotal) * 100) / 100,
    },
    metadata: {
      source: 'manual_entry',
      ingested_at: new Date().toISOString(),
    },
  };

  const { data: row, error } = await admin
    .from('invoices_inbox')
    .insert({
      company_id: company.id,
      source: 'upload',
      canonical,
      fingerprint,
      status: 'queued',
    })
    .select('id')
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'יצירת חשבונית נכשלה' };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'invoice.create',
    entityType: 'invoice',
    entityId: row.id as string,
    payload: {
      source: 'manual_entry',
      number: data.invoiceNumber,
      supplier: data.supplierName,
      total: data.total,
      created_by: me.email,
    },
  });

  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/c/${company.id}/invoices/${row.id}`);
}
