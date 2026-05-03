'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface CustomerOption {
  id: string;
  name: string;
  internal_code: string;
  tax_id: string | null;
  default_revenue_account: string | null;
  withholding_percent: number | null;
}

export interface SalesInvoiceFormProps {
  companyId: string;
  today: string;
  customers: CustomerOption[];
  submitAction: (formData: FormData) => Promise<void>;
}

const DOC_TYPE_OPTIONS = [
  { value: 'tax_invoice', label: 'חשבונית מס (B2B)' },
  { value: 'invoice_receipt', label: 'חשבונית מס-קבלה' },
  { value: 'proforma', label: 'חשבונית עסקה (Proforma)' },
  { value: 'receipt', label: 'קבלה' },
  { value: 'credit_note', label: 'זיכוי לקוח' },
] as const;

const PAYMENT_OPTIONS = [
  { value: '', label: 'תשלום שוטף (אשראי)' },
  { value: 'cash', label: 'מזומן' },
  { value: 'card', label: 'כרטיס אשראי' },
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'check_postdated', label: 'צ\'ק דחוי' },
  { value: 'installments', label: 'תשלומים' },
] as const;

export function SalesInvoiceForm({
  companyId,
  today,
  customers,
  submitAction,
}: SalesInvoiceFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  function onCustomerSelect(id: string) {
    const cust = customers.find((c) => c.id === id) ?? null;
    setSelectedCustomer(cust);
  }

  return (
    <form
      action={submitAction}
      className="bg-white border border-ink-200 rounded-xl p-6 space-y-5"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <Section title="סוג מסמך">
        <SelectField
          name="docType"
          label="סוג"
          options={[...DOC_TYPE_OPTIONS]}
          defaultValue="tax_invoice"
          required
        />
      </Section>

      <Section title="פרטי הלקוח">
        {customers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1">
              בחר לקוח קיים מהמאסטר (אופציונלי)
            </label>
            <select
              onChange={(e) => onCustomerSelect(e.target.value)}
              defaultValue=""
              className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">— הזנה ידנית —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.internal_code})
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-400 mt-1">
              בחירה תמלא אוטומטית את שם הלקוח, ע.מ והקוד; ניתן לעדכן ידנית בשדות למטה.
            </p>
          </div>
        )}

        {selectedCustomer && (
          <input type="hidden" name="customerId" value={selectedCustomer.id} />
        )}

        <Field
          name="customerName"
          label="שם הלקוח"
          defaultValue={selectedCustomer?.name ?? ''}
          placeholder='לדוגמה: שיווק והפצה בע"מ'
          required
          key={`name-${selectedCustomer?.id ?? 'manual'}`}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="customerTaxId"
            label="ע.מ / ת.ז של הלקוח"
            defaultValue={selectedCustomer?.tax_id ?? ''}
            placeholder="9 ספרות"
            dir="ltr"
            key={`tax-${selectedCustomer?.id ?? 'manual'}`}
          />
          <Field
            name="customerInternalCode"
            label="קוד פנימי בפריוריטי"
            defaultValue={selectedCustomer?.internal_code ?? ''}
            placeholder='לדוגמה: 120-1'
            dir="ltr"
            required
            key={`code-${selectedCustomer?.id ?? 'manual'}`}
          />
        </div>
      </Section>

      <Section title="פרטי החשבונית">
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="invoiceNumber"
            label="מס׳ חשבונית"
            placeholder='לדוגמה: INV-1001'
            dir="ltr"
            required
          />
          <Field
            name="invoiceDate"
            label="תאריך החשבונית"
            type="date"
            defaultValue={today}
            dir="ltr"
            required
          />
        </div>
        <SelectField
          name="currency"
          label="מטבע"
          options={[
            { value: 'ILS', label: 'ILS (שקל)' },
            { value: 'USD', label: 'USD (דולר)' },
            { value: 'EUR', label: 'EUR (יורו)' },
            { value: 'GBP', label: 'GBP (לירה)' },
          ]}
          defaultValue="ILS"
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
          <Field
            name="total"
            label='סך הכול (כולל מע"מ)'
            type="number"
            step="0.01"
            dir="ltr"
            required
          />
        </div>
        <Field
          name="lineDescription"
          label="תיאור (אופציונלי)"
          placeholder='לדוגמה: ייעוץ עסקי חודשי'
        />
      </Section>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-accent-600 hover:text-accent-500 select-none flex items-center gap-1">
          <span className="transition group-open:rotate-90 inline-block">▸</span>
          הגדרות מתקדמות (תרחישים מיוחדים)
        </summary>
        <div className="mt-4 space-y-4">
          <Section title="אופן תשלום">
            <SelectField
              name="paymentMethod"
              label="שיטת תשלום"
              options={[...PAYMENT_OPTIONS]}
              defaultValue=""
              hint='קובע אם ה-JE זוקף ללקוח, לבנק/קופה, או לסולק אשראי'
            />
            <Field
              name="installmentsCount"
              label='מספר תשלומים (ל-payment_method=installments)'
              type="number"
              dir="ltr"
              placeholder='3'
            />
          </Section>

          <Section title="ניכוי במקור">
            <Field
              name="customerWithholdingPercent"
              label='אחוז ניכוי במקור מהלקוח (%)'
              type="number"
              step="0.01"
              dir="ltr"
              placeholder='לדוגמה: 5'
              hint='לקוחות B2G (ממשלה, רשויות) שמנכים מהחשבונית שלך'
            />
          </Section>

          <Section title="ייצוא ופטור מע&quot;מ">
            <Field
              name="exportCountry"
              label='מדינת יעד לייצוא (קוד ISO)'
              placeholder='לדוגמה: US'
              dir="ltr"
              hint='אם מסומן — מע"מ 0% (ייצוא)'
            />
            <Field
              name="vatExemptReason"
              label='סיבת פטור מע"מ'
              placeholder='לדוגמה: אילת'
              hint='לעסקאות פטורות (אילת, תיירים)'
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
              hint='נדרש אם המטבע אינו ILS. לא מוזן — מולא אוטומטית מ-BOI'
            />
          </Section>

          <Section title='מרכז עלות'>
            <Field
              name="costCenter"
              label='מרכז עלות / פרויקט'
              placeholder='לדוגמה: PROJ-A'
              dir="ltr"
            />
          </Section>

          <Section title='חוב אבוד (מחיקה)'>
            <Field
              name="badDebtOriginalInvoice"
              label='מס׳ החשבונית המקורית שנמחקה'
              placeholder='לדוגמה: INV-980'
              dir="ltr"
              hint='לתרחיש AR_BAD_DEBT — הפניה לחשבונית שלא נגבתה'
            />
          </Section>
        </div>
      </details>

      <div className="flex justify-end gap-3 pt-3 border-t border-ink-100">
        <Link
          href={`/dashboard/c/${companyId}/sales-invoices`}
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
  placeholder?: string | undefined;
  type?: string | undefined;
  step?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  defaultValue?: string | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
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

function SelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  hint,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
