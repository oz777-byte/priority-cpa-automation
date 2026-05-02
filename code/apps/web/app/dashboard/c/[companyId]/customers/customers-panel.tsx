'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertCustomerAction, deleteCustomerAction } from './actions';

export interface CustomerRow {
  id: string;
  name: string;
  internal_code: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  default_revenue_account: string | null;
  withholding_percent: number | null;
  payment_terms: string | null;
  notes: string | null;
}

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: CustomerRow };

export function CustomersPanel({
  rows,
  companyId,
}: {
  rows: CustomerRow[];
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
      const r = await upsertCustomerAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'הלקוח נוסף' : 'הלקוח עודכן');
    });
  }

  function onDelete(row: CustomerRow) {
    if (!confirm(`למחוק את הלקוח "${row.name}" (${row.internal_code})?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deleteCustomerAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('הלקוח נמחק');
    });
  }

  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'שם הלקוח',
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
      key: 'default_revenue_account',
      header: 'חשבון הכנסות',
      dir: 'ltr',
      monospace: true,
      cell: (r) => (
        <span className="text-ink-700">{r.default_revenue_account ?? '—'}</span>
      ),
      value: (r) => r.default_revenue_account ?? '',
    },
    {
      key: 'withholding_percent',
      header: 'ניכוי %',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-700 tabular-nums">
          {r.withholding_percent !== null ? `${r.withholding_percent}%` : '—'}
        </span>
      ),
      value: (r) => r.withholding_percent ?? 0,
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
            aria-label="ערוך"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(r)}
            disabled={pending}
            className="text-ink-600 hover:text-red-600 disabled:opacity-50"
            aria-label="מחק"
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

      {edit.mode !== 'closed' && (
        <CustomerForm
          companyId={companyId}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      )}

      <DataTable<CustomerRow>
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
              לקוח חדש
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-4 space-y-2">
            <div className="text-sm text-ink-600">
              אין עדיין לקוחות במאסטר. הוסף לקוח כדי שחשבוניות מכירה יוכלו להיווצר אוטומטית.
            </div>
          </div>
        }
      />
    </div>
  );
}

function CustomerForm({
  companyId,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  initial: CustomerRow | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const isEdit = initial !== null;
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-ink-900">
          {isEdit ? 'עריכת לקוח' : 'לקוח חדש'}
        </h3>
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
          label="שם הלקוח"
          defaultValue={initial?.name}
          placeholder='לדוגמה: שיווק ושירותים בע"מ'
          required
        />
        <Field
          name="internal_code"
          label="קוד פריוריטי"
          defaultValue={initial?.internal_code}
          placeholder='לדוגמה: 100023'
          dir="ltr"
          required
          hint='מזהה הלקוח בתרשים החשבונות של פריוריטי'
        />
        <Field
          name="tax_id"
          label='ע.מ / ת.ז'
          defaultValue={initial?.tax_id ?? undefined}
          placeholder="9 ספרות"
          dir="ltr"
        />
        <Field
          name="default_revenue_account"
          label='חשבון הכנסות ברירת מחדל'
          defaultValue={initial?.default_revenue_account ?? undefined}
          placeholder='לדוגמה: 700-0'
          dir="ltr"
          hint='אם ריק — נלקח מהגדרות החברה'
        />
        <Field
          name="email"
          label="אימייל"
          defaultValue={initial?.email ?? undefined}
          placeholder="contact@example.com"
          dir="ltr"
        />
        <Field
          name="phone"
          label="טלפון"
          defaultValue={initial?.phone ?? undefined}
          placeholder='03-1234567'
          dir="ltr"
        />
        <Field
          name="withholding_percent"
          label='ניכוי במקור מהלקוח %'
          defaultValue={
            initial?.withholding_percent !== null && initial?.withholding_percent !== undefined
              ? String(initial.withholding_percent)
              : undefined
          }
          type="number"
          step="0.01"
          dir="ltr"
          hint='לקוחות B2G שמנכים מהחשבונית שלך'
        />
        <Field
          name="payment_terms"
          label="תנאי תשלום"
          defaultValue={initial?.payment_terms ?? undefined}
          placeholder='שוטף+30'
        />
        <div className="sm:col-span-2">
          <Field
            name="address"
            label="כתובת"
            defaultValue={initial?.address ?? undefined}
            placeholder='רחוב, עיר, מיקוד'
          />
        </div>

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
            {pending ? 'שומר...' : isEdit ? 'עדכן' : 'הוסף לקוח'}
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
  hint,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  type?: string | undefined;
  step?: string | undefined;
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
        type={type}
        step={step}
        dir={dir}
        required={required}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
