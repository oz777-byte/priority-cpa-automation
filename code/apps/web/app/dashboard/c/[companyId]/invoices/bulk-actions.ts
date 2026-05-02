'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { CurrencySchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const ExtractedSchema = z.object({
  supplier: z
    .object({
      name: z.string().optional(),
      tax_id: z.string().optional(),
    })
    .optional(),
  invoice: z
    .object({
      number: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      currency: CurrencySchema.optional(),
    })
    .optional(),
  totals: z
    .object({
      subtotal: z.number().nonnegative().optional(),
      vat_amount: z.number().nonnegative().optional(),
      total: z.number().nonnegative().optional(),
    })
    .optional(),
});

export interface BulkCreateResult {
  ok: boolean;
  error?: string;
  invoiceId?: string;
  duplicate?: boolean;
}

/**
 * Create an invoice in invoices_inbox directly from OCR-extracted fields,
 * skipping the manual form. The invoice goes into 'queued' status — the
 * JE constructor will pick it up the next time the JE editor loads.
 *
 * Tries to match the supplier by tax_id against the company master to
 * pull the Priority internal code. Falls back to using the tax_id as
 * the temporary code (the user can reconcile later in the suppliers tab).
 */
export async function createInvoiceFromOcrAction(args: {
  companyId: string;
  extracted: unknown;
  pdfPath: string | null;
  fileName: string;
}): Promise<BulkCreateResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsedExtracted = ExtractedSchema.safeParse(args.extracted);
  if (!parsedExtracted.success) {
    return { ok: false, error: 'נתוני OCR לא תקינים' };
  }
  const e = parsedExtracted.data;

  // Required-ish fields. We bail with a clear message if the basics are missing.
  const supplierName = e.supplier?.name?.trim();
  const supplierTaxId = e.supplier?.tax_id?.trim();
  const invoiceNumber = e.invoice?.number?.trim();
  const invoiceDate = e.invoice?.date;
  const subtotal = e.totals?.subtotal;
  const total = e.totals?.total;
  if (!supplierName || !invoiceNumber || !invoiceDate || total === undefined) {
    return {
      ok: false,
      error: 'חילוץ חלקי — חסרים שם ספק / מספר חשבונית / תאריך / סכום',
    };
  }

  const company = await loadCompanyForUser(me.id, me.email, args.companyId);

  // Resolve supplier internal code. Prefer master match by tax_id, fall back
  // to tax_id itself as a placeholder.
  let supplierInternalCode = supplierTaxId ?? '0';
  if (supplierTaxId) {
    const { data: existingSupplier } = await admin
      .from('suppliers')
      .select('internal_code, name')
      .eq('company_id', company.id)
      .eq('tax_id', supplierTaxId)
      .maybeSingle();
    if (existingSupplier) {
      supplierInternalCode = existingSupplier.internal_code as string;
    } else {
      // Auto-create a stub supplier so reviews can fix it later.
      await admin
        .from('suppliers')
        .insert({
          company_id: company.id,
          internal_code: supplierTaxId,
          name: supplierName,
          tax_id: supplierTaxId,
        })
        .select('internal_code')
        .maybeSingle();
    }
  }

  const subtotalFinal = subtotal ?? Math.round(total / 1.18 * 100) / 100;

  const fingerprint = [
    (supplierTaxId ?? '').toLowerCase(),
    invoiceNumber,
    invoiceDate,
    total.toFixed(2),
  ].join('|');

  const { data: existing } = await admin
    .from('invoices_inbox')
    .select('id')
    .eq('company_id', company.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (existing) {
    return { ok: false, duplicate: true, error: 'חשבונית זהה כבר קיימת', invoiceId: existing.id as string };
  }

  const canonical = {
    invoice: {
      number: invoiceNumber,
      date: invoiceDate,
      currency: e.invoice?.currency ?? 'ILS',
      allocation_number: null,
    },
    supplier: {
      name: supplierName,
      tax_id: supplierTaxId ?? '',
      internal_code_priority: supplierInternalCode,
    },
    totals: {
      subtotal: subtotalFinal,
      total,
      vat_rate: invoiceDate >= '2025-01-01' ? 18 : 17,
      vat_amount: Math.round((total - subtotalFinal) * 100) / 100,
    },
    metadata: {
      source: 'ocr_bulk',
      ingested_at: new Date().toISOString(),
      original_filename: args.fileName,
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
      ...(args.pdfPath ? { pdf_path: args.pdfPath } : {}),
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
      source: 'ocr_bulk',
      number: invoiceNumber,
      supplier: supplierName,
      total,
      file_name: args.fileName,
      created_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/invoices`);
  revalidatePath('/dashboard', 'layout');
  return { ok: true, invoiceId: row.id as string };
}
