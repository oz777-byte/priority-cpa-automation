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

        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-accent-600 hover:text-accent-500 select-none flex items-center gap-1">
            <span className="transition group-open:rotate-90 inline-block">▸</span>
            הגדרות מתקדמות (תרחישים מיוחדים)
          </summary>
          <div className="mt-4 space-y-4">
            <Section title="חריגות בחשבונית">
              <CheckboxField
                name="isCreditNote"
                label="זוהי חשבונית זיכוי / החזר"
                hint="המערכת תהפוך את כיווני חובה/זכות"
              />
              <SelectField
                name="paymentMethod"
                label='שיטת תשלום'
                options={[
                  { value: '', label: 'תשלום שוטף לספק' },
                  { value: 'cash', label: 'מזומן' },
                  { value: 'card', label: 'אשראי' },
                  { value: 'transfer', label: 'העברה בנקאית מיידית' },
                ]}
                hint='בחר אם החשבונית שולמה מיידית — JE יזקוף לחשבון התשלום במקום לספק'
              />
              <Field
                name="valueDate"
                label='תאריך ערך (אם שונה מתאריך חשבונית)'
                type="date"
                dir="ltr"
                hint='למקרה של חשבונית מתקופה קודמת שנכנסה למערכת בתאריך אחר'
              />
            </Section>

            <Section title='ניכוי במקור (לספקי שירות)'>
              <Field
                name="withholdingPercent"
                label='אחוז ניכוי במקור (%)'
                type="number"
                step="0.01"
                placeholder='לדוגמה: 5'
                dir="ltr"
                hint='אם ספק זה חייב ניכוי במקור — JE ייצור 4 שורות עם זכות לרשות המסים'
              />
            </Section>

            <Section title='מע"מ מעורב (לפי חוק המס)'>
              <SelectField
                name="mixedDeductionCategory"
                label='קטגוריית הוצאה'
                options={[
                  { value: '', label: 'מנוכה במלואו (סטנדרטי)' },
                  { value: 'vehicle', label: 'רכב — 2/3 מנוכה' },
                  { value: 'meals', label: 'אש"ל / מתנות — 1/4 מנוכה' },
                  { value: 'non_deductible', label: 'לא מנוכה כלל' },
                ]}
                hint='המערכת תפצל את ה-JE לחלק מנוכה ולחלק לא-מנוכה'
              />
            </Section>

            <Section title='מטבע חוץ'>
              <Field
                name="fxRate"
                label='שער חליפין (₪ ליחידת מטבע)'
                type="number"
                step="0.0001"
                placeholder='לדוגמה: 3.7'
                dir="ltr"
                hint='נדרש כשהמטבע אינו ILS. שערי בנק ישראל אוטומטיים — בקרוב'
              />
            </Section>
          </div>
        </details>

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
  hint,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  step?: string;
  dir?: 'ltr' | 'rtl';
  defaultValue?: string;
  required?: boolean;
  hint?: string;
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
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}

function CheckboxField({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-ink-800 cursor-pointer">
        <input
          type="checkbox"
          name={name}
          className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
        />
        <span>{label}</span>
      </label>
      {hint && <div className="text-xs text-ink-400 mt-1 mr-6">{hint}</div>}
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

function SelectField({
  name,
  label,
  options,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  options: SelectOption[];
  defaultValue?: string;
  hint?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
      >
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
