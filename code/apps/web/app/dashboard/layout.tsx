import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  HelpCircle,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listCompaniesForUser } from '@/lib/current-company';
import { CompanySwitcher } from './company-switcher';
import { UserMenu } from './user-menu';
import { BrandLogo } from '@/components/brand-logo';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const companies = await listCompaniesForUser(user.id, user.email);

  return (
    <div className="min-h-screen flex flex-col bg-ink-50">
      <header className="bg-white border-b border-ink-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <Link href="/dashboard" className="flex-shrink-0">
              <BrandLogo size="sm" />
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/dashboard" icon={LayoutDashboard}>ראשי</NavLink>
              <NavLink href="/dashboard/companies" icon={Building2}>החברות שלי</NavLink>
              <NavLink href="/dashboard/help" icon={HelpCircle}>עזרה</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm flex-shrink-0">
            {companies.length > 0 && (
              <CompanySwitcher
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
              />
            )}
            <UserMenu email={user.email} isAdmin={user.role === 'admin'} />
          </div>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
      <footer className="border-t border-ink-200 px-6 py-3 text-xs text-ink-400 text-center">
        Priority CPA Automation · נבנה ע״י{' '}
        <span className="font-semibold text-ink-600">O.S Tech Ventures</span>
        {' · '}
        <Link href="/privacy" className="hover:text-ink-600">מדיניות פרטיות</Link>
        {' · '}
        <Link href="/terms" className="hover:text-ink-600">תנאי שימוש</Link>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition"
    >
      <Icon size={15} />
      {children}
    </Link>
  );
}
