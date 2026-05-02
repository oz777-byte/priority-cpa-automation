'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X, GitBranch } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertMappingRuleAction, deleteMappingRuleAction } from './actions';

export interface SupplierOption {
  id: string;
  name: string;
  internal_code: string;
}

export interface MappingRuleRow {
  id: string;
  priority: number;
  match_supplier_id: string | null;
  match_supplier_name: string | null;
  match_amount_min: number | null;
  match_amount_max: number | null;
  expense_account: string;
  vat_account: string;
  cost_center: string | null;
}

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: MappingRuleRow };

export function MappingPanel({
  rows,
  suppliers,
  companyId,
}: {
  rows: MappingRuleRow[];
  suppliers: SupplierOption[];
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
      const r = await upsertMappingRuleAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'הכלל נוסף' : 'הכלל עודכן');
    });
  }

  function onDelete(row: MappingRuleRow) {
    const desc = describeRule(row);
    if (!confirm(`למחוק את הכלל הזה?\n\n${desc}`)) return;
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deleteMappingRuleAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('הכלל נמחק');
    });
  }

  const columns: Column<MappingRuleRow>[] = [
    {
      key: 'priority',
      header: 'עדיפות',
      sortable: true,
      cell: (r) => (
        <span className="inline-block px-2 py-0.5 rounded bg-ink-100 text-ink-700 text-xs font-medium tabular-nums">
          {r.priority}
        </span>
      ),
      value: (r) => r.priority,
    },
    {
      key: 'matcher',
      header: 'תנאי התאמה',
      cell: (r) => <span className="text-sm text-ink-900">{describeRule(r)}</span>,
      value: (r) => describeRule(r),
    },
    {
      key: 'expense_account',
      header: 'חשבון הוצאה',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-900">{r.expense_account}</span>,
      value: (r) => r.expense_account,
    },
    {
      key: 'vat_account',
      header: 'חשבון מע"מ',
      dir: 'ltr',
      monospace: true,
      cell: (r) => <span className="text-ink-700">{r.vat_account}</span>,
      value: (r) => r.vat_account,
    },
    {
      key: 'cost_center',
      header: 'מרכז עלות',
      dir: 'ltr',
      monospace: true,
      cell: (r) => <span className="text-ink-700">{r.cost_center ?? '—'}</span>,
      value: (r) => r.cost_center ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (r) => (
        <div className="flex items-center gap-2 justify-end">
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
        <RuleForm
          companyId={companyId}
          suppliers={suppliers}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      )}

      <DataTable<MappingRuleRow>
        rows={rows}
        columns={columns}
        searchKeys={['expense_account', 'vat_account', 'cost_center']}
        searchPlaceholder="חיפוש לפי חשבון או מרכז עלות..."
        defaultSort={{ key: 'priority', direction: 'asc' }}
        toolbarStart={
          edit.mode === 'closed' ? (
            <button
              onClick={() => setEdit({ mode: 'create' })}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
            >
              <Plus size={14} />
              כלל חדש
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-6 space-y-3">
            <GitBranch size={20} className="mx-auto text-ink-300" />
            <div className="text-sm text-ink-600 max-w-md mx-auto leading-relaxed">
              אין עדיין כללי מיפוי. בלי כללים — כל JE משתמש בחשבון ההוצאה שהגדרת
              ברירת מחדל לחברה (או לפר-ספק במאסטר). הוסף כלל כדי לטפל בחריגות.
            </div>
          </div>
        }
      />
    </div>
  );
}

function RuleForm({
  companyId,
  suppliers,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  suppliers: SupplierOption[];
  initial: MappingRuleRow | null;
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
            {isEdit ? 'עריכת כלל מיפוי' : 'כלל מיפוי חדש'}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            תנאים שריקים — הכלל מתעלם מהם. כלל חל רק אם <strong>כל</strong> התנאים שהוגדרו מתקיימים.
          </p>
        </div>
        <button onClick={onCancel} className="text-ink-400 hover:text-ink-700" aria-label="סגור">
          <X size={16} />
        </button>
      </div>

      <form action={onSubmit} className="space-y-4">
        <input type="hidden" name="companyId" value={companyId} />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <FormSubsection title="עדיפות וזיהוי">
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="priority"
              label="עדיפות"
              defaultValue={String(initial?.priority ?? 100)}
              type="number"
              dir="ltr"
              hint="ערך נמוך יותר = עדיפות גבוהה יותר. הכללים נבדקים בסדר עולה."
              required
            />
            <SelectField
              name="match_supplier_id"
              label="התאמה לספק (אופציונלי)"
              defaultValue={initial?.match_supplier_id ?? ''}
              options={[
                { value: '', label: '— כל ספק —' },
                ...suppliers.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.internal_code})`,
                })),
              ]}
              hint="ריק → הכלל חל על כל ספק"
            />
          </div>
        </FormSubsection>

        <FormSubsection title="טווח סכום ביניים (אופציונלי)">
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="match_amount_min"
              label='סכום ביניים מינימלי (₪)'
              defaultValue={
                initial?.match_amount_min !== null && initial?.match_amount_min !== undefined
                  ? String(initial.match_amount_min)
                  : ''
              }
              type="number"
              step="0.01"
              dir="ltr"
              placeholder="ריק = ללא מינימום"
            />
            <Field
              name="match_amount_max"
              label='סכום ביניים מקסימלי (₪)'
              defaultValue={
                initial?.match_amount_max !== null && initial?.match_amount_max !== undefined
                  ? String(initial.match_amount_max)
                  : ''
              }
              type="number"
              step="0.01"
              dir="ltr"
              placeholder="ריק = ללא מקסימום"
            />
          </div>
        </FormSubsection>

        <FormSubsection title="חשבונות יעד">
          <div className="grid grid-cols-3 gap-3">
            <Field
              name="expense_account"
              label="חשבון הוצאה"
              defaultValue={initial?.expense_account}
              placeholder="502-0"
              dir="ltr"
              required
            />
            <Field
              name="vat_account"
              label='חשבון מע"מ תשומות'
              defaultValue={initial?.vat_account}
              placeholder="205-2"
              dir="ltr"
              required
            />
            <Field
              name="cost_center"
              label="מרכז עלות (אופציונלי)"
              defaultValue={initial?.cost_center ?? undefined}
              placeholder="PROJ-A"
              dir="ltr"
              hint="אם הוגדר — JE יעבור אוטומטית ל-FLEXIBLE"
            />
          </div>
        </FormSubsection>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
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
            {pending ? 'שומר...' : isEdit ? 'עדכן כלל' : 'הוסף כלל'}
          </button>
        </div>
      </form>
    </section>
  );
}

function FormSubsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
        {title}
      </div>
      {children}
    </div>
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
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  type?: string | undefined;
  step?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
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

function SelectField({
  name,
  label,
  defaultValue,
  options,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  options: Array<{ value: string; label: string }>;
  hint?: string | undefined;
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
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}

function describeRule(r: MappingRuleRow): string {
  const parts: string[] = [];
  if (r.match_supplier_name) parts.push(`ספק: ${r.match_supplier_name}`);
  if (r.match_amount_min !== null) parts.push(`≥ ${r.match_amount_min.toFixed(2)} ₪`);
  if (r.match_amount_max !== null) parts.push(`≤ ${r.match_amount_max.toFixed(2)} ₪`);
  return parts.length === 0 ? 'כל החשבוניות' : parts.join(' · ');
}
