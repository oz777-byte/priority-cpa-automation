'use client';

import { useState, useTransition } from 'react';
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
          ? 'חשבוניות ה-POC כבר נטענו לחברה זו.'
          : `נטענו ${r.created} חשבוניות לדוגמה.`,
      );
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
          {info}
        </div>
      )}

      {/* Existing companies */}
      {companies.length > 0 && (
        <section className="bg-white border border-ink-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-200 text-ink-600">
              <tr>
                <th className="text-right p-3 font-medium">שם</th>
                <th className="text-right p-3 font-medium">ע.מ</th>
                <th className="text-right p-3 font-medium">סטטוס</th>
                <th className="text-right p-3 font-medium">חשבון הוצאה</th>
                <th className="text-right p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const isCurrent = c.id === currentCompanyId;
                const expense = (c.settings as { expense_account?: string })
                  .expense_account ?? '—';
                return (
                  <tr key={c.id} className="border-b border-ink-100 last:border-0">
                    <td className="p-3 text-ink-900 font-medium">
                      {c.name}
                      {isCurrent && (
                        <span className="mr-2 px-2 py-0.5 rounded bg-accent-500/10 text-accent-600 text-xs">
                          נבחרה
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-ink-700" dir="ltr">{c.tax_id}</td>
                    <td className="p-3 text-ink-700">{c.status}</td>
                    <td className="p-3 text-ink-700" dir="ltr">{expense}</td>
                    <td className="p-3 space-x-3 space-x-reverse">
                      {!isCurrent && (
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
                        טעינת חשבוניות POC
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Add new company */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
        >
          + הוסף חברה
        </button>
      ) : (
        <section className="bg-white border border-ink-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-ink-900">חברה חדשה</h2>
          <form action={onCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="name" label="שם החברה" placeholder="לדוגמה: טארי בע&quot;מ" />
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
              label="חשבון מע&quot;מ תשומות"
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
                className="px-3 py-2 text-ink-600"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50"
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
