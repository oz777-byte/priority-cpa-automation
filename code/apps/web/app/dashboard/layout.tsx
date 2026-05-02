import { requireUser } from '@/lib/auth';
import { listCompaniesForUser } from '@/lib/current-company';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const companies = await listCompaniesForUser(user.id, user.email);

  return (
    <div className="min-h-screen flex bg-ink-50" dir="rtl">
      <Sidebar
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        email={user.email}
        isAdmin={user.role === 'admin'}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
        <footer className="border-t border-ink-200 px-6 py-3 text-xs text-ink-400 text-center">
          Priority CPA Automation · נבנה ע״י{' '}
          <span className="font-semibold text-ink-600">O.S Tech Ventures</span>
        </footer>
      </div>
    </div>
  );
}
