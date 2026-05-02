import { GitBranch } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  MappingPanel,
  type MappingRuleRow,
  type SupplierOption,
} from './mapping-panel';

export const dynamic = 'force-dynamic';

interface DBRule {
  id: string;
  priority: number;
  match_supplier_id: string | null;
  match_amount_min: number | null;
  match_amount_max: number | null;
  expense_account: string;
  vat_account: string;
  cost_center: string | null;
}

interface DBSupplier {
  id: string;
  name: string;
  internal_code: string;
}

export default async function AccountMappingPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const [{ data: rulesData }, { data: suppliersData }] = await Promise.all([
    admin
      .from('account_mapping_rules')
      .select(
        'id, priority, match_supplier_id, match_amount_min, match_amount_max, expense_account, vat_account, cost_center',
      )
      .eq('company_id', company.id)
      .order('priority', { ascending: true }),
    admin
      .from('suppliers')
      .select('id, name, internal_code')
      .eq('company_id', company.id)
      .order('name', { ascending: true }),
  ]);

  const suppliers = (suppliersData ?? []) as DBSupplier[];
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const rules: MappingRuleRow[] = ((rulesData ?? []) as DBRule[]).map((r) => {
    const supplier = r.match_supplier_id ? supplierById.get(r.match_supplier_id) : null;
    return {
      id: r.id,
      priority: r.priority,
      match_supplier_id: r.match_supplier_id,
      match_supplier_name: supplier?.name ?? null,
      match_amount_min: r.match_amount_min,
      match_amount_max: r.match_amount_max,
      expense_account: r.expense_account,
      vat_account: r.vat_account,
      cost_center: r.cost_center,
    };
  });

  const supplierOptions: SupplierOption[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    internal_code: s.internal_code,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <GitBranch size={18} className="text-brand-500" />
          כללי מיפוי חשבונות
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          מנוע כללים שבוחר חשבון הוצאה / מע"מ / מרכז עלות לכל חשבונית. הכללים
          רצים בסדר עדיפות; הכלל הראשון שמתאים — קובע. בלי כללים — JE משתמש
          בברירות המחדל של החברה ובהגדרות פר-ספק.
        </p>
      </div>

      <MappingPanel rows={rules} suppliers={supplierOptions} companyId={company.id} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed">
        <strong>סדר ההחלטה</strong> בעת בניית JE: כללי מיפוי (לפי עדיפות) → ברירת
        מחדל פר-ספק (במאסטר) → ברירת מחדל לחברה (בהגדרות).
      </div>
    </div>
  );
}
