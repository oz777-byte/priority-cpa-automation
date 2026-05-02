import { Package } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { ItemsPanel, type ItemRow, type VatCategory } from './items-panel';

export const dynamic = 'force-dynamic';

interface DBItem {
  id: string;
  name: string;
  internal_code: string;
  description: string | null;
  unit: string | null;
  default_unit_price: number | null;
  default_revenue_account: string | null;
  vat_category: VatCategory;
  is_active: boolean;
}

export default async function ItemsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data } = await admin
    .from('items')
    .select(
      'id, name, internal_code, description, unit, default_unit_price, default_revenue_account, vat_category, is_active',
    )
    .eq('company_id', company.id)
    .order('name', { ascending: true });

  const rows: ItemRow[] = ((data ?? []) as DBItem[]).map((i) => ({
    id: i.id,
    name: i.name,
    internal_code: i.internal_code,
    description: i.description,
    unit: i.unit,
    default_unit_price:
      i.default_unit_price !== null ? Number(i.default_unit_price) : null,
    default_revenue_account: i.default_revenue_account,
    vat_category: i.vat_category,
    is_active: i.is_active,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Package size={18} className="text-brand-500" />
          קטלוג פריטים
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          פריטי המכירה של {company.name} — מוצרים ושירותים. כל פריט נושא חשבון
          הכנסות וקטגוריית מע"מ ברירת מחדל המוחלים אוטומטית בחשבונית מכירה.
        </p>
      </div>

      <ItemsPanel rows={rows} companyId={company.id} />
    </div>
  );
}
