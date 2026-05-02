import Link from 'next/link';
import {
  LayoutDashboard,
  Inbox,
  FileEdit,
  Building2,
  Settings,
  Users,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import {
  listCompaniesForUser,
  getCurrentCompany,
} from '@/lib/current-company';
import { LogoutButton } from './logout-button';
import { CompanySwitcher } from './company-switcher';
import { BrandLogo } from '@/components/brand-logo';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const companies = await listCompaniesForUser(user.id, user.email);
  const current = await getCurrentCompany(user.id, user.email);

  return (
    <div className="min-h-screen flex flex-col bg-ink-50">
      <header className="bg-white border-b border-ink-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard">
              <BrandLogo size="sm" />
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/dashboard" icon={LayoutDashboard}>ראשי</NavLink>
              <NavLink href="/dashboard/invoices" icon={Inbox}>חשבוניות</NavLink>
              <NavLink href="/dashboard/journal-entries" icon={FileEdit}>פקודות יומן</NavLink>
              <NavLink href="/dashboard/companies" icon={Building2}>חברות</NavLink>
              <NavLink href="/dashboard/settings" icon={Settings}>הגדרות</NavLink>
              {user.role === 'admin' && (
                <NavLink href="/dashboard/admin/users" icon={Users}>משתמשים</NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CompanySwitcher
              companies={companies.map((c) => ({ id: c.id, name: c.name }))}
              currentId={current?.id ?? null}
            />
            {user.role === 'admin' && (
              <span className="px-2 py-0.5 rounded bg-accent-500/10 text-accent-600 text-xs font-medium">
                מנהל
              </span>
            )}
            <span className="text-ink-600 text-xs" dir="ltr">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
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
