import Link from 'next/link';
import { LayoutDashboard, Building2, ChevronLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';

export default async function CompanyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-600">
        <Link
          href="/dashboard"
          className="hover:text-ink-900 flex items-center gap-1"
        >
          <LayoutDashboard size={14} />
          ראשי
        </Link>
        <ChevronLeft size={12} className="text-ink-400" />
        <span className="text-ink-900 font-semibold flex items-center gap-1.5">
          <Building2 size={14} className="text-brand-500" />
          {company.name}
        </span>
        <span className="text-xs text-ink-400" dir="ltr">
          · ע.מ {company.tax_id}
        </span>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-6">{children}</div>
    </div>
  );
}
