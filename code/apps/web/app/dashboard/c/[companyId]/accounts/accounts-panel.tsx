'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X, Lock } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertAccountAction, deleteAccountAction } from './actions';

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_account_id: string | null;
  parent_code: string | null;
  is_active: boolean;
  is_system: boolean;
  notes: string | null;
}

const TYPE_LABELS: Record<AccountType, { label: string; bg: string; text: string }> = {
  asset: { label: 'נכס', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  liability: { label: 'התחייבות', bg: 'bg-amber-100', text: 'text-amber-800' },
  income: { label: 'הכנסה', bg: 'bg-blue-100', text: 'text-blue-800' },
  expense: { label: 'הוצאה', bg: 'bg-purple-100', text: 'text-purple-800' },
  equity: { label: 'הון', bg: 'bg-indigo-100', text: 'text-indigo-800' },
};

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: AccountRow };

type Filter = 'all' | AccountType;

export function AccountsPanel({
  rows,
  companyId,
}: {
  rows: AccountRow[];
  companyId: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.type === filter);

  const counts = {
    all: rows.length,
    asset: rows.filter((r) => r.type === 'asset').length,
    liability: rows.filter((r) => r.type === 'liability').length,
    income: rows.filter((r) => r.type === 'income').length,
    expense: rows.filter((r) => r.type === 'expense').length,
    equity: rows.filter((r) => r.type === 'equity').length,
  };

  function onSubmit(formData: FormData) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await upsertAccountAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'החשבון נוסף' : 'החשבון עודכן');
    });
  }

  function onDelete(row: AccountRow) {
    if (row.is_system) {
      alert('חשבונות מערכת לא ניתנים למחיקה. סמן כלא-פעיל אם אינך משתמש בו.');
      return;
    }
    if (!confirm(`למחוק את החשבון ${row.code} — ${row.name}?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deleteAccountAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('החשבון נמחק');
    });
  }

  const columns: Column<AccountRow>[] = [
    {
      key: 'code',
      header: 'קוד',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-900 font-medium">{r.code}</span>,
      value: (r) => r.code,
    },
    {
      key: 'name',
      header: 'שם',
      sortable: true,
      cell: (r) => (
        <div>
          <span className={r.is_active ? 'text-ink-900' : 'text-ink-500 line-through'}>
            {r.name}
          </span>
          {r.is_system && (
            <Lock size={11} className="inline-block mr-2 text-ink-400" aria-label="מערכת" />
          )}
        </div>
      ),
      value: (r) => r.name,
    },
    {
      key: 'type',
      header: 'סוג',
      sortable: true,
      cell: (r) => {
        const t = TYPE_LABELS[r.type];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${t.bg} ${t.text}`}>
            {t.label}
          </span>
        );
      },
      value: (r) => r.type,
    },
    {
      key: 'parent_code',
      header: 'חשבון אב',
      dir: 'ltr',
      monospace: true,
      cell: (r) => <span className="text-ink-600 text-xs">{r.parent_code ?? '—'}</span>,
      value: (r) => r.parent_code ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setEdit({ mode: 'edit', row: r })}
            disabled={pending}
            className="text-ink-600 hover:text-accent-600 disabled:opacity-50"
          >
            <Pencil size={14} />
          </button>
          {!r.is_system && (
            <button
              onClick={() => onDelete(r)}
              disabled={pending}
              className="text-ink-600 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} />
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

      {edit.mode !== 'closed' && (
        <AccountForm
          companyId={companyId}
          parents={rows}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'} count={counts.all} label="הכול" onClick={() => setFilter('all')} />
        <FilterChip active={filter === 'asset'} count={counts.asset} label="נכסים" tone="emerald" onClick={() => setFilter('asset')} />
        <FilterChip active={filter === 'liability'} count={counts.liability} label="התחייבויות" tone="amber" onClick={() => setFilter('liability')} />
        <FilterChip active={filter === 'income'} count={counts.income} label="הכנסות" tone="blue" onClick={() => setFilter('income')} />
        <FilterChip active={filter === 'expense'} count={counts.expense} label="הוצאות" tone="purple" onClick={() => setFilter('expense')} />
        <FilterChip active={filter === 'equity'} count={counts.equity} label="הון" tone="indigo" onClick={() => setFilter('equity')} />
      </div>

      <DataTable<AccountRow>
        rows={filtered}
        columns={columns}
        searchKeys={['code', 'name']}
        searchPlaceholder='חיפוש לפי קוד או שם...'
        defaultSort={{ key: 'code', direction: 'asc' }}
        toolbarStart={
          edit.mode === 'closed' ? (
            <button
              onClick={() => setEdit({ mode: 'create' })}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
            >
              <Plus size={14} />
              חשבון חדש
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-4 text-sm text-ink-600">
            אין חשבונות בקטגוריה זו.
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
  tone?: 'emerald' | 'amber' | 'blue' | 'purple' | 'indigo';
  onClick: () => void;
}) {
  const activeCls = active
    ? tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : tone === 'blue'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : tone === 'purple'
            ? 'bg-purple-50 text-purple-800 border-purple-200'
            : tone === 'indigo'
              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
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

function AccountForm({
  companyId,
  parents,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  parents: AccountRow[];
  initial: AccountRow | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const isEdit = initial !== null;
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">
            {isEdit ? 'עריכת חשבון' : 'חשבון חדש'}
          </h3>
          {initial?.is_system && (
            <p className="text-[11px] text-ink-500 mt-0.5">
              זהו חשבון מערכת בסיסי — שדה הסוג ננעל לעריכה.
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-ink-400 hover:text-ink-700">
          <X size={16} />
        </button>
      </div>

      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="hidden" name="companyId" value={companyId} />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <Field
          name="code"
          label="קוד חשבון"
          defaultValue={initial?.code}
          placeholder='לדוגמה: 502-0'
          dir="ltr"
          required
          disabled={initial?.is_system}
        />
        <Field
          name="name"
          label="שם החשבון"
          defaultValue={initial?.name}
          placeholder='לדוגמה: קניות'
          required
        />
        <SelectField
          name="type"
          label="סוג"
          defaultValue={initial?.type ?? 'expense'}
          disabled={initial?.is_system ?? false}
          options={[
            { value: 'asset', label: 'נכס (asset)' },
            { value: 'liability', label: 'התחייבות (liability)' },
            { value: 'income', label: 'הכנסה (income)' },
            { value: 'expense', label: 'הוצאה (expense)' },
            { value: 'equity', label: 'הון (equity)' },
          ]}
        />
        <SelectField
          name="parent_account_id"
          label='חשבון אב (אופציונלי)'
          defaultValue={initial?.parent_account_id ?? ''}
          options={[
            { value: '', label: '— ללא —' },
            ...parents
              .filter((p) => p.id !== initial?.id)
              .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          ]}
        />
        <div className="sm:col-span-2">
          <Field
            name="notes"
            label="הערות (אופציונלי)"
            defaultValue={initial?.notes ?? undefined}
          />
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initial?.is_active ?? true}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          חשבון פעיל
        </label>

        <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
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
            {pending ? 'שומר...' : isEdit ? 'עדכן' : 'הוסף חשבון'}
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
  dir,
  required,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
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
        dir={dir}
        required={required}
        disabled={disabled}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-ink-50"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean | undefined;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-ink-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
