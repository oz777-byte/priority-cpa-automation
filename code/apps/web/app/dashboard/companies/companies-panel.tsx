'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import {
  createCompanyAction,
  selectCompanyAction,
  seedPocInvoicesAction,
} from './actions';

interface CompanyRow {
  id: string;
  name: string;
  tax_id: string;
  status: 'active' | 'paused' | 'archived';
  settings: Record<string, unknown>;
}

const STATUS_LABELS: Record<CompanyRow['status'], { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'פעיל' },
  paused: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'מושהה' },
  archived: { bg: 'bg-ink-100', text: 'text-ink-700', label: 'ארכיון' },
};

export function CompaniesPanel({
  companies,
  currentCompanyId,
}: {
  companies: CompanyRow[];
  currentCompanyId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(companies.length === 0);

  function onCreate(formData: FormData) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await createCompanyAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שגיאה');
        return;
      }
      setShowAdd(false);
      setInfo('החברה נוצרה והוגדרה כפעילה');
    });
  }

  function onSelect(companyId: string) {
    setError(null);
    startTransition(async () => {
      await selectCompanyAction(companyId);
    });
  }

  function onSeedPoc(companyId: string) {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    startTransition(async () => {
      const r = await seedPocInvoicesAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'שגיאה');
        return;
      }
      setInfo(
        r.created === 0
          ? 'חשבוניות לדוגמה כבר נטענו לחברה זו.'
          : `נטענו ${r.created} חשבוניות לדוגמה.`,
      );
    });
  }

  const columns: Column<CompanyRow>[] = [
    {
      key: 'name',
      header: 'שם',
      sortable: true,
      cell: (c) => (
        <span className="font-medium text-ink-900">
          {c.name}
          {c.id === currentCompanyId && (
            <span className="mr-2 px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-600 text-[10px]">
              נבחרה
            </span>
          )}
        </span>
      ),
      value: (c) => c.name,
    },
    {
      key: 'tax_id',
      header: 'ע.מ',
      dir: 'ltr',
      sortable: true,
      cell: (c) => <span className="text-ink-700">{c.tax_id}</span>,
      value: (c) => c.tax_id,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (c) => {
        const s = STATUS_LABELS[c.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      },
      value: (c) => c.status,
    },
    {
      key: 'expense_account',
      header: 'חשבון הוצאה',
      dir: 'ltr',
      monospace: true,
      cell: (c) => {
        const v = (c.settings as { expense_account?: string }).expense_account;
        return <span className="text-ink-700">{v ?? '—'}</span>;
      },
      value: (c) =>
        ((c.settings as { expense_account?: string }).expense_account ?? '') as string,
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (c) => (
        <div className="flex items-center gap-3 justify-end text-xs">
          {c.id !== currentCompanyId && (
            <button
              onClick={() => onSelect(c.id)}
              disabled={pending}
              className="text-accent-600 hover:underline disabled:opacity-50"
            >
              בחר
            </button>
          )}
          <button
            onClick={() => onSeedPoc(c.id)}
            disabled={pending}
            className="text-ink-600 hover:underline disabled:opacity-50"
          >
            חשבוניות לדוגמה
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
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

      {companies.length > 0 && (
        <DataTable<CompanyRow>
          rows={companies}
          columns={columns}
          searchKeys={['name', 'tax_id']}
          searchPlaceholder="חיפוש לפי שם או ע.מ..."
          defaultSort={{ key: 'name', direction: 'asc' }}
          toolbarStart={
            !showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-1.5"
              >
                <Plus size={14} />
                חברה חדשה
              </button>
            ) : null
          }
        />
      )}

      {(showAdd || companies.length === 0) && (
        <section className="bg-white border border-ink-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-ink-900">חברה חדשה</h2>
          <form action={onCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="name" label="שם החברה" placeholder='לדוגמה: טארי בע"מ' />
            <Field name="tax_id" label='ע.מ' placeholder="9 ספרות" dir="ltr" />
            <Field
              name="priority_version"
              label="גרסת פריוריטי (אופציונלי)"
              placeholder="לדוגמה: 24.1"
              dir="ltr"
            />
            <Field
              name="expense_account"
              label="חשבון הוצאה ברירת מחדל"
              placeholder="לדוגמה: 502-0"
              dir="ltr"
            />
            <Field
              name="vat_input_account"
              label='חשבון מע"מ תשומות'
              placeholder='לדוגמה: 205-2'
              dir="ltr"
            />
            <Field
              name="details_prefix"
              label="קידומת פרטים בפקודות יומן"
              placeholder="קניות"
              defaultValue="קניות"
            />
            <Field
              name="transaction_type"
              label="סוג תנועה"
              placeholder="מ"
              defaultValue="מ"
            />

            <div className="sm:col-span-2 flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-3 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {pending ? 'יוצר...' : 'צור חברה'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  defaultValue,
  dir,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">{label}</label>
      <input
        name={name}
        required
        defaultValue={defaultValue}
        placeholder={placeholder}
        dir={dir}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  );
}
