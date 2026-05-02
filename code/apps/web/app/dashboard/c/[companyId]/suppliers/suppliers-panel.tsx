'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertSupplierAction, deleteSupplierAction } from './actions';

export interface SupplierRow {
  id: string;
  name: string;
  internal_code: string;
  tax_id: string | null;
  default_expense_account: string | null;
  default_cost_center: string | null;
  payment_terms: string | null;
  invoiceCount: number;
}

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: SupplierRow };

export function SuppliersPanel({
  rows,
  companyId,
}: {
  rows: SupplierRow[];
  companyId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await upsertSupplierAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'הספק נוסף' : 'הספק עודכן');
    });
  }

  function onDelete(row: SupplierRow) {
    if (!confirm(`למחוק את הספק "${row.name}" (${row.internal_code})?`)) return;
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deleteSupplierAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('הספק נמחק');
    });
  }

  const columns: Column<SupplierRow>[] = [
    {
      key: 'name',
      header: 'שם הספק',
      sortable: true,
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      value: (r) => r.name,
    },
    {
      key: 'internal_code',
      header: 'קוד פריוריטי',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.internal_code}</span>,
      value: (r) => r.internal_code,
    },
    {
      key: 'tax_id',
      header: 'ע.מ',
      dir: 'ltr',
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.tax_id ?? '—'}</span>,
      value: (r) => r.tax_id ?? '',
    },
    {
      key: 'default_expense_account',
      header: 'חשבון הוצאה',
      dir: 'ltr',
      monospace: true,
      cell: (r) => (
        <span className="text-ink-700">{r.default_expense_account ?? '—'}</span>
      ),
      value: (r) => r.default_expense_account ?? '',
    },
    {
      key: 'invoiceCount',
      header: 'חשבוניות',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 tabular-nums">{r.invoiceCount}</span>
      ),
      value: (r) => r.invoiceCount,
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
            aria-label="ערוך ספק"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(r)}
            disabled={pending}
            className="text-ink-600 hover:text-red-600 disabled:opacity-50"
            aria-label="מחק ספק"
          >
            <Trash2 size={14} />
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

      {edit.mode !== 'closed' ? (
        <SupplierForm
          companyId={companyId}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      ) : null}

      <DataTable<SupplierRow>
        rows={rows}
        columns={columns}
        searchKeys={['name', 'internal_code', 'tax_id']}
        searchPlaceholder='חיפוש לפי שם, קוד או ע.מ...'
        defaultSort={{ key: 'name', direction: 'asc' }}
        toolbarStart={
          edit.mode === 'closed' ? (
            <button
              onClick={() => setEdit({ mode: 'create' })}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
            >
              <Plus size={14} />
              ספק חדש
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-4 space-y-2">
            <div className="text-sm text-ink-600">
              אין עדיין ספקים במאסטר. כל ספק שתזין מהחשבוניות יוסיף שורה אוטומטית, או הוסף ידנית.
            </div>
          </div>
        }
      />
    </div>
  );
}

function SupplierForm({
  companyId,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  initial: SupplierRow | null;
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
            {isEdit ? 'עריכת ספק' : 'ספק חדש'}
          </h3>
          {isEdit && (
            <p className="text-xs text-ink-500 mt-0.5">
              שינויים יתאמו על חשבוניות עתידיות בלבד.
            </p>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-ink-400 hover:text-ink-700"
          aria-label="סגור"
        >
          <X size={16} />
        </button>
      </div>

      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="hidden" name="companyId" value={companyId} />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <Field
          name="name"
          label="שם הספק"
          defaultValue={initial?.name}
          placeholder='לדוגמה: וירטהיים בע"מ'
          required
        />
        <Field
          name="internal_code"
          label="קוד פריוריטי"
          defaultValue={initial?.internal_code}
          placeholder='לדוגמה: 200087'
          dir="ltr"
          required
          hint='מזהה הספק בתרשים החשבונות של פריוריטי'
        />
        <Field
          name="tax_id"
          label='ע.מ'
          defaultValue={initial?.tax_id ?? undefined}
          placeholder="9 ספרות"
          dir="ltr"
          hint='משמש לזיהוי אוטומטי של החשבונית במאסטר'
        />
        <Field
          name="default_expense_account"
          label="חשבון הוצאה ברירת מחדל"
          defaultValue={initial?.default_expense_account ?? undefined}
          placeholder='לדוגמה: 502-0'
          dir="ltr"
          hint='אם ריק — נלקח מהגדרות החברה'
        />
        <Field
          name="default_cost_center"
          label="מרכז עלות (אופציונלי)"
          defaultValue={initial?.default_cost_center ?? undefined}
          placeholder='לדוגמה: PROJ-A'
          dir="ltr"
        />
        <Field
          name="payment_terms"
          label="תנאי תשלום (אופציונלי)"
          defaultValue={initial?.payment_terms ?? undefined}
          placeholder='לדוגמה: שוטף+30'
        />

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
            {pending ? 'שומר...' : isEdit ? 'עדכן' : 'הוסף ספק'}
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
  hint,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  hint?: string | undefined;
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
        dir={dir}
        required={required}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
