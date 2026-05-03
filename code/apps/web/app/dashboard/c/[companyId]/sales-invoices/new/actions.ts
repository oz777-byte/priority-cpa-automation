'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { CurrencySchema, SalesInvoiceSchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const optString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const optNumber = z
  .union([z.coerce.number(), z.literal('').transform(() => undefined)])
  .optional();

const Input = z.object({
  companyId: z.string().uuid(),
  customerId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  invoiceNumber: z.string().trim().min(1).max(20),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות YYYY-MM-DD'),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: CurrencySchema.default('ILS'),
  docType: z.enum([
    'tax_invoice',
    'invoice_receipt',
    'proforma',
    'receipt',
    'credit_note',
  ]),
  paymentMethod: z
    .enum(['credit', 'cash', 'card', 'transfer', 'check_postdated', 'installments'])
    .optional(),
  installmentsCount: z.coerce.number().int().min(2).max(36).optional(),
  customerWithholdingPercent: z.coerce.number().min(0).max(100).optional(),
  fxRate: z.coerce.number().positive().optional(),
  costCenter: optString(20),
  exportCountry: optString(2),
  vatExemptReason: optString(60),
  badDebtOriginalInvoice: optString(20),
  // Customer details (snapshot at invoice time)
  customerName: z.string().trim().min(2).max(100),
  customerTaxId: optString(15),
  customerInternalCode: z.string().trim().min(1).max(15),
  // Totals
  subtotal: z.coerce.number().nonnegative(),
  total: z.coerce.number().nonnegative(),
  // Optional line items (free-form for V1; stored as JSON)
  lineDescription: optString(200),
});

export interface CreateSalesInvoiceResult {
  ok: boolean;
  error?: string;
  salesInvoiceId?: string;
}

export async function createSalesInvoiceAction(
  formData: FormData,
): Promise<CreateSalesInvoiceResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    customerId: formData.get('customerId') ?? undefined,
    invoiceNumber: formData.get('invoiceNumber'),
    invoiceDate: formData.get('invoiceDate'),
    valueDate: formData.get('valueDate') ?? undefined,
    currency: formData.get('currency') ?? 'ILS',
    docType: formData.get('docType') ?? 'tax_invoice',
    paymentMethod: formData.get('paymentMethod') || undefined,
    installmentsCount: formData.get('installmentsCount') || undefined,
    customerWithholdingPercent: formData.get('customerWithholdingPercent') || undefined,
    fxRate: formData.get('fxRate') || undefined,
    costCenter: formData.get('costCenter') ?? undefined,
    exportCountry: formData.get('exportCountry') ?? undefined,
    vatExemptReason: formData.get('vatExemptReason') ?? undefined,
    badDebtOriginalInvoice: formData.get('badDebtOriginalInvoice') ?? undefined,
    customerName: formData.get('customerName'),
    customerTaxId: formData.get('customerTaxId') ?? undefined,
    customerInternalCode: formData.get('customerInternalCode'),
    subtotal: formData.get('subtotal'),
    total: formData.get('total'),
    lineDescription: formData.get('lineDescription') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const data = parsed.data;
  if (data.total < data.subtotal) {
    return { ok: false, error: 'סך הכול לא יכול להיות קטן מסכום הביניים' };
  }

  const company = await loadCompanyForUser(me.id, me.email, data.companyId);

  // Auto-create customer in master if it doesn't exist by internal_code.
  const { data: existingCustomer } = await admin
    .from('customers')
    .select('id')
    .eq('company_id', company.id)
    .eq('internal_code', data.customerInternalCode)
    .maybeSingle();
  if (!existingCustomer) {
    await admin.from('customers').insert({
      company_id: company.id,
      internal_code: data.customerInternalCode,
      name: data.customerName,
      tax_id: data.customerTaxId,
    });
  }

  // Build canonical SalesInvoice
  const canonical = {
    invoice: {
      number: data.invoiceNumber,
      date: data.invoiceDate,
      ...(data.valueDate ? { value_date: data.valueDate } : {}),
      currency: data.currency,
      document_type: data.docType,
      ...(data.paymentMethod ? { payment_method: data.paymentMethod } : {}),
      ...(data.installmentsCount ? { installments_count: data.installmentsCount } : {}),
      ...(data.customerWithholdingPercent
        ? { customer_withholding_percent: data.customerWithholdingPercent }
        : {}),
      ...(data.fxRate ? { fx_rate: data.fxRate } : {}),
      ...(data.costCenter ? { cost_center: data.costCenter } : {}),
      ...(data.exportCountry ? { export_country: data.exportCountry } : {}),
      ...(data.vatExemptReason ? { vat_exempt_reason: data.vatExemptReason } : {}),
      ...(data.badDebtOriginalInvoice
        ? { bad_debt_original_invoice: data.badDebtOriginalInvoice }
        : {}),
    },
    customer: {
      name: data.customerName,
      tax_id: data.customerTaxId ?? '',
      internal_code_priority: data.customerInternalCode,
    },
    totals: {
      subtotal: data.subtotal,
      total: data.total,
      vat_rate: data.invoiceDate >= '2025-01-01' ? 18 : 17,
      vat_amount: Math.round((data.total - data.subtotal) * 100) / 100,
    },
    ...(data.lineDescription
      ? {
          line_items: [
            {
              description: data.lineDescription,
              line_total: data.subtotal,
            },
          ],
        }
      : {}),
    metadata: {
      source: 'manual_entry',
      ingested_at: new Date().toISOString(),
    },
  };

  const validated = SalesInvoiceSchema.safeParse(canonical);
  if (!validated.success) {
    return { ok: false, error: 'מבנה החשבונית שגוי: ' + validated.error.errors[0]?.message };
  }

  const fingerprint = [
    (data.customerTaxId ?? '').toLowerCase(),
    data.invoiceNumber,
    data.invoiceDate,
    data.total.toFixed(2),
    data.docType,
  ].join('|');

  const { data: existing } = await admin
    .from('sales_invoices')
    .select('id')
    .eq('company_id', company.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: 'חשבונית מכירה זהה כבר קיימת במערכת' };
  }

  const { data: row, error } = await admin
    .from('sales_invoices')
    .insert({
      company_id: company.id,
      doc_type: data.docType,
      canonical: validated.data,
      invoice_number: data.invoiceNumber,
      fingerprint,
      status: 'queued',
    })
    .select('id')
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'יצירת חשבונית מכירה נכשלה' };
  }

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'sales_invoice.create',
    entityType: 'sales_invoice',
    entityId: row.id as string,
    payload: {
      doc_type: data.docType,
      number: data.invoiceNumber,
      customer: data.customerName,
      total: data.total,
      created_by: me.email,
    },
  });

  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/c/${company.id}/sales-invoices/${row.id}`);
}
