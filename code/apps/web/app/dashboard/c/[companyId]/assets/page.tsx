import { Truck } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { AssetsPanel, type AssetRow } from './assets-panel';

export const dynamic = 'force-dynamic';

interface DBAsset {
  id: string;
  name: string;
  description: string | null;
  category: string;
  serial_number: string | null;
  purchase_date: string;
  purchase_amount: number;
  depreciation_rate_annual: number;
  salvage_value: number;
  useful_life_months: number;
  asset_account: string;
  accumulated_depreciation_account: string;
  depreciation_expense_account: string;
  cost_center: string | null;
  status: string;
  in_service_date: string | null;
  retired_date: string | null;
  retirement_proceeds: number | null;
  accumulated_depreciation: number;
  last_depreciation_date: string | null;
  created_at: string;
}

export default async function AssetsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data: assetsRaw } = await admin
    .from('fixed_assets')
    .select('*')
    .eq('company_id', company.id)
    .order('purchase_date', { ascending: false });

  const rows: AssetRow[] = ((assetsRaw ?? []) as unknown as DBAsset[]).map((a) => {
    const purchase = Number(a.purchase_amount);
    const accumulated = Number(a.accumulated_depreciation);
    const salvage = Number(a.salvage_value);
    const netBookValue = Math.max(salvage, purchase - accumulated);
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      serialNumber: a.serial_number,
      purchaseDate: a.purchase_date,
      purchaseAmount: purchase,
      annualRate: Number(a.depreciation_rate_annual),
      salvageValue: salvage,
      usefulLifeMonths: a.useful_life_months,
      assetAccount: a.asset_account,
      accumulatedDepreciation: accumulated,
      lastDepreciationDate: a.last_depreciation_date,
      netBookValue,
      status: a.status as AssetRow['status'],
      retiredDate: a.retired_date,
      retirementProceeds: a.retirement_proceeds ? Number(a.retirement_proceeds) : null,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Truck size={18} className="text-brand-500" />
          נכסי קבע ופחת
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          רישום נכסים, מעקב אחרי ערך פנקסני, והרצת פחת חודשי קו ישר אוטומטית. בעת רכישה
          מתבצעת קפיטליזציה (DR נכס) במקום DR להוצאה. בעת מכירה מחושב רווח/הפסד הון.
        </p>
      </div>

      <AssetsPanel companyId={company.id} rows={rows} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed space-y-1">
        <div>
          <strong>שיעורי פחת ברירת מחדל</strong> (תקנות מס הכנסה): מחשבים 33%, רכבים 15%,
          מבנים 4%, ריהוט וציוד משרדי 7%, תוכנה 33%.
        </div>
        <div>
          <strong>פחת חודשי קו ישר:</strong> (עלות − ערך גרט) ÷ חיי שירות בחודשים. הריצה
          חוסמת תקופות נעולות אוטומטית.
        </div>
      </div>
    </div>
  );
}
