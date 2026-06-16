'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  HelpCircle,
  ChevronDown,
  ChevronLeft,
  Inbox,
  FileEdit,
  FileSignature,
  Users,
  UserCircle,
  Package,
  ListTree,
  Briefcase,
  GitBranch,
  History,
  FileInput,
  Calendar,
  BarChart3,
  Settings,
  Wallet,
  Truck,
  BookOpen,
  Shield,
  FileText,
  LogOut,
  User as UserIcon,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { BrandLogo } from './brand-logo';

interface Company {
  id: string;
  name: string;
}

interface Tab {
  slug: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

const COMPANY_TABS: Tab[] = [
  { slug: '', label: 'סקירה', icon: LayoutDashboard },
  { slug: '/invoices', label: 'חשבוניות ספק', icon: Inbox },
  { slug: '/sales-invoices', label: 'חשבוניות מכירה', icon: FileSignature },
  { slug: '/journal-entries', label: 'פקודות יומן', icon: FileEdit },
  { slug: '/bank-reconciliation', label: 'התאמות בנק ואשראי', icon: Wallet },
  { slug: '/payroll', label: 'משכורות', icon: Briefcase },
  { slug: '/suppliers', label: 'ספקים', icon: Users },
  { slug: '/customers', label: 'לקוחות', icon: UserCircle },
  { slug: '/items', label: 'פריטים', icon: Package },
  { slug: '/accounts', label: 'תרשים חשבונות', icon: ListTree },
  { slug: '/account-mapping', label: 'מיפוי חשבונות', icon: GitBranch },
  { slug: '/assets', label: 'נכסי קבע ופחת', icon: Truck },
  { slug: '/periods', label: 'תקופות חשבונאיות', icon: Calendar },
  { slug: '/pcn874', label: 'דיווח PCN874', icon: FileText },
  { slug: '/ardeni', label: 'ייבוא מבנה אחיד', icon: FileInput },
  { slug: '/exports', label: 'היסטוריית ייצוא', icon: History },
  { slug: '/reports', label: 'דוחות', icon: BarChart3 },
  { slug: '/settings', label: 'הגדרות חברה', icon: Settings },
];

export function Sidebar({
  companies,
  email,
  isAdmin,
}: {
  companies: Company[];
  email: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const currentCompanyMatch = pathname.match(/^\/dashboard\/c\/([^/]+)/);
  const currentCompanyId = currentCompanyMatch?.[1] ?? null;

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(currentCompanyId ? [currentCompanyId] : []),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-64 bg-white border-l border-ink-200 flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Brand */}
      <div className="p-4 border-b border-ink-100 flex-shrink-0">
        <Link href="/dashboard">
          <BrandLogo size="sm" />
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <NavItem
          href="/dashboard"
          icon={LayoutDashboard}
          active={pathname === '/dashboard'}
        >
          לוח בקרה ראשי
        </NavItem>
        <NavItem
          href="/dashboard/companies"
          icon={Building2}
          active={pathname.startsWith('/dashboard/companies')}
        >
          ניהול חברות
        </NavItem>

        {companies.length > 0 && (
          <div className="pt-5">
            <SectionHeader>תיקי לקוחות</SectionHeader>
            <div className="space-y-0.5">
              {companies.map((c) => (
                <CompanyExpander
                  key={c.id}
                  company={c}
                  pathname={pathname}
                  expanded={expanded.has(c.id)}
                  onToggle={() => toggle(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="pt-5">
          <SectionHeader>עזרה ומידע</SectionHeader>
          <NavItem
            href="/dashboard/help"
            icon={HelpCircle}
            active={pathname.startsWith('/dashboard/help')}
          >
            מדריך הפעלה
          </NavItem>
          <NavItem
            href="/dashboard/accounting-rules"
            icon={BookOpen}
            active={pathname.startsWith('/dashboard/accounting-rules')}
          >
            חוקי הנהלת חשבונות
          </NavItem>
          <NavItem
            href="/privacy"
            icon={Shield}
            active={false}
            external
          >
            מדיניות פרטיות
          </NavItem>
          <NavItem
            href="/terms"
            icon={FileText}
            active={false}
            external
          >
            תנאי שימוש
          </NavItem>
        </div>
      </nav>

      {/* User block */}
      <div className="border-t border-ink-100 p-3 flex-shrink-0">
        <UserBlock
          email={email}
          isAdmin={isAdmin}
          pathname={pathname}
          onLogout={logout}
        />
      </div>
    </aside>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
      {children}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  active,
  children,
  external,
  indent,
  comingSoon,
}: {
  href: string;
  icon: LucideIcon;
  active: boolean;
  children: React.ReactNode;
  external?: boolean;
  indent?: boolean;
  comingSoon?: boolean;
}) {
  const cls = `flex items-center gap-2 px-3 py-1.5 rounded text-sm transition ${
    active
      ? 'bg-accent-500/10 text-accent-600 font-medium'
      : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900'
  } ${indent ? 'mr-3' : ''}`;

  const target = external ? { target: '_blank', rel: 'noreferrer' } : {};

  return (
    <Link href={href} {...target} className={cls}>
      <Icon size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{children}</span>
      {comingSoon && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
          בקרוב
        </span>
      )}
    </Link>
  );
}

function CompanyExpander({
  company,
  pathname,
  expanded,
  onToggle,
}: {
  company: Company;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const base = `/dashboard/c/${company.id}`;
  const isActive = pathname.startsWith(base);

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm transition ${
          isActive
            ? 'bg-brand-500/10 text-brand-500 font-medium'
            : 'text-ink-700 hover:bg-ink-50'
        }`}
      >
        <Building2 size={14} className="flex-shrink-0" />
        <span className="flex-1 text-right truncate">{company.name}</span>
        {expanded ? (
          <ChevronDown size={14} className="flex-shrink-0" />
        ) : (
          <ChevronLeft size={14} className="flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mr-2 mt-0.5 pr-2 border-r border-ink-100">
          {COMPANY_TABS.map((tab) => {
            const href = `${base}${tab.slug}`;
            const tabActive =
              tab.slug === ''
                ? pathname === base
                : pathname.startsWith(href);
            return (
              <NavItem
                key={tab.slug}
                href={href}
                icon={tab.icon}
                active={tabActive}
                comingSoon={tab.comingSoon ?? false}
              >
                {tab.label}
              </NavItem>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserBlock({
  email,
  isAdmin,
  pathname,
  onLogout,
}: {
  email: string;
  isAdmin: boolean;
  pathname: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 p-2 rounded hover:bg-ink-50 transition"
      >
        <div className="w-8 h-8 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 text-right min-w-0">
          <div className="text-xs text-ink-900 truncate" dir="ltr">{email}</div>
          {isAdmin && (
            <div className="text-[9px] text-brand-500 font-medium">מנהל מערכת</div>
          )}
        </div>
        <ChevronDown size={14} className={`text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-ink-200 rounded-lg shadow-lg py-1 text-sm z-10">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2 px-3 py-1.5 hover:bg-ink-50 ${
              pathname.startsWith('/dashboard/settings') ? 'bg-accent-500/10 text-accent-600' : 'text-ink-800'
            }`}
          >
            <UserIcon size={13} />
            הגדרות חשבון
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/admin/users"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-ink-50 ${
                pathname === '/dashboard/admin/users' ? 'bg-accent-500/10 text-accent-600' : 'text-ink-800'
              }`}
            >
              <Users size={13} />
              משתמשי המערכת
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/admin/rule-notes"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-ink-50 ${
                pathname === '/dashboard/admin/rule-notes' ? 'bg-accent-500/10 text-accent-600' : 'text-ink-800'
              }`}
            >
              <BookOpen size={13} />
              הערות שיפור חוקים
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/admin/ocr-quality"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-ink-50 ${
                pathname === '/dashboard/admin/ocr-quality' ? 'bg-accent-500/10 text-accent-600' : 'text-ink-800'
              }`}
            >
              <FileText size={13} />
              איכות OCR
            </Link>
          )}
          <div className="border-t border-ink-100 my-1" />
          <button
            onClick={onLogout}
            className="w-full text-right flex items-center gap-2 px-3 py-1.5 text-red-700 hover:bg-red-50 transition"
          >
            <LogOut size={13} />
            יציאה
          </button>
        </div>
      )}
    </div>
  );
}

export function AddCompanyButton() {
  return (
    <Link
      href="/dashboard/companies"
      className="flex items-center gap-1.5 px-3 py-1 mt-1 mr-3 text-xs text-accent-600 hover:bg-ink-50 rounded transition"
    >
      <Plus size={12} />
      הוסף חברה חדשה
    </Link>
  );
}
