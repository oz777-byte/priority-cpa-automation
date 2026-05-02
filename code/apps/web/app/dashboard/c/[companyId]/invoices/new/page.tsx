import Link from 'next/link';
import { Plus, ArrowRight, ScanLine } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { createInvoiceManuallyAction } from './actions';

export const dynamic = 'force-dynamic';

async function submitForm(formData: FormData): Promise<void> {
  'use server';
  const r = await createInvoiceManuallyAction(formData);
  if (!r.ok) {
    throw new Error(r.error ?? 'שגיאה ביצירת חשבונית');
  }
}

export default async function NewInvoicePage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/c/${company.id}/invoices`}
          className="text-sm text-accent-600 hover:underline flex items-center gap-1"
        >
          <ArrowRight size={14} />
          חזרה לרשימת החשבוניות
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
          <Plus size={18} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-900">הוספת חשבונית ל-{company.name}</h2>
          <p className="text-sm text-ink-600 mt-0.5">
            הזן את פרטי החשבונית ידנית. בקרוב — גרירת PDF עם חילוץ אוטומטי.
          </p>
        </div>
      </div>

      <form action={submitForm} className="bg-white border border-ink-200 rounded-xl p-6 space-y-5">
        <input type="hidden" name="companyId" value={company.id} />

        <Section title="פרטי הספק">
          <Field name="supplierName" label="שם הספק" placeholder='לדוגמה: שיווק והספקה וירטהיים בע"מ' required />
          <div className="grid grid-cols-2 gap-3">
            <Field name="supplierTaxId" label='ע.מ הספק' placeholder="9 ספרות" dir="ltr" required />
            <Field
              name="supplierInternalCode"
              label="קוד ספק בפריוריטי"
              placeholder='לדוגמה: 200087'
              dir="ltr"
              required
            />
          </div>
        </Section>

        <Section title="פרטי החשבונית">
          <div className="grid grid-cols-2 gap-3">
            <Field name="invoiceNumber" label="מס׳ חשבונית" placeholder='לדוגמה: 4427930' dir="ltr" required />
            <Field name="invoiceDate" label="תאריך חשבונית" type="date" defaultValue={today} dir="ltr" required />
          </div>
          <SelectField name="currency" label="מטבע" options={['ILS', 'USD', 'EUR', 'GBP']} defaultValue="ILS" />
          <Field
            name="allocationNumber"
            label='מספר הקצאה (אופציונלי)'
            placeholder='לדוגמה: 1I4427930 — חובה לחשבוניות מעל הרף'
            dir="ltr"
          />
        </Section>

        <Section title="סכומים">
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="subtotal"
              label='סכום ביניים (לפני מע"מ)'
              type="number"
              step="0.01"
              dir="ltr"
              required
            />
            <Field name="total" label='סך הכול (כולל מע"מ)' type="number" step="0.01" dir="ltr" required />
          </div>
          <p className="text-xs text-ink-400">
            מע"מ יחושב אוטומטית כהפרש בין סך הכול לסכום הביניים. שיעור המע"מ יקבע
            לפי תאריך החשבונית (17% עד 2024, 18% מ-2025).
          </p>
        </Section>

        <div className="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <Link
            href={`/dashboard/c/${company.id}/invoices`}
            className="px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
          >
            ביטול
          </Link>
          <button
            type="submit"
            className="px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500"
          >
            הוסף חשבונית
          </button>
        </div>
      </form>

      <div className="bg-brand-radial text-white rounded-xl p-5 flex items-center gap-3">
        <ScanLine size={24} className="text-brand-glow flex-shrink-0" />
        <div className="text-sm">
          <div className="font-semibold mb-0.5">בקרוב: גרירת PDF עם OCR אוטומטי</div>
          <div className="text-white/70 text-xs">
            תוכל לגרור PDF של חשבונית — המערכת תחלץ אוטומטית את כל הפרטים, תזהה
            את הספק במאסטר, ותציג לך את הטופס מולא מראש.
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-ink-600 uppercase tracking-wider border-b border-ink-100 pb-1.5">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  type,
  step,
  dir,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  step?: string;
  dir?: 'ltr' | 'rtl';
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <input
        name={name}
        required={required}
        type={type}
        step={step}
        placeholder={placeholder}
        dir={dir}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
