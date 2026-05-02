'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Building2, ChevronDown } from 'lucide-react';

interface Item {
  id: string;
  name: string;
}

const COMPANY_PATH_RE = /^\/dashboard\/c\/([^/]+)/;

export function CompanySwitcher({ companies }: { companies: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Detect current company from URL
  const match = pathname.match(COMPANY_PATH_RE);
  const currentId = match?.[1] ?? null;
  const current = companies.find((c) => c.id === currentId) ?? null;

  function pick(id: string) {
    setOpen(false);
    router.push(`/dashboard/c/${id}`);
  }

  if (companies.length === 0) {
    return (
      <Link
        href="/dashboard/companies"
        className="text-sm text-accent-600 hover:underline"
      >
        + הוסף חברה ראשונה
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm bg-white hover:bg-ink-50 flex items-center gap-1.5 transition"
      >
        <Building2 size={13} className="text-brand-500" />
        <span className="max-w-[180px] truncate">
          {current?.name ?? 'בחר חברה'}
        </span>
        <ChevronDown size={13} className="text-ink-400" />
      </button>

      {open && (
        <div className="absolute mt-1 left-0 w-64 bg-white border border-ink-200 rounded-lg shadow-md z-10 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
            עבור לחברה
          </div>
          <ul className="py-1 text-sm">
            {companies.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  className={`w-full text-right px-3 py-1.5 hover:bg-ink-50 flex items-center gap-2 ${
                    c.id === currentId ? 'font-semibold text-accent-600 bg-accent-500/5' : ''
                  }`}
                >
                  <Building2 size={12} className="text-ink-400" />
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-ink-100 mt-1">
              <Link
                href="/dashboard/companies"
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-ink-600 hover:bg-ink-50"
              >
                ניהול חברות ←
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
