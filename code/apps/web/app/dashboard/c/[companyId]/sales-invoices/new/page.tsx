import Link from 'next/link';
import { Plus, ArrowRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { createSalesInvoiceAction } from './actions';
import { SalesInvoiceForm, type CustomerOption } from './sales-invoice-form';

export const dynamic = 'force-dynamic';

async function submitForm(formData: FormData): Promise<void> {
  'use server';
  const r = await createSalesInvoiceAction(formData);
  if (!r.ok) {
    throw new Error(r.error ?? 'שגיאה ביצירת חשבונית מכירה');
  }
}

export default async function NewSalesInvoicePage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const today = new Date().toISOString().slice(0, 10);

  const admin = getAdminClient();
  const { data: customersData } = await admin
    .from('customers')
    .select('id, name, internal_code, tax_id, default_revenue_account, withholding_percent')
    .eq('company_id', company.id)
    .order('name', { ascending: true });

  const customers: CustomerOption[] = ((customersData ?? []) as Array<{
    id: string;
    name: string;
    internal_code: string;
    tax_id: string | null;
    default_revenue_account: string | null;
    withholding_percent: number | null;
  }>).map((c) => ({
    id: c.id,
    name: c.name,
    internal_code: c.internal_code,
    tax_id: c.tax_id,
    default_revenue_account: c.default_revenue_account,
    withholding_percent: c.withholding_percent !== null ? Number(c.withholding_percent) : null,
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/c/${company.id}/sales-invoices`}
          className="text-sm text-accent-600 hover:underline flex items-center gap-1"
        >
          <ArrowRight size={14} />
          חזרה לרשימת חשבוניות מכירה
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
          <Plus size={18} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            חשבונית מכירה חדשה ל-{company.name}
          </h2>
          <p className="text-sm text-ink-600 mt-0.5">
            JE ייווצר אוטומטית לפי סוג המסמך ושיטת התשלום. בחר לקוח מהמאסטר או הזן חדש (יתוסף אוטומטית).
          </p>
        </div>
      </div>

      <SalesInvoiceForm
        companyId={company.id}
        today={today}
        customers={customers}
        submitAction={submitForm}
      />
    </div>
  );
}
