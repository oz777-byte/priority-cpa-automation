import { Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { SuppliersPanel, type SupplierRow } from './suppliers-panel';

export const dynamic = 'force-dynamic';

interface DBSupplier {
  id: string;
  name: string;
  internal_code: string;
  tax_id: string | null;
  dealer_status: 'registered' | 'exempt' | 'foreign';
  default_expense_account: string | null;
  default_cost_center: string | null;
  payment_terms: string | null;
  learned_from_count: number;
}

export default async function SuppliersPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data: suppliers } = await admin
    .from('suppliers')
    .select(
      'id, name, internal_code, tax_id, dealer_status, default_expense_account, default_cost_center, payment_terms, learned_from_count',
    )
    .eq('company_id', company.id)
    .order('name', { ascending: true });

  const supplierList = (suppliers ?? []) as DBSupplier[];

  // Count invoices per supplier (matched by canonical.supplier.tax_id).
  // We do this in one query per company and bucket the results.
  const taxIds = supplierList.map((s) => s.tax_id).filter((v): v is string => !!v);
  const invoiceCountByTaxId = new Map<string, number>();
  if (taxIds.length > 0) {
    const { data: invs } = await admin
      .from('invoices_inbox')
      .select('canonical')
      .eq('company_id', company.id);
    for (const inv of invs ?? []) {
      const tx = ((inv.canonical ?? {}) as { supplier?: { tax_id?: string } })
        .supplier?.tax_id;
      if (tx && taxIds.includes(tx)) {
        invoiceCountByTaxId.set(tx, (invoiceCountByTaxId.get(tx) ?? 0) + 1);
      }
    }
  }

  const rows: SupplierRow[] = supplierList.map((s) => ({
    id: s.id,
    name: s.name,
    internal_code: s.internal_code,
    tax_id: s.tax_id,
    dealer_status: s.dealer_status,
    default_expense_account: s.default_expense_account,
    default_cost_center: s.default_cost_center,
    payment_terms: s.payment_terms,
    invoiceCount: s.tax_id ? invoiceCountByTaxId.get(s.tax_id) ?? 0 : 0,
    learnedFromCount: s.learned_from_count ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Users size={18} className="text-brand-500" />
          ניהול ספקים
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          מאסטר הספקים של {company.name}. כל ספק שתזין יזוהה אוטומטית בחשבוניות
          עתידיות (לפי ע.מ או קוד), עם החשבון ומרכז העלות שהגדרת לו.
        </p>
      </div>

      <SuppliersPanel rows={rows} companyId={company.id} />
    </div>
  );
}
