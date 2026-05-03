'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ScanLine, Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { ExtractedInvoice } from '@priority-cpa/ocr-azure';

export interface FormDefaults {
  supplierName: string;
  supplierTaxId: string;
  supplierInternalCode: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  subtotal: string;
  total: string;
}

export function NewInvoiceForm({
  companyId,
  today,
  initialDefaults,
  submitAction,
}: {
  companyId: string;
  today: string;
  initialDefaults: FormDefaults;
  submitAction: (formData: FormData) => Promise<void>;
}) {
  const [defaults, setDefaults] = useState<FormDefaults>(initialDefaults);
  // formKey forces the form to re-mount when OCR sets new defaults so
  // the inputs pick up the new defaultValue props.
  const [formKey, setFormKey] = useState(0);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [extractionMeta, setExtractionMeta] = useState<{
    source: ExtractedInvoice['source'];
    fileName: string;
    confidence: number;
    pdfStored: boolean;
  } | null>(null);

  function applyExtraction(
    extracted: ExtractedInvoice,
    fileName: string,
    storedPdfPath: string | null,
  ) {
    setDefaults((prev) => ({
      ...prev,
      ...(extracted.supplier?.name ? { supplierName: extracted.supplier.name } : {}),
      ...(extracted.supplier?.tax_id ? { supplierTaxId: extracted.supplier.tax_id } : {}),
      ...(extracted.invoice?.number ? { invoiceNumber: extracted.invoice.number } : {}),
      ...(extracted.invoice?.date ? { invoiceDate: extracted.invoice.date } : {}),
      ...(extracted.invoice?.currency ? { currency: extracted.invoice.currency } : {}),
      ...(extracted.totals?.subtotal !== undefined
        ? { subtotal: String(extracted.totals.subtotal) }
        : {}),
      ...(extracted.totals?.total !== undefined
        ? { total: String(extracted.totals.total) }
        : {}),
    }));
    setPdfPath(storedPdfPath);
    setExtractionMeta({
      source: extracted.source,
      fileName,
      confidence: extracted.confidence,
      pdfStored: storedPdfPath !== null,
    });
    setFormKey((k) => k + 1);
  }

  return (
    <div className="space-y-4">
      <Dropzone companyId={companyId} onExtracted={applyExtraction} />

      {extractionMeta && (
        <ExtractionBanner
          source={extractionMeta.source}
          fileName={extractionMeta.fileName}
          confidence={extractionMeta.confidence}
          pdfStored={extractionMeta.pdfStored}
        />
      )}

      <form
        key={formKey}
        action={submitAction}
        className="bg-white border border-ink-200 rounded-xl p-6 space-y-5"
      >
        <input type="hidden" name="companyId" value={companyId} />
        {pdfPath && <input type="hidden" name="pdfPath" value={pdfPath} />}

        <Section title="פרטי הספק">
          <Field
            name="supplierName"
            label="שם הספק"
            defaultValue={defaults.supplierName}
            placeholder='לדוגמה: שיווק והספקה וירטהיים בע"מ'
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="supplierTaxId"
              label='ע.מ הספק'
              defaultValue={defaults.supplierTaxId}
              placeholder="9 ספרות"
              dir="ltr"
              required
            />
            <Field
              name="supplierInternalCode"
              label="קוד ספק בפריוריטי"
              defaultValue={defaults.supplierInternalCode}
              placeholder='לדוגמה: 200087'
              dir="ltr"
              required
            />
          </div>
        </Section>

        <Section title="פרטי החשבונית">
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="invoiceNumber"
              label="מס׳ חשבונית"
              defaultValue={defaults.invoiceNumber}
              placeholder='לדוגמה: 4427930'
              dir="ltr"
              required
            />
            <Field
              name="invoiceDate"
              label="תאריך חשבונית"
              defaultValue={defaults.invoiceDate || today}
              type="date"
              dir="ltr"
              required
            />
          </div>
          <SelectField
            name="currency"
            label="מטבע"
            options={['ILS', 'USD', 'EUR', 'GBP']}
            defaultValue={defaults.currency}
          />
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
              defaultValue={defaults.subtotal}
              type="number"
              step="0.01"
              dir="ltr"
              required
            />
            <Field
              name="total"
              label='סך הכול (כולל מע"מ)'
              defaultValue={defaults.total}
              type="number"
              step="0.01"
              dir="ltr"
              required
            />
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
                  { value: 'vehicle', label: 'רכב פרטי M1 — 2/3 מנוכה' },
                  { value: 'commercial_vehicle', label: 'רכב מסחרי N1 / טנדר — 100% מנוכה' },
                  { value: 'motorcycle_small', label: 'אופנוע ≤125 סמ"ק — 100% מנוכה' },
                  { value: 'motorcycle_large', label: 'אופנוע >125 סמ"ק — 2/3 מנוכה' },
                  { value: 'mobile_phone_full_business', label: 'נייד עסקי בלבד — 100% מנוכה' },
                  { value: 'mobile_phone_partial', label: 'נייד מעורב (רוב עסקי) — 2/3 מנוכה' },
                  { value: 'mobile_phone_personal_majority', label: 'נייד מעורב (רוב פרטי) — 1/3 מנוכה' },
                  { value: 'meals', label: 'אש"ל רגיל — 1/4 מנוכה' },
                  { value: 'late_meals', label: 'ארוחות לאחר 8 שעות — 100% מנוכה' },
                  { value: 'gifts_above_threshold', label: 'מתנות מעל הרף (~210₪/שנה) — 0%' },
                  { value: 'foreign_trip', label: 'נסיעות חו"ל — 0%' },
                  { value: 'non_deductible', label: 'לא מנוכה כלל — 0%' },
                ]}
                hint='המערכת תפצל את ה-JE לחלק מנוכה ולחלק לא-מנוכה (אם רלוונטי)'
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

            <Section title='מרכז עלות'>
              <Field
                name="costCenter"
                label='מרכז עלות / פרויקט'
                placeholder='לדוגמה: PROJ-A'
                dir="ltr"
                hint='תיוג פנימי לדוחות חיתוך. עובר אוטומטית לפורמט FLEXIBLE בייצוא'
              />
            </Section>

            <Section title='פיצול הוצאה לקטגוריות (Multi-Expense)'>
              <p className="text-xs text-ink-600 -mt-1">
                אם החשבונית מכילה כמה סוגי הוצאות (לדוגמה: חומרי גלם + שירותים),
                מלא את שני הפיצולים. סך הפיצולים צריך להיות שווה לסכום הביניים.
              </p>
              <div className="bg-white border border-ink-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-ink-600">פיצול 1</div>
                <div className="grid grid-cols-3 gap-2">
                  <Field name="split1Account" label='חשבון' placeholder='503-0' dir="ltr" />
                  <Field name="split1Amount" label='סכום' type="number" step="0.01" dir="ltr" />
                  <Field name="split1Label" label='תיאור' placeholder='חומרי גלם' />
                </div>
              </div>
              <div className="bg-white border border-ink-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-ink-600">פיצול 2</div>
                <div className="grid grid-cols-3 gap-2">
                  <Field name="split2Account" label='חשבון' placeholder='504-0' dir="ltr" />
                  <Field name="split2Amount" label='סכום' type="number" step="0.01" dir="ltr" />
                  <Field name="split2Label" label='תיאור' placeholder='שירותים' />
                </div>
              </div>
            </Section>
          </div>
        </details>

        <div className="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <Link
            href={`/dashboard/c/${companyId}/invoices`}
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
    </div>
  );
}

