'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureUserFirm } from '@/lib/bootstrap';
import { setCompanyCookie } from '@/lib/current-company';

const CreateCompanyInput = z.object({
  name: z.string().min(2, 'שם חברה חייב להיות לפחות 2 תווים'),
  tax_id: z.string().min(7).max(15),
  priority_version: z.string().optional(),
  expense_account: z.string().min(1).max(8),
  vat_input_account: z.string().min(1).max(8),
  details_prefix: z.string().min(1).default('קניות'),
  transaction_type: z.string().min(1).max(3).default('מ'),
});

export interface CreateCompanyResult {
  ok: boolean;
  error?: string;
  companyId?: string;
}

export async function createCompanyAction(formData: FormData): Promise<CreateCompanyResult> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const parsed = CreateCompanyInput.safeParse({
    name: formData.get('name'),
    tax_id: formData.get('tax_id'),
    priority_version: formData.get('priority_version') || undefined,
    expense_account: formData.get('expense_account'),
    vat_input_account: formData.get('vat_input_account'),
    details_prefix: formData.get('details_prefix') || 'קניות',
    transaction_type: formData.get('transaction_type') || 'מ',
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' };
  }

  const firmId = await ensureUserFirm(me.id, me.email);

  const { data, error } = await admin
    .from('companies')
    .insert({
      firm_id: firmId,
      name: parsed.data.name,
      tax_id: parsed.data.tax_id,
      priority_version: parsed.data.priority_version ?? null,
      status: 'active',
      settings: {
        expense_account: parsed.data.expense_account,
        vat_input_account: parsed.data.vat_input_account,
        details_prefix: parsed.data.details_prefix,
        transaction_type: parsed.data.transaction_type,
        currency: 'ILS',
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'יצירת חברה נכשלה' };
  }

  await audit.log({
    companyId: data.id as string,
    userId: me.id,
    action: 'company.create',
    entityType: 'company',
    entityId: data.id as string,
    payload: {
      name: parsed.data.name,
      tax_id: parsed.data.tax_id,
      created_by: me.email,
    },
  });

  // Auto-select newly created company
  setCompanyCookie(data.id as string);

  revalidatePath('/dashboard/companies');
  revalidatePath('/dashboard');
  return { ok: true, companyId: data.id as string };
}

export async function selectCompanyAction(companyId: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const admin = getAdminClient();
  // Validate the user has access to this company (i.e., it belongs to their firm)
  const firmId = await ensureUserFirm(me.id, me.email);
  const { data, error } = await admin
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('firm_id', firmId)
    .maybeSingle();
  if (error || !data) return { ok: false };

  setCompanyCookie(companyId);
  revalidatePath('/dashboard');
  return { ok: true };
}

const SeedPocSchema = z.object({ companyId: z.string().uuid() });

export async function seedPocInvoicesAction(formData: FormData): Promise<{ ok: boolean; error?: string; created?: number }> {
  const me = await requireUser();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);
  const parsed = SeedPocSchema.safeParse({ companyId: formData.get('companyId') });
  if (!parsed.success) return { ok: false, error: 'בחר חברה' };
  const companyId = parsed.data.companyId;

  // Confirm membership
  const firmId = await ensureUserFirm(me.id, me.email);
  const { data: company } = await admin
    .from('companies')
    .select('id, firm_id, settings')
    .eq('id', companyId)
    .maybeSingle();
  if (!company || company.firm_id !== firmId) {
    return { ok: false, error: 'אין הרשאה לחברה זו' };
  }

  // Two POC invoices, hardcoded as canonical objects.
  const pocInvoices = [
    {
      slug: 'wertheim-4427930',
      supplier: {
        name: 'שיווק והספקה וירטהיים בע"מ',
        tax_id: '510847064',
        internal_code_priority: '200087',
      },
      invoice: {
        number: '4427930',
        date: '2026-02-10',
        currency: 'ILS' as const,
        allocation_number: '1I4427930',
      },
      totals: { subtotal: 484.78, vat_rate: 18, vat_amount: 87.25, total: 572.0 },
    },
    {
      slug: 'tzarfati-114390',
      supplier: {
        name: 'יצחק מ צרפתי ובנו בע"מ',
        tax_id: '510044969',
        internal_code_priority: '200037',
      },
      invoice: {
        number: '114390',
        date: '2026-03-05',
        currency: 'ILS' as const,
        allocation_number: null,
      },
      totals: { subtotal: 5488.14, vat_rate: 18, vat_amount: 987.86, total: 6476.0 },
    },
  ];

  let created = 0;
  for (const inv of pocInvoices) {
    const fingerprint = [
      inv.supplier.tax_id,
      inv.invoice.number,
      inv.invoice.date,
      inv.totals.total.toFixed(2),
    ].join('|');

    // Skip if already seeded
    const { data: existing } = await admin
      .from('invoices_inbox')
      .select('id')
      .eq('company_id', companyId)
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    if (existing) continue;

    // Ensure supplier exists
    const { data: existingSupplier } = await admin
      .from('suppliers')
      .select('id')
      .eq('company_id', companyId)
      .eq('internal_code', inv.supplier.internal_code_priority)
      .maybeSingle();
    if (!existingSupplier) {
      await admin.from('suppliers').insert({
        company_id: companyId,
        internal_code: inv.supplier.internal_code_priority,
        name: inv.supplier.name,
        tax_id: inv.supplier.tax_id,
      });
    }

    const { data: invRow, error: invError } = await admin
      .from('invoices_inbox')
      .insert({
        company_id: companyId,
        source: 'upload',
        canonical: inv,
        fingerprint,
        status: 'queued',
      })
      .select('id')
      .single();
    if (invError || !invRow) continue;

    await audit.log({
      companyId,
      userId: me.id,
      action: 'invoice.create',
      entityType: 'invoice',
      entityId: invRow.id as string,
      payload: { source: 'poc_seed', number: inv.invoice.number },
    });
    created++;
  }

  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard');
  return { ok: true, created };
}
