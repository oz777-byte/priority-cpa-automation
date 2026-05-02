'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { selectCompanyAction } from './companies/actions';

interface Item {
  id: string;
  name: string;
}

export function CompanySwitcher({
  companies,
  currentId,
}: {
  companies: Item[];
  currentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const current = companies.find((c) => c.id === currentId) ?? null;

  function pick(id: string) {
    setOpen(false);
    start(async () => {
      await selectCompanyAction(id);
      router.refresh();
    });
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
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm bg-white hover:bg-ink-50 disabled:opacity-50"
      >
        {current?.name ?? 'בחר חברה'} ▾
      </button>

      {open && (
        <div className="absolute mt-1 left-0 w-56 bg-white border border-ink-200 rounded-lg shadow-md z-10">
          <ul className="py-1 text-sm">
            {companies.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  className={`w-full text-right px-3 py-1.5 hover:bg-ink-50 ${c.id === currentId ? 'font-semibold text-accent-600' : ''}`}
                >
                  {c.name}
                </button>
              </li>
            ))}
            <li className="border-t border-ink-100 mt-1">
              <Link
                href="/dashboard/companies"
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-ink-600 hover:bg-ink-50"
              >
                ניהול חברות
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
