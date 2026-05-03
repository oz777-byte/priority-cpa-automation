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
  // Overall OCR confidence (0..1) — when present + above company threshold,
  // the invoice is auto-marked as reviewed on creation.
  confidence: z.number().min(0).max(1).optional(),
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
      ...(typeof e.confidence === 'number' ? { ocr_confidence: e.confidence } : {}),
    },
  };

  // Auto-approve when company opted in + OCR confidence meets threshold.
  // Pulls company.auto_approve_ocr_threshold (column from migration 0019).
  const { data: companyMeta } = await admin
    .from('companies')
    .select('auto_approve_ocr_threshold')
    .eq('id', company.id)
    .maybeSingle();
  const threshold = (companyMeta?.auto_approve_ocr_threshold as number | null) ?? null;
  const autoApprove =
    threshold !== null &&
    typeof e.confidence === 'number' &&
    e.confidence >= threshold;

  const { data: row, error } = await admin
    .from('invoices_inbox')
    .insert({
      company_id: company.id,
      source: 'upload',
      canonical,
      fingerprint,
      status: 'queued',
      ...(args.pdfPath ? { pdf_path: args.pdfPath } : {}),
      ...(autoApprove
        ? { reviewed_at: new Date().toISOString(), reviewed_by: me.id }
        : {}),
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

const BulkReviewInput = z.object({
  companyId: z.string().uuid(),
  invoiceIds: z.array(z.string().uuid()).min(1).max(200),
});

export interface BulkReviewResult {
  ok: boolean;
  error?: string;
  marked?: number;
}

/**
 * Bulk-mark invoices as reviewed by the current user. Used by the inbox
 * checkbox UI to clear out a batch of OCR'd invoices that the CPA has
 * verified at-a-glance, without needing to click into each one.
 */
export async function bulkMarkInvoicesReviewedAction(args: {
  companyId: string;
  invoiceIds: string[];
}): Promise<BulkReviewResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = BulkReviewInput.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }

  const company = await loadCompanyForUser(me.id, me.email, parsed.data.companyId);

  const { error, count } = await admin
    .from('invoices_inbox')
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
    }, { count: 'exact' })
    .in('id', parsed.data.invoiceIds)
    .eq('company_id', company.id)
    .is('reviewed_at', null);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'invoice.bulk_review',
    entityType: 'invoice',
    entityId: parsed.data.invoiceIds[0] as string,
    payload: {
      total_marked: count ?? 0,
      ids: parsed.data.invoiceIds,
      reviewer: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/invoices`);
  return { ok: true, marked: count ?? 0 };
}

const UnreviewInput = z.object({
  companyId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export async function unmarkInvoiceReviewedAction(args: {
  companyId: string;
  invoiceId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const admin = getAdminClient();

  const parsed = UnreviewInput.safeParse(args);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const company = await loadCompanyForUser(me.id, me.email, parsed.data.companyId);

  const { error } = await admin
    .from('invoices_inbox')
    .update({ reviewed_at: null, reviewed_by: null })
    .eq('id', parsed.data.invoiceId)
    .eq('company_id', company.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/c/${company.id}/invoices`);
  return { ok: true };
}