/* ====================== dropzone ====================== */

function Dropzone({
  companyId,
  onExtracted,
}: {
  companyId: string;
  onExtracted: (
    extracted: ExtractedInvoice,
    fileName: string,
    pdfPath: string | null,
  ) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      try {
        const r = await fetch(
          `/api/invoices/ocr?companyId=${encodeURIComponent(companyId)}`,
          { method: 'POST', body: fd },
        );
        const json = (await r.json()) as
          | {
              ok: true;
              extracted: ExtractedInvoice;
              fileName: string;
              pdfPath: string | null;
            }
          | { ok?: false; error?: string };
        if (!r.ok || !('ok' in json) || !json.ok) {
          setError(('error' in json && json.error) || 'חילוץ נכשל');
          return;
        }
        onExtracted(json.extracted, json.fileName, json.pdfPath);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בלתי צפויה');
      }
    });
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`block bg-brand-radial text-white rounded-xl p-5 border-2 border-dashed cursor-pointer transition ${
          isDragging
            ? 'border-brand-glow shadow-glow'
            : 'border-white/20 hover:border-white/40'
        }`}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          disabled={pending}
        />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 text-brand-glow flex items-center justify-center flex-shrink-0">
            {pending ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
          </div>
          <div className="flex-1">
            <div className="font-semibold">
              {pending ? 'מחלץ פרטי חשבונית...' : 'גרור PDF של חשבונית או לחץ לבחירה'}
            </div>
            <div className="text-white/70 text-xs mt-0.5">
              {pending
                ? 'שולח ל-Azure Document Intelligence — לוקח כ-3-5 שניות'
                : 'המערכת תזהה אוטומטית: שם ספק, ע.מ, מספר חשבונית, תאריך, סכומים. מקסימום 10MB.'}
            </div>
          </div>
          <ScanLine size={24} className="text-brand-glow/60 flex-shrink-0" />
        </div>
      </label>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function ExtractionBanner({
  source,
  fileName,
  confidence,
  pdfStored,
}: {
  source: ExtractedInvoice['source'];
  fileName: string;
  confidence: number;
  pdfStored: boolean;
}) {
  const isMock = source === 'mock';
  const tone = isMock
    ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800' };
  return (
    <div
      className={`flex items-start gap-2 text-sm ${tone.bg} ${tone.text} border ${tone.border} rounded-lg p-3`}
    >
      {isMock ? (
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <div className="font-medium">
          {isMock ? 'הצגת mock — לא חולץ מ-Azure' : 'חולץ מהקובץ — בדוק את הערכים'}
        </div>
        <div className="text-xs mt-0.5 opacity-80 leading-relaxed">
          <span dir="ltr" className="font-mono">
            {fileName}
          </span>
          {!isMock && confidence > 0 && (
            <span> · ביטחון ממוצע {Math.round(confidence * 100)}%</span>
          )}
          {pdfStored && <span> · ה-PDF נשמר ויוצג בעמוד החשבונית</span>}
          {isMock && (
            <span>
              {' '}
              · הוסף <code dir="ltr">AZURE_DOC_INTELLIGENCE_ENDPOINT</code> ו-
              <code dir="ltr">AZURE_DOC_INTELLIGENCE_KEY</code> ב-Vercel
              להפעלת חילוץ אמיתי
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== form helpers ====================== */

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

function CheckboxField({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint?: string | undefined;
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
  defaultValue?: string | undefined;
  hint?: string | undefined;
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
