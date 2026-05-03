'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const FIELD_PATHS = [
  'supplier.name',
  'supplier.tax_id',
  'invoice.number',
  'invoice.date',
  'invoice.allocation_number',
  'totals.subtotal',
  'totals.total',
] as const;

type FieldPath = (typeof FIELD_PATHS)[number];

const Input = z.object({
  companyId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  fieldPath: z.enum(FIELD_PATHS),
  correctedValue: z.string().trim().min(1).max(200),
});

export interface FieldCorrectionResult {
  ok: boolean;
  error?: string;
}

/**
 * Apply a user-corrected value to a single field on an invoice's canonical
 * JSON, and log the correction to ocr_corrections for future training/audit.
 *
 * Numeric fields (subtotal, total) are coerced to numbers in the canonical
 * but stored as strings in the corrections log (for consistency).
 */
export async function submitFieldCorrectionAction(
  formData: FormData,
): Promise<FieldCorrectionResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = Input.safeParse({
    companyId: formData.get('companyId'),
    invoiceId: formData.get('invoiceId'),
    fieldPath: formData.get('fieldPath'),
    correctedValue: formData.get('correctedValue'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }
  const { companyId, invoiceId, fieldPath, correctedValue } = parsed.data;
  const company = await loadCompanyForUser(me.id, me.email, companyId);

  // Pull canonical for the original value + apply the patch.
  const { data: invRow } = await admin
    .from('invoices_inbox')
    .select('canonical')
    .eq('id', invoiceId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!invRow) return { ok: false, error: 'חשבונית לא נמצאה' };

  const canonical = (invRow.canonical ?? {}) as Record<string, unknown>;
  const originalValue = readPath(canonical, fieldPath);
  const newValue = coerceForField(fieldPath, correctedValue);
  const updated = writePath(canonical, fieldPath, newValue);

  // Recompute totals.total - subtotal if either was changed (for VAT consistency).
  if (fieldPath === 'totals.subtotal' || fieldPath === 'totals.total') {
    const t = (updated.totals ?? {}) as Record<string, unknown>;
    const sub = Number(t.subtotal);
    const tot = Number(t.total);
    if (Number.isFinite(sub) && Number.isFinite(tot) && tot >= sub) {
      t.vat_amount = Math.round((tot - sub) * 100) / 100;
      updated.totals = t;
    }
  }

  // Save back.
  const { error: updErr } = await admin
    .from('invoices_inbox')
    .update({ canonical: updated })
    .eq('id', invoiceId);
  if (updErr) return { ok: false, error: updErr.message };

  // Log the correction.
  await admin.from('ocr_corrections').insert({
    company_id: company.id,
    invoice_id: invoiceId,
    field_path: fieldPath,
    original_value: originalValue == null ? null : String(originalValue),
    corrected_value: String(correctedValue),
    corrected_by: me.id,
  });

  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'invoice.field_correction',
    entityType: 'invoice',
    entityId: invoiceId,
    payload: {
      field_path: fieldPath,
      original: originalValue == null ? null : String(originalValue),
      corrected: correctedValue,
      corrected_by: me.email,
    },
  });

  revalidatePath(`/dashboard/c/${company.id}/invoices/${invoiceId}`);
  revalidatePath(`/dashboard/c/${company.id}/invoices`);
  return { ok: true };
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function writePath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.');
  // Shallow clone all touched levels.
  const root = { ...obj };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = (cur[p] ?? {}) as Record<string, unknown>;
    cur[p] = { ...next };
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return root;
}

function coerceForField(path: FieldPath, value: string): unknown {
  if (path === 'totals.subtotal' || path === 'totals.total') {
    const n = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(n)) return value;
    return Math.round(n * 100) / 100;
  }
  return value;
}
