'use client';

import { useState, useTransition } from 'react';
import { Lock, Unlock, AlertTriangle, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { lockPeriodAction, reopenPeriodAction } from './actions';

export type PeriodStatus = 'open' | 'locked' | 'closed';

export interface PeriodRow {
  id: string; // synthetic — `${year}-${month}` for DataTable key
  year: number;
  month: number;
  status: PeriodStatus;
  jeCount: number;
  total_debit: number;
  total_credit: number;
  lockedAt: string | null;
}

const STATUS: Record<PeriodStatus, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'פתוחה' },
  locked: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'נעולה' },
  closed: { bg: 'bg-ink-200', text: 'text-ink-700', label: 'סגורה' },
};

const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function PeriodsPanel({
  rows,
  companyId,
}: {
  rows: PeriodRow[];
  companyId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [lockingPeriod, setLockingPeriod] = useState<PeriodRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onLock(row: PeriodRow, notes: string) {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('year', String(row.year));
    fd.set('month', String(row.month));
    if (notes) fd.set('notes', notes);
    startTransition(async () => {
      const r = await lockPeriodAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'נעילה נכשלה');
        return;
      }
      setLockingPeriod(null);
      setInfo(`התקופה ${MONTH_NAMES[row.month]} ${row.year} ננעלה`);
    });
  }

  function onReopen(row: PeriodRow) {
    if (
      !confirm(
        `לפתוח מחדש את התקופה ${MONTH_NAMES[row.month]} ${row.year}?\n\n` +
          `הפעולה תאפשר רישום JE חדש או עריכת קיים בחודש הזה. ` +
          `מומלץ לעשות זאת רק אם נדרש תיקון מהותי.`,
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('year', String(row.year));
    fd.set('month', String(row.month));
    startTransition(async () => {
      const r = await reopenPeriodAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'פתיחה מחדש נכשלה');
        return;
      }
      setInfo(`התקופה ${MONTH_NAMES[row.month]} ${row.year} נפתחה מחדש`);
    });
  }

  const fmt = (n: number): string =>
    n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns: Column<PeriodRow>[] = [
    {
      key: 'period',
      header: 'תקופה',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 font-medium" dir="ltr">
          {String(r.month).padStart(2, '0')}/{r.year}
        </span>
      ),
      value: (r) => r.year * 100 + r.month,
    },
    {
      key: 'month_name',
      header: 'חודש',
      cell: (r) => <span className="text-ink-700">{MONTH_NAMES[r.month]} {r.year}</span>,
      value: (r) => MONTH_NAMES[r.month] ?? '',
    },
    {
      key: 'jeCount',
      header: 'פקודות יומן',
      sortable: true,
      cell: (r) => <span className="text-ink-900 tabular-nums">{r.jeCount}</span>,
      value: (r) => r.jeCount,
    },
    {
      key: 'total',
      header: 'סך תנועה',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-700 tabular-nums" dir="ltr">
          {fmt(r.total_debit)} ₪
        </span>
      ),
      value: (r) => r.total_debit,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const s = STATUS[r.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      },
      value: (r) => r.status,
    },
    {
      key: 'lockedAt',
      header: 'ננעל ב',
      dir: 'ltr',
      cell: (r) => (
        <span className="text-ink-500 text-xs">
          {r.lockedAt ? r.lockedAt.slice(0, 10) : '—'}
        </span>
      ),
      value: (r) => r.lockedAt ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (r) => (
        <div className="flex items-center gap-2 justify-end">
          {r.status === 'open' && (
            <button
              onClick={() => setLockingPeriod(r)}
              disabled={pending}
              className="px-2 py-1 text-xs border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-md flex items-center gap-1"
            >
              <Lock size={12} />
              נעל
            </button>
          )}
          {r.status === 'locked' && (
            <button
              onClick={() => onReopen(r)}
              disabled={pending}
              className="px-2 py-1 text-xs border border-ink-300 text-ink-700 hover:bg-ink-50 rounded-md flex items-center gap-1"
            >
              <Unlock size={12} />
              פתח מחדש
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
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

      {lockingPeriod && (
        <LockModal
          period={lockingPeriod}
          pending={pending}
          onConfirm={(notes) => onLock(lockingPeriod, notes)}
          onCancel={() => setLockingPeriod(null)}
        />
      )}

      <DataTable<PeriodRow>
        rows={rows}
        columns={columns}
        defaultSort={{ key: 'period', direction: 'desc' }}
        empty={
          <div className="text-center py-4 text-sm text-ink-600">
            עדיין אין תקופות חשבונאיות. תקופות נוצרות אוטומטית עם פקודת היומן הראשונה בכל חודש.
          </div>
        }
      />
    </div>
  );
}

function LockModal({
  period,
  pending,
  onConfirm,
  onCancel,
}: {
  period: PeriodRow;
  pending: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-ink-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Lock size={14} className="text-amber-600" />
              נעילת תקופה — {MONTH_NAMES[period.month]} {period.year}
            </h3>
            <p className="text-xs text-ink-500 mt-1">
              לאחר הנעילה לא ניתן יהיה לרשום JE חדש או לערוך קיים בחודש הזה.
              הפעולה הפיכה (ניתן לפתוח מחדש), אבל מומלץ רק אחרי דיווח 874.
            </p>
          </div>
          <button onClick={onCancel} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>{period.jeCount} פקודות יומן</strong> בתקופה זו ינעלו לעריכה.
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1">
            הערות (אופציונלי)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='לדוגמה: נסגר אחרי דיווח מע"מ ל-874'
            rows={3}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notes)}
            disabled={pending}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Lock size={13} />
            {pending ? 'נועל...' : 'נעל תקופה'}
          </button>
        </div>
      </div>
    </div>
  );
}
