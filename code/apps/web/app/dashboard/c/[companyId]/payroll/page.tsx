import { Briefcase } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { PayrollPanel, type PayrollRow, type PayrollStatus } from './payroll-panel';

export const dynamic = 'force-dynamic';

interface DBRow {
  id: string;
  employee_id: string;
  employee_name: string;
  month_date: string;
  gross: number;
  ni_employee: number;
  income_tax: number;
  pension_employee: number;
  study_fund_employee: number;
  ni_employer: number;
  pension_employer: number;
  study_fund_employer: number;
  severance_employer: number;
  net: number;
  status: PayrollStatus;
}

export default async function PayrollPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data } = await admin
    .from('payroll_entries')
    .select(
      'id, employee_id, employee_name, month_date, gross, ni_employee, income_tax, pension_employee, study_fund_employee, ni_employer, pension_employer, study_fund_employer, severance_employer, net, status',
    )
    .eq('company_id', company.id)
    .order('month_date', { ascending: false })
    .order('employee_name', { ascending: true });

  const rows: PayrollRow[] = ((data ?? []) as DBRow[]).map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    month_date: r.month_date,
    gross: Number(r.gross),
    ni_employee: Number(r.ni_employee),
    income_tax: Number(r.income_tax),
    pension_employee: Number(r.pension_employee),
    study_fund_employee: Number(r.study_fund_employee),
    ni_employer: Number(r.ni_employer),
    pension_employer: Number(r.pension_employer),
    study_fund_employer: Number(r.study_fund_employer),
    severance_employer: Number(r.severance_employer),
    net: Number(r.net),
    status: r.status,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Briefcase size={18} className="text-brand-500" />
          משכורות
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          רשומות שכר חודשיות לעובדי {company.name}. כל רשומה מייצרת אוטומטית 3
          פקודות יומן: גרוס/נטו + הפרשות מעביד + תשלום נטו.
        </p>
      </div>

      <PayrollPanel rows={rows} companyId={company.id} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed">
        <strong>בקרוב:</strong> ייבוא תלוש שכר מ-Hilan / Michpal / Synel ב-CSV /
        JSON. בשלב זה — הזנה ידנית לכל עובד-חודש.
      </div>
    </div>
  );
}
