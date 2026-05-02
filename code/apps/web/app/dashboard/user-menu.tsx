'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  User as UserIcon,
  Settings,
  Users,
  Shield,
  FileText,
  LogOut,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function UserMenu({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function logout() {
    setOpen(false);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ink-100 transition"
      >
        <div className="w-7 h-7 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <ChevronDown size={14} className="text-ink-600" />
      </button>

      {open && (
        <div className="absolute mt-2 left-0 w-64 bg-white border border-ink-200 rounded-lg shadow-lg z-20 py-1.5 text-sm">
          <div className="px-3 py-2 border-b border-ink-100">
            <div className="text-xs text-ink-400">מחובר כ</div>
            <div className="font-medium text-ink-900 text-xs" dir="ltr">{email}</div>
            {isAdmin && (
              <div className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 font-medium">
                מנהל מערכת
              </div>
            )}
          </div>

          <Section title="חשבון">
            <MenuItem href="/dashboard/settings" icon={Settings} onClick={() => setOpen(false)}>
              הגדרות חשבון
            </MenuItem>
          </Section>

          {isAdmin && (
            <Section title="ניהול">
              <MenuItem href="/dashboard/admin/users" icon={Users} onClick={() => setOpen(false)}>
                משתמשי המערכת
              </MenuItem>
            </Section>
          )}

          <Section title="עזרה ומידע">
            <MenuItem href="/dashboard/help" icon={FileText} onClick={() => setOpen(false)}>
              מדריך הפעלה
            </MenuItem>
            <MenuItem href="/privacy" icon={Shield} onClick={() => setOpen(false)} target="_blank">
              מדיניות פרטיות
            </MenuItem>
            <MenuItem href="/terms" icon={FileText} onClick={() => setOpen(false)} target="_blank">
              תנאי שימוש
            </MenuItem>
          </Section>

          <div className="border-t border-ink-100 mt-1 pt-1">
            <button
              onClick={logout}
              className="w-full text-right flex items-center gap-2 px-3 py-2 text-red-700 hover:bg-red-50 transition"
            >
              <LogOut size={14} />
              יציאה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-0.5 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}

function MenuItem({
  href,
  icon: Icon,
  onClick,
  target,
  children,
}: {
  href: string;
  icon: typeof UserIcon;
  onClick?: (() => void) | undefined;
  target?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick ?? (() => {})}
      {...(target ? { target } : {})}
      className="flex items-center gap-2 px-3 py-1.5 text-ink-800 hover:bg-ink-50 transition"
    >
      <Icon size={14} className="text-ink-400" />
      {children}
    </Link>
  );
}
