import { Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { CustomersPanel, type CustomerRow } from './customers-panel';

export const dynamic = 'force-dynamic';

interface DBCustomer {
  id: string;
  name: string;
  internal_code: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  default_revenue_account: string | null;
  withholding_percent: number | null;
  payment_terms: string | null;
  notes: string | null;
}

export default async function CustomersPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data } = await admin
    .from('customers')
    .select(
      'id, name, internal_code, tax_id, email, phone, address, default_revenue_account, withholding_percent, payment_terms, notes',
    )
    .eq('company_id', company.id)
    .order('name', { ascending: true });

  const rows: CustomerRow[] = ((data ?? []) as DBCustomer[]).map((c) => ({
    id: c.id,
    name: c.name,
    internal_code: c.internal_code,
    tax_id: c.tax_id,
    email: c.email,
    phone: c.phone,
    address: c.address,
    default_revenue_account: c.default_revenue_account,
    withholding_percent: c.withholding_percent !== null ? Number(c.withholding_percent) : null,
    payment_terms: c.payment_terms,
    notes: c.notes,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Users size={18} className="text-brand-500" />
          ניהול לקוחות
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          מאסטר הלקוחות של {company.name}. נדרש לחשבוניות מכירה (AR) — מקביל
          למאסטר הספקים.
        </p>
      </div>

      <CustomersPanel rows={rows} companyId={company.id} />
    </div>
  );
}
