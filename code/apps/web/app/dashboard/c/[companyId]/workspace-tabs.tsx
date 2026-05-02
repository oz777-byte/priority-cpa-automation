'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  FileEdit,
  Users,
  GitBranch,
  History,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function WorkspaceTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname() ?? '';
  const base = `/dashboard/c/${companyId}`;

  const tabs: Tab[] = [
    { href: base, label: 'סקירה', icon: LayoutDashboard },
    { href: `${base}/invoices`, label: 'חשבוניות', icon: Inbox },
    { href: `${base}/journal-entries`, label: 'פקודות יומן', icon: FileEdit },
    { href: `${base}/suppliers`, label: 'ספקים', icon: Users },
    { href: `${base}/account-mapping`, label: 'מיפוי חשבונות', icon: GitBranch },
    { href: `${base}/exports`, label: 'היסטוריית ייצוא', icon: History },
    { href: `${base}/reports`, label: 'דוחות', icon: BarChart3 },
    { href: `${base}/settings`, label: 'הגדרות חברה', icon: Settings },
  ];

  return (
    <nav className="flex items-center border-b border-ink-100 px-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive =
          tab.href === base
            ? pathname === base
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm border-b-2 transition flex items-center gap-1.5 -mb-px whitespace-nowrap ${
              isActive
                ? 'text-accent-600 border-accent-500 font-medium'
                : 'text-ink-600 border-transparent hover:text-ink-900 hover:border-ink-300'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
