'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertItemAction, deleteItemAction } from './actions';

export type VatCategory = 'standard' | 'zero' | 'exempt';

export interface ItemRow {
  id: string;
  name: string;
  internal_code: string;
  description: string | null;
  unit: string | null;
  default_unit_price: number | null;
  default_revenue_account: string | null;
  vat_category: VatCategory;
  is_active: boolean;
}

const VAT_LABELS: Record<VatCategory, { label: string; bg: string; text: string }> = {
  standard: { label: 'רגיל (18%)', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  zero: { label: '0% (ייצוא)', bg: 'bg-blue-100', text: 'text-blue-800' },
  exempt: { label: 'פטור', bg: 'bg-amber-100', text: 'text-amber-800' },
};

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: ItemRow };

export function ItemsPanel({ rows, companyId }: { rows: ItemRow[]; companyId: string }) {
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await upsertItemAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'הפריט נוסף' : 'הפריט עודכן');
    });
  }

  function onDelete(row: ItemRow) {
    if (!confirm(`למחוק את הפריט "${row.name}" (${row.internal_code})?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deleteItemAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('הפריט נמחק');
    });
  }

  const columns: Column<ItemRow>[] = [
    {
      key: 'name',
      header: 'שם הפריט',
      sortable: true,
      cell: (r) => (
        <div>
          <span className={`font-medium ${r.is_active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>
            {r.name}
          </span>
          {r.description && (
            <div className="text-[11px] text-ink-500 mt-0.5 truncate">{r.description}</div>
          )}
        </div>
      ),
      value: (r) => r.name,
    },
    {
      key: 'internal_code',
      header: 'קוד',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.internal_code}</span>,
      value: (r) => r.internal_code,
    },
    {
      key: 'default_unit_price',
      header: 'מחיר ליחידה',
      sortable: true,
      cell: (r) => (
        <span className="tabular-nums text-ink-900">
          {r.default_unit_price !== null
            ? `${r.default_unit_price.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`
            : '—'}
        </span>
      ),
      value: (r) => r.default_unit_price ?? 0,
    },
    {
      key: 'unit',
      header: 'יחידה',
      cell: (r) => <span className="text-ink-700 text-xs">{r.unit ?? '—'}</span>,
      value: (r) => r.unit ?? '',
    },
    {
      key: 'default_revenue_account',
      header: 'חשבון הכנסות',
      dir: 'ltr',
      monospace: true,
      cell: (r) => <span className="text-ink-700">{r.default_revenue_account ?? '—'}</span>,
      value: (r) => r.default_revenue_account ?? '',
    },
    {
      key: 'vat_category',
      header: 'מע"מ',
      sortable: true,
      cell: (r) => {
        const v = VAT_LABELS[r.vat_category];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${v.bg} ${v.text}`}>
            {v.label}
          </span>
        );
      },
      value: (r) => r.vat_category,
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
          <button
            onClick={() => onDelete(r)}
            disabled={pending}
            className="text-ink-600 hover:text-red-600 disabled:opacity-50"
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
        <ItemForm
          companyId={companyId}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      )}

      <DataTable<ItemRow>
        rows={rows}
        columns={columns}
        searchKeys={['name', 'internal_code']}
        searchPlaceholder='חיפוש לפי שם או קוד...'
        defaultSort={{ key: 'name', direction: 'asc' }}
        toolbarStart={
          edit.mode === 'closed' ? (
            <button
              onClick={() => setEdit({ mode: 'create' })}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
            >
              <Plus size={14} />
              פריט חדש
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-4 space-y-2">
            <div className="text-sm text-ink-600">
              אין עדיין פריטים. הוסף פריטים שאתה מוכר כדי לזרז יצירת חשבוניות מכירה.
            </div>
          </div>
        }
      />
    </div>
  );
}

function ItemForm({
  companyId,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  initial: ItemRow | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const isEdit = initial !== null;
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-ink-900">
          {isEdit ? 'עריכת פריט' : 'פריט חדש'}
        </h3>
        <button onClick={onCancel} className="text-ink-400 hover:text-ink-700">
          <X size={16} />
        </button>
      </div>

      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="hidden" name="companyId" value={companyId} />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <Field
          name="name"
          label="שם הפריט"
          defaultValue={initial?.name}
          placeholder='לדוגמה: ייעוץ עסקי'
          required
        />
        <Field
          name="internal_code"
          label="קוד"
          defaultValue={initial?.internal_code}
          placeholder='לדוגמה: SVC-001'
          dir="ltr"
          required
        />
        <Field
          name="default_unit_price"
          label='מחיר ליחידה (₪)'
          defaultValue={
            initial?.default_unit_price !== null && initial?.default_unit_price !== undefined
              ? String(initial.default_unit_price)
              : undefined
          }
          type="number"
          step="0.01"
          dir="ltr"
        />
        <Field
          name="unit"
          label="יחידה"
          defaultValue={initial?.unit ?? 'יח'}
          placeholder='יח / שעות / ק"ג'
        />
        <Field
          name="default_revenue_account"
          label='חשבון הכנסות'
          defaultValue={initial?.default_revenue_account ?? undefined}
          placeholder='לדוגמה: 700-0'
          dir="ltr"
        />
        <SelectField
          name="vat_category"
          label='קטגוריית מע"מ'
          defaultValue={initial?.vat_category ?? 'standard'}
          options={[
            { value: 'standard', label: 'רגיל (18%)' },
            { value: 'zero', label: '0% (ייצוא)' },
            { value: 'exempt', label: 'פטור (אילת, תיירים)' },
          ]}
        />
        <div className="sm:col-span-2">
          <Field
            name="description"
            label="תיאור (אופציונלי)"
            defaultValue={initial?.description ?? undefined}
            placeholder='פרטים נוספים שיופיעו בחשבונית'
          />
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initial?.is_active ?? true}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          פריט פעיל (מופיע ברשימה לבחירה בחשבונית)
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
            {pending ? 'שומר...' : isEdit ? 'עדכן' : 'הוסף פריט'}
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
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  type?: string | undefined;
  step?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
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
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
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
