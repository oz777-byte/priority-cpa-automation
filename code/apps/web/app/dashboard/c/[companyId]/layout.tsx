import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  ChevronLeft,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { setCompanyCookie } from '@/lib/current-company';
import { WorkspaceTabs } from './workspace-tabs';

export default async function CompanyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  // Keep cookie in sync so cookie-based actions still work.
  setCompanyCookie(company.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="text-ink-600 hover:text-ink-900 flex items-center gap-1"
        >
          <LayoutDashboard size={14} />
          ראשי
        </Link>
        <ChevronLeft size={14} className="text-ink-400" />
        <span className="text-ink-900 font-medium flex items-center gap-1.5">
          <Building2 size={14} className="text-brand-500" />
          {company.name}
        </span>
        <span className="text-xs text-ink-400" dir="ltr">· ע.מ {company.tax_id}</span>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl">
        <WorkspaceTabs companyId={company.id} />
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
