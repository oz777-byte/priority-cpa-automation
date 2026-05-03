'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Scale,
  BookText,
  TrendingUp,
  Building2,
  Receipt,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  slug: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { slug: '', label: 'מאזן בוחן', icon: Scale },
  { slug: '/general-ledger', label: 'כרטסת חשבון', icon: BookText },
  { slug: '/profit-loss', label: 'רווח והפסד', icon: TrendingUp },
  { slug: '/balance-sheet', label: 'מאזן', icon: Building2 },
  { slug: '/vat', label: 'מע"מ', icon: Receipt },
];

export function ReportsTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname() ?? '';
  const base = `/dashboard/c/${companyId}/reports`;

  return (
    <nav className="bg-white border border-ink-200 rounded-xl p-1 flex flex-wrap gap-1 print:hidden">
      {TABS.map((tab) => {
        const href = `${base}${tab.slug}`;
        const active =
          tab.slug === ''
            ? pathname === base
            : pathname.startsWith(href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              active
                ? 'bg-accent-500/10 text-accent-700'
                : 'text-ink-700 hover:bg-ink-50'
            }`}
          >
            <Icon size={13} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
