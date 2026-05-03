'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { bulkMarkInvoicesReviewedAction, unmarkInvoiceReviewedAction } from './bulk-actions';

export type InvoiceStatus = 'pass' | 'warn' | 'fail' | 'approved' | 'exported';

export interface InvoiceListRow {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  totalIls: number;
  status: InvoiceStatus;
  reviewedAt: string | null;
}

const STATUS_LABELS: Record<InvoiceStatus, { bg: string; text: string; label: string }> = {
  pass: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'מוכן' },
  warn: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'בדיקה' },
  fail: { bg: 'bg-red-100', text: 'text-red-800', label: 'חסום' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'אושר' },
  exported: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'יוצא' },
};

export function InvoicesTable({
  rows,
  companyId,
  emptyState,
}: {
  rows: InvoiceListRow[];
  companyId: string;
  emptyState?: React.ReactNode;
}) {
  const [showReviewed, setShowReviewed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showReviewed && r.reviewedAt) return false;
      if (!q) return true;
      return (
        r.supplierName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q)
      );
    });
  }, [rows, search, showReviewed]);

  const reviewableSelected = Array.from(selected).filter((id) => {
    const row = rows.find((r) => r.id === id);
    return row && !row.reviewedAt && (row.status === 'pass' || row.status === 'warn');
  });

  const reviewedCount = rows.filter((r) => r.reviewedAt).length;

  function toggleAll(): void {
    const allReviewableInView = filtered
      .filter((r) => !r.reviewedAt && (r.status === 'pass' || r.status === 'warn'))
      .map((r) => r.id);
    if (allReviewableInView.every((id) => selected.has(id))) {
      // All selected — clear
      setSelected(new Set());
    } else {
      setSelected(new Set(allReviewableInView));
    }
  }

  function toggleOne(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function bulkApprove(): void {
    if (reviewableSelected.length === 0) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await bulkMarkInvoicesReviewedAction({
        companyId,
        invoiceIds: reviewableSelected,
      });
      if (!r.ok) {
        setError(r.error ?? 'סימון נכשל');
        return;
      }
      setSelected(new Set());
      setInfo(`${r.marked ?? 0} חשבוניות סומנו כנבדקות.`);
    });
  }

  function unmarkOne(id: string): void {
    setError(null);
    startTransition(async () => {
      const r = await unmarkInvoiceReviewedAction({ companyId, invoiceId: id });
      if (!r.ok) setError(r.error ?? 'שחרור סימון נכשל');
    });
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          {info}
        </div>
      )}

      <div className="bg-white border border-ink-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי ספק או מס׳ חשבונית..."
          className="px-3 py-2 border border-ink-200 rounded-lg text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="button"
          onClick={() => setShowReviewed((v) => !v)}
          className="px-3 py-2 text-xs text-ink-700 border border-ink-200 hover:bg-ink-50 rounded-lg flex items-center gap-1.5"
          title={showReviewed ? 'הסתר נבדקים' : 'הצג גם נבדקים'}
        >
          {showReviewed ? <EyeOff size={13} /> : <Eye size={13} />}
          {showReviewed ? 'הסתר נבדקים' : `הצג נבדקים (${reviewedCount})`}
        </button>
        {reviewableSelected.length > 0 && (
          <button
            type="button"
            onClick={bulkApprove}
            disabled={pending}
            className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            {pending ? 'מסמן...' : `סמן ${reviewableSelected.length} כנבדקים`}
          </button>
        )}
        <span className="text-xs text-ink-500 mr-auto">
          {filtered.length} מוצגות / {rows.length} סה״כ
          {reviewedCount > 0 && !showReviewed && ` (${reviewedCount} נבדקו, מוסתרות)`}
        </span>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 border-b border-ink-200">
            <tr>
              <th className="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  onChange={toggleAll}
                  checked={
                    filtered
                      .filter((r) => !r.reviewedAt && (r.status === 'pass' || r.status === 'warn'))
                      .length > 0 &&
                    filtered
                      .filter((r) => !r.reviewedAt && (r.status === 'pass' || r.status === 'warn'))
                      .every((r) => selected.has(r.id))
                  }
                  title="בחר את כל הנבדקים"
                />
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                ספק
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                מס׳ חשבונית
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                תאריך
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                סכום
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                סטטוס
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-500">
                  לא נמצאו חשבוניות תואמות.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const c = STATUS_LABELS[r.status];
                const reviewable = !r.reviewedAt && (r.status === 'pass' || r.status === 'warn');
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-ink-100 last:border-0 hover:bg-ink-50/40 ${
                      r.reviewedAt ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      {reviewable ? (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : r.reviewedAt ? (
                        <button
                          type="button"
                          onClick={() => unmarkOne(r.id)}
                          disabled={pending}
                          title="בטל סימון נבדק"
                          className="text-emerald-600 hover:text-amber-600"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      ) : (
                        <span className="text-ink-300 text-xs">—</span>
                      )}
                    </td>
                    <RowLink href={`/dashboard/c/${companyId}/invoices/${r.id}`} content={r.supplierName} className="text-ink-900" />
                    <RowLink href={`/dashboard/c/${companyId}/invoices/${r.id}`} content={r.invoiceNumber} className="text-ink-700 font-mono" dir="ltr" />
                    <RowLink href={`/dashboard/c/${companyId}/invoices/${r.id}`} content={r.date} className="text-ink-700" dir="ltr" />
                    <RowLink
                      href={`/dashboard/c/${companyId}/invoices/${r.id}`}
                      content={`${r.totalIls.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`}
                      className="text-ink-900 font-medium"
                    />
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
                          {c.label}
                        </span>
                        {r.reviewedAt && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center gap-1">
                            <CheckCircle2 size={10} />
                            נבדק
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowLink({
  href,
  content,
  className,
  dir,
}: {
  href: string;
  content: string;
  className?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <td className="px-3 py-2">
      <Link href={href} className="block hover:underline">
        <span className={className} {...(dir ? { dir } : {})}>
          {content}
        </span>
      </Link>
    </td>
  );
}

