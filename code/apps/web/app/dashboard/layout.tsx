import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  listCompaniesForUser,
  getCurrentCompany,
} from '@/lib/current-company';
import { LogoutButton } from './logout-button';
import { CompanySwitcher } from './company-switcher';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const companies = await listCompaniesForUser(user.id, user.email);
  const current = await getCurrentCompany(user.id, user.email);

  return (
    <div className="min-h-screen flex flex-col bg-ink-50">
      <header className="bg-white border-b border-ink-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-ink-900">
            Priority CPA
          </Link>
          <nav className="flex gap-4 text-sm text-ink-600">
            <Link href="/dashboard" className="hover:text-ink-900">
              ראשי
            </Link>
            <Link href="/dashboard/invoices" className="hover:text-ink-900">
              חשבוניות
            </Link>
            <Link href="/dashboard/companies" className="hover:text-ink-900">
              חברות
            </Link>
            <Link href="/dashboard/settings" className="hover:text-ink-900">
              הגדרות
            </Link>
            {user.role === 'admin' && (
              <Link href="/dashboard/admin/users" className="hover:text-ink-900">
                ניהול משתמשים
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <CompanySwitcher
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            currentId={current?.id ?? null}
          />
          {user.role === 'admin' && (
            <span className="px-2 py-0.5 rounded bg-accent-500/10 text-accent-600 text-xs">
              מנהל
            </span>
          )}
          <span className="text-ink-600" dir="ltr">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
