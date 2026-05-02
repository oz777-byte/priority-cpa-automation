'use client';

import { useState, useTransition } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Sparkles,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import {
  addManualTxnAction,
  importCsvAction,
  deleteTxnAction,
  setTxnStatusAction,
  autoMatchAction,
} from './actions';

export type TxnStatus = 'unreconciled' | 'matched' | 'ignored';

export interface BankTxnRow {
  id: string;
  txn_date: string;
  bank_name: string | null;
  bank_account_number: string | null;
  description: string;
  reference: string | null;
  amount_ils: number;
  balance_after: number | null;
  status: TxnStatus;
  source: 'csv' | 'manual' | 'open_banking';
}

const STATUS_LABELS: Record<TxnStatus, { bg: string; text: string; label: string }> = {
  unreconciled: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'לא הותאם' },
  matched: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'הותאם' },
  ignored: { bg: 'bg-ink-200', text: 'text-ink-700', label: 'התעלם' },
};

type Filter = 'all' | TxnStatus;

export function BankPanel({
  rows,
  companyId,
}: {
  rows: BankTxnRow[];
  companyId: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const counts = {
    all: rows.length,
    unreconciled: rows.filter((r) => r.status === 'unreconciled').length,
    matched: rows.filter((r) => r.status === 'matched').length,
    ignored: rows.filter((r) => r.status === 'ignored').length,
  };

  function onCsvImport(formData: FormData) {
    setError(null);
    setInfo(null);
    formData.set('companyId', companyId);
    startTransition(async () => {
      const r = await importCsvAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'ייבוא נכשל');
        return;
      }
      const parts: string[] = [];
      if (r.imported) parts.push(`${r.imported} תנועות נטענו`);
      if (r.duplicates) parts.push(`${r.duplicates} כפילויות דולגו`);
      if (r.rejected) parts.push(`${r.rejected} שורות נפסלו`);
      setInfo(parts.join(' · '));
      setCsvOpen(false);
    });
  }

  function onManualAdd(formData: FormData) {
    setError(null);
    setInfo(null);
    formData.set('companyId', companyId);
    startTransition(async () => {
      const r = await addManualTxnAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'הוספה נכשלה');
        return;
      }
      setManualOpen(false);
      setInfo('התנועה נוספה');
    });
  }

  function onChangeStatus(txn: BankTxnRow, status: TxnStatus) {
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', txn.id);
    fd.set('status', status);
    startTransition(async () => {
      const r = await setTxnStatusAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function onAutoMatch() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    startTransition(async () => {
      const r = await autoMatchAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'התאמה אוטומטית נכשלה');
        return;
      }
      const parts: string[] = [];
      parts.push(`נסרקו ${r.scanned ?? 0} תנועות לא מותאמות`);
      if (r.matched) parts.push(`${r.matched} הותאמו אוטומטית`);
      if (r.ambiguous) parts.push(`${r.ambiguous} עם יותר מ-JE תואם — ידני`);
      if (r.unmatched) parts.push(`${r.unmatched} ללא JE תואם`);
      setInfo(parts.join(' · '));
    });
  }

  function onDelete(txn: BankTxnRow) {
    if (!confirm(`למחוק את התנועה?\n${txn.txn_date} · ${txn.description}`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', txn.id);
    startTransition(async () => {
      const r = await deleteTxnAction(fd);
      if (!r.ok) setError(r.error ?? 'מחיקה נכשלה');
    });
  }

  const columns: Column<BankTxnRow>[] = [
    {
      key: 'txn_date',
      header: 'תאריך',
      dir: 'ltr',
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.txn_date}</span>,
      value: (r) => r.txn_date,
    },
    {
      key: 'description',
      header: 'תיאור',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="text-ink-900">{r.description}</div>
          {r.reference && (
            <div className="text-[11px] text-ink-500 mt-0.5" dir="ltr">
              {r.reference}
            </div>
          )}
        </div>
      ),
      value: (r) => r.description,
    },
    {
      key: 'bank',
      header: 'בנק / חשבון',
      cell: (r) => (
        <div className="text-xs text-ink-600">
          {r.bank_name && <div>{r.bank_name}</div>}
          {r.bank_account_number && <div dir="ltr" className="font-mono">{r.bank_account_number}</div>}
          {!r.bank_name && !r.bank_account_number && '—'}
        </div>
      ),
      value: (r) => `${r.bank_name ?? ''} ${r.bank_account_number ?? ''}`,
    },
    {
      key: 'amount_ils',
      header: 'סכום',
      sortable: true,
      cell: (r) => (
        <span
          className={`tabular-nums font-medium ${
            r.amount_ils < 0 ? 'text-red-700' : 'text-emerald-700'
          }`}
          dir="ltr"
        >
          {r.amount_ils.toLocaleString('he-IL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            signDisplay: 'always',
          })}{' '}
          ₪
        </span>
      ),
      value: (r) => r.amount_ils,
    },
    {
      key: 'balance_after',
      header: 'יתרה',
      sortable: true,
      cell: (r) => (
        <span className="tabular-nums text-ink-600" dir="ltr">
          {r.balance_after !== null
            ? r.balance_after.toLocaleString('he-IL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : '—'}
        </span>
      ),
      value: (r) => r.balance_after ?? 0,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const c = STATUS_LABELS[r.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
            {c.label}
          </span>
        );
      },
      value: (r) => r.status,
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (r) => (
        <div className="flex items-center gap-1.5 justify-end">
          {r.status !== 'matched' && (
            <button
              onClick={() => onChangeStatus(r, 'matched')}
              disabled={pending}
              className="p-1 text-ink-400 hover:text-emerald-600"
              title="סמן כהותאם"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          {r.status !== 'ignored' && (
            <button
              onClick={() => onChangeStatus(r, 'ignored')}
              disabled={pending}
              className="p-1 text-ink-400 hover:text-ink-700"
              title="התעלם"
            >
              <XCircle size={13} />
            </button>
          )}
          {r.status !== 'unreconciled' && (
            <button
              onClick={() => onChangeStatus(r, 'unreconciled')}
              disabled={pending}
              className="p-1 text-ink-400 hover:text-amber-600"
              title="החזר ללא-הותאם"
            >
              <CircleDashed size={13} />
            </button>
          )}
          <button
            onClick={() => onDelete(r)}
            disabled={pending}
            className="p-1 text-ink-400 hover:text-red-600"
            title="מחק"
          >
            <Trash2 size={13} />
          </button>
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

      {csvOpen && <CsvImportForm pending={pending} onSubmit={onCsvImport} onCancel={() => setCsvOpen(false)} />}
      {manualOpen && <ManualAddForm pending={pending} onSubmit={onManualAdd} onCancel={() => setManualOpen(false)} />}

      {/* KPI counters acting as filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'} count={counts.all} label="הכול" onClick={() => setFilter('all')} />
        <FilterChip
          active={filter === 'unreconciled'}
          count={counts.unreconciled}
          label="לא הותאם"
          tone="amber"
          onClick={() => setFilter('unreconciled')}
        />
        <FilterChip
          active={filter === 'matched'}
          count={counts.matched}
          label="הותאם"
          tone="emerald"
          onClick={() => setFilter('matched')}
        />
        <FilterChip
          active={filter === 'ignored'}
          count={counts.ignored}
          label="התעלם"
          tone="ink"
          onClick={() => setFilter('ignored')}
        />
      </div>

      <DataTable<BankTxnRow>
        rows={filtered}
        columns={columns}
        searchKeys={['description', 'bank']}
        searchPlaceholder="חיפוש תיאור / בנק..."
        defaultSort={{ key: 'txn_date', direction: 'desc' }}
        toolbarStart={
          !csvOpen && !manualOpen ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCsvOpen(true)}
                className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
              >
                <Upload size={14} />
                ייבוא CSV
              </button>
              <button
                onClick={() => setManualOpen(true)}
                className="px-3 py-2 border border-ink-200 text-ink-700 rounded-lg text-sm hover:bg-ink-50 flex items-center gap-1.5"
              >
                <Plus size={14} />
                תנועה ידנית
              </button>
              {counts.unreconciled > 0 && (
                <button
                  onClick={onAutoMatch}
                  disabled={pending}
                  className="px-3 py-2 border border-accent-200 text-accent-700 rounded-lg text-sm hover:bg-accent-50 disabled:opacity-50 flex items-center gap-1.5"
                  title="חיפוש אוטומטי של JE תואם לכל תנועה לא מותאמת"
                >
                  {pending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  התאמה אוטומטית ({counts.unreconciled})
                </button>
              )}
            </div>
          ) : null
        }
        empty={
          <div className="text-center py-6 space-y-2">
            <div className="text-sm text-ink-600">
              עדיין אין תנועות בנק.
            </div>
            <div className="text-xs text-ink-500">
              ייבוא CSV מבנק / כרטיס אשראי, או הזנה ידנית של עמלה / ריבית.
            </div>
          </div>
        }
      />
    </div>
  );
}

function FilterChip({
  active,
  count,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  tone?: 'amber' | 'emerald' | 'ink';
  onClick: () => void;
}) {
  const activeCls = active
    ? tone === 'amber'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : tone === 'ink'
          ? 'bg-ink-100 text-ink-800 border-ink-300'
          : 'bg-ink-900 text-white border-ink-900'
    : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1.5 ${activeCls}`}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function CsvImportForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">ייבוא דף עו"ש מ-CSV</h3>
        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
          תומך בפורמטים נפוצים: <code dir="ltr">תאריך, תיאור, סכום [, יתרה]</code>{' '}
          או <code dir="ltr">תאריך, תיאור, חובה, זכות, יתרה</code>. שורת כותרת
          מזוהה אוטומטית.
        </p>
      </div>
      <form action={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field name="bank_name" label="שם הבנק (אופציונלי)" placeholder="לדוגמה: הפועלים" />
          <Field
            name="bank_account_number"
            label="מס׳ חשבון (אופציונלי)"
            placeholder="לדוגמה: 12-345-6789"
            dir="ltr"
            monospace
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1">
            קובץ CSV<span className="text-red-500 mr-1">*</span>
          </label>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-ink-200 file:bg-ink-50 file:text-ink-700 hover:file:bg-ink-100"
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
            type="submit"
            disabled={pending}
            className="px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {pending ? 'מייבא...' : 'ייבא'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ManualAddForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink-900">תנועה ידנית</h3>
      <form action={onSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field name="txn_date" label="תאריך" type="date" defaultValue={today} dir="ltr" required />
        <Field name="description" label="תיאור" placeholder='לדוגמה: עמלת ניהול' required />
        <Field
          name="amount_ils"
          label="סכום (שלילי = יציאה)"
          type="number"
          step="0.01"
          placeholder="-25.00"
          dir="ltr"
          required
        />
        <Field name="bank_name" label="בנק" placeholder='לדוגמה: הפועלים' />
        <Field name="bank_account_number" label="מס׳ חשבון" dir="ltr" monospace />
        <Field name="reference" label="אסמכתא (אופציונלי)" placeholder="מס׳ צ׳ק / חשבונית" dir="ltr" />
        <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
          >
            {pending ? 'שומר...' : 'הוסף תנועה'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type,
  step,
  dir,
  monospace,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  type?: string | undefined;
  step?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  monospace?: boolean | undefined;
  required?: boolean | undefined;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        type={type}
        step={step}
        dir={dir}
        required={required}
        className={`w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 ${
          monospace ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}
