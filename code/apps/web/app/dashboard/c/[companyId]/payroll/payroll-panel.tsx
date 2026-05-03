'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { upsertPayrollEntryAction, deletePayrollEntryAction } from './actions';

export type PayrollStatus = 'draft' | 'queued' | 'posted' | 'paid' | 'error';

export interface PayrollRow {
  id: string;
  employee_id: string;
  employee_name: string;
  month_date: string;
  gross: number;
  ni_employee: number;
  income_tax: number;
  pension_employee: number;
  study_fund_employee: number;
  ni_employer: number;
  pension_employer: number;
  study_fund_employer: number;
  severance_employer: number;
  net: number;
  status: PayrollStatus;
}

const STATUS: Record<PayrollStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-ink-100', text: 'text-ink-700', label: 'טיוטה' },
  queued: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'בתור' },
  posted: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'נרשם' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'שולם' },
  error: { bg: 'bg-red-100', text: 'text-red-800', label: 'שגיאה' },
};

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: PayrollRow };

export function PayrollPanel({
  rows,
  companyId,
}: {
  rows: PayrollRow[];
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
      const r = await upsertPayrollEntryAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEdit({ mode: 'closed' });
      setInfo(edit.mode === 'create' ? 'משכורת נרשמה ו-3 JEs נוצרו' : 'משכורת עודכנה');
    });
  }

  function onDelete(row: PayrollRow) {
    if (
      !confirm(
        `למחוק את משכורת ${row.employee_name} עבור ${row.month_date.slice(0, 7)}?\nכל ה-JEs המקושרים יימחקו גם.`,
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('id', row.id);
    startTransition(async () => {
      const r = await deletePayrollEntryAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'מחיקה נכשלה');
        return;
      }
      setInfo('הרשומה והרשומות המקושרות נמחקו');
    });
  }

  const fmt = (n: number): string =>
    n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns: Column<PayrollRow>[] = [
    {
      key: 'employee_name',
      header: 'עובד',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="text-ink-900 font-medium">{r.employee_name}</div>
          <div className="text-[11px] text-ink-500 mt-0.5" dir="ltr">
            {r.employee_id}
          </div>
        </div>
      ),
      value: (r) => r.employee_name,
    },
    {
      key: 'month_date',
      header: 'חודש',
      dir: 'ltr',
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.month_date.slice(0, 7)}</span>,
      value: (r) => r.month_date,
    },
    {
      key: 'gross',
      header: 'ברוטו',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 tabular-nums" dir="ltr">
          {fmt(r.gross)}
        </span>
      ),
      value: (r) => r.gross,
    },
    {
      key: 'net',
      header: 'נטו',
      sortable: true,
      cell: (r) => (
        <span className="text-emerald-700 font-medium tabular-nums" dir="ltr">
          {fmt(r.net)}
        </span>
      ),
      value: (r) => r.net,
    },
    {
      key: 'employer_total',
      header: 'עלות מעביד נוספת',
      cell: (r) => {
        const t = r.ni_employer + r.pension_employer + r.study_fund_employer + r.severance_employer;
        return (
          <span className="text-ink-700 tabular-nums" dir="ltr">
            {fmt(t)}
          </span>
        );
      },
      value: (r) =>
        r.ni_employer + r.pension_employer + r.study_fund_employer + r.severance_employer,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const s = STATUS[r.status];
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}
          >
            {s.label}
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
        <PayrollForm
          companyId={companyId}
          initial={edit.mode === 'edit' ? edit.row : null}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => setEdit({ mode: 'closed' })}
        />
      )}

      <DataTable<PayrollRow>
        rows={rows}
        columns={columns}
        searchKeys={['employee_name', 'employee_id']}
        searchPlaceholder="חיפוש לפי שם או מספר עובד..."
        defaultSort={{ key: 'month_date', direction: 'desc' }}
        toolbarStart={
          edit.mode === 'closed' ? (
            <button
              onClick={() => setEdit({ mode: 'create' })}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
            >
              <Plus size={14} />
              משכורת חדשה
            </button>
          ) : null
        }
        empty={
          <div className="text-center py-4 space-y-2">
            <div className="text-sm text-ink-600">
              עדיין לא הוזנו משכורות. הוסף עובד וחודש כדי שהמערכת תייצר אוטומטית את 3 ה-JEs (גרוס/נטו, הפרשות מעביד, תשלום).
            </div>
          </div>
        }
      />
    </div>
  );
}

function PayrollForm({
  companyId,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  initial: PayrollRow | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const isEdit = initial !== null;
  // Default to last day of current month
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">
            {isEdit ? 'עריכת משכורת' : 'משכורת חדשה'}
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            המערכת תייצר 3 פקודות יומן: גרוס/נטו, הפרשות מעביד, תשלום נטו לעובד.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-ink-400 hover:text-ink-700"
          aria-label="סגור"
        >
          <X size={16} />
        </button>
      </div>

      <form action={onSubmit} className="space-y-4">
        <input type="hidden" name="companyId" value={companyId} />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <FormSubsection title="פרטי העובד">
          <div className="grid grid-cols-3 gap-3">
            <Field
              name="employee_name"
              label="שם עובד"
              defaultValue={initial?.employee_name}
              required
            />
            <Field
              name="employee_id"
              label='ת.ז / מס׳ עובד'
              defaultValue={initial?.employee_id}
              dir="ltr"
              required
            />
            <Field
              name="month_date"
              label="חודש (סוף חודש)"
              defaultValue={initial?.month_date ?? lastDay}
              type="date"
              dir="ltr"
              required
            />
          </div>
        </FormSubsection>

        <FormSubsection title="ברוטו ושכרי עובד">
          <div className="grid grid-cols-3 gap-3">
            <Field
              name="gross"
              label="ברוטו"
              defaultValue={initial?.gross !== undefined ? String(initial.gross) : undefined}
              type="number"
              step="0.01"
              dir="ltr"
              required
            />
            <Field
              name="ni_employee"
              label="ביטוח לאומי (עובד)"
              defaultValue={initial?.ni_employee !== undefined ? String(initial.ni_employee) : '0'}
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="income_tax"
              label="מס הכנסה"
              defaultValue={initial?.income_tax !== undefined ? String(initial.income_tax) : '0'}
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="pension_employee"
              label="פנסיה (עובד)"
              defaultValue={
                initial?.pension_employee !== undefined ? String(initial.pension_employee) : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="study_fund_employee"
              label="השתלמות (עובד)"
              defaultValue={
                initial?.study_fund_employee !== undefined
                  ? String(initial.study_fund_employee)
                  : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
            />
          </div>
        </FormSubsection>

        <FormSubsection title="הפרשות מעביד (עלות נוספת מעבר לברוטו)">
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="ni_employer"
              label="ביטוח לאומי (מעביד)"
              defaultValue={
                initial?.ni_employer !== undefined ? String(initial.ni_employer) : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="pension_employer"
              label="פנסיה (מעביד)"
              defaultValue={
                initial?.pension_employer !== undefined
                  ? String(initial.pension_employer)
                  : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="study_fund_employer"
              label="השתלמות (מעביד)"
              defaultValue={
                initial?.study_fund_employer !== undefined
                  ? String(initial.study_fund_employer)
                  : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
            />
            <Field
              name="severance_employer"
              label="פיצויים (מעביד)"
              defaultValue={
                initial?.severance_employer !== undefined
                  ? String(initial.severance_employer)
                  : '0'
              }
              type="number"
              step="0.01"
              dir="ltr"
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
            {pending ? 'שומר...' : isEdit ? 'עדכן ויצר JEs' : 'הוסף ויצר JEs'}
          </button>
        </div>
      </form>
    </section>
  );
}

function FormSubsection({ title, children }: { title: string; children: React.ReactNode }) {
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
  type,
  step,
  dir,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
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
        type={type}
        step={step}
        dir={dir}
        required={required}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  );
}
