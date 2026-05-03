import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FileEdit, FileText, History } from 'lucide-react';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { validateInvoice } from '@priority-cpa/je-validator';
import { buildRecord } from '@priority-cpa/movein-generator';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { getInvoicePdfSignedUrl } from '@/lib/storage';
import {
  buildValidationContext,
  buildMoveInConfig,
  type CompanySettings,
} from '@/lib/company-config';
import { EditableField, ConfidenceBadge } from './editable-field';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({
  params,
}: {
  params: { companyId: string; invoiceId: string };
}) {
  if (!UUID_RE.test(params.invoiceId)) notFound();

  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const admin = getAdminClient();
  const { data: invRow } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical, created_at, company_id, pdf_path')
    .eq('id', params.invoiceId)
    .maybeSingle();

  if (!invRow || invRow.company_id !== company.id) notFound();

  const pdfPath = (invRow.pdf_path as string | null) ?? null;
  const pdfSignedUrl = pdfPath ? await getInvoicePdfSignedUrl(pdfPath) : null;

  const parsed = CanonicalInvoiceSchema.safeParse(invRow.canonical);
  if (!parsed.success) {
    return (
      <div className="space-y-4">
        <Link
          href={`/dashboard/c/${company.id}/invoices`}
          className="text-sm text-accent-600 hover:underline"
        >
          ← חזרה לחשבוניות
        </Link>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
          נתוני חשבונית פגומים. לא ניתן להציג.
        </div>
      </div>
    );
  }
  const inv: CanonicalInvoice = parsed.data;
  const settings = (company.settings ?? {}) as CompanySettings;

  const { data: suppliers } = await admin
    .from('suppliers')
    .select('internal_code')
    .eq('company_id', company.id);
  const supplierCodes = (suppliers ?? []).map((s) => s.internal_code as string);
  const knownAccounts = new Set<string>([
    settings.expense_account ?? '502-0',
    settings.vat_input_account ?? '205-2',
    ...supplierCodes,
  ]);
  const ctx = buildValidationContext(company.id, settings, knownAccounts, supplierCodes);
  const validation = validateInvoice(inv, ctx);

  const moveInConfig = buildMoveInConfig(settings);
  const record = buildRecord(inv, moveInConfig);

  const subtotal = inv.totals.subtotal;
  const total = inv.totals.total;
  const vat = Math.round((total - subtotal) * 100) / 100;

  // OCR confidence (overall, from canonical metadata).
  const ocrConfidence: number | null = (() => {
    const conf = inv.metadata?.ocr_confidence;
    return typeof conf === 'number' ? conf : null;
  })();

  // Count of prior OCR corrections on this invoice (for the badge).
  const { count: correctionsCountRaw } = await admin
    .from('ocr_corrections')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', params.invoiceId);
  const correctionsCount = correctionsCountRaw ?? 0;
  const lines = [
    { account: settings.expense_account ?? '502-0', label: 'הוצאה', debit: subtotal, credit: 0 },
    { account: settings.vat_input_account ?? '205-2', label: 'מע"מ תשומות', debit: vat, credit: 0 },
    { account: inv.supplier.internal_code_priority, label: `ספק ${inv.supplier.name}`, debit: 0, credit: total },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/dashboard/c/${company.id}/invoices`}
          className="text-sm text-accent-600 hover:underline flex items-center gap-1"
        >
          <ArrowRight size={14} />
          חזרה לרשימה
        </Link>
        <div className="flex items-center gap-2">
          {pdfSignedUrl && (
            <a
              href={pdfSignedUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-sm flex items-center gap-1.5"
            >
              <FileText size={14} />
              צפה ב-PDF המקורי
            </a>
          )}
          <Link
            href={`/dashboard/c/${company.id}/journal-entries`}
            className="px-3 py-1.5 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500 flex items-center gap-1.5"
          >
            <FileEdit size={14} />
            ערוך פקודת יומן
          </Link>
        </div>
      </div>

      <header>
        <h2 className="text-lg font-bold text-ink-900">
          <EditableField
            companyId={company.id}
            invoiceId={params.invoiceId}
            fieldPath="supplier.name"
            value={inv.supplier.name}
          />
        </h2>
        <p className="text-ink-600 mt-1 text-sm">
          חשבונית{' '}
          <EditableField
            companyId={company.id}
            invoiceId={params.invoiceId}
            fieldPath="invoice.number"
            value={inv.invoice.number}
            inputDir="ltr"
            displayValue={<span dir="ltr">{inv.invoice.number}</span>}
          />{' '}
          ·
          תאריך{' '}
          <EditableField
            companyId={company.id}
            invoiceId={params.invoiceId}
            fieldPath="invoice.date"
            value={inv.invoice.date}
            inputType="date"
            inputDir="ltr"
            displayValue={<span dir="ltr">{inv.invoice.date}</span>}
          />{' '}
          ·
          סטטוס: <strong>{statusLabel(invRow.status)}</strong>
          {ocrConfidence !== null && (
            <span className="mr-2">
              · <ConfidenceBadge confidence={ocrConfidence} />
            </span>
          )}
          {correctionsCount > 0 && (
            <span className="mr-2 text-xs text-purple-700 inline-flex items-center gap-1">
              · <History size={11} /> {correctionsCount} תיקוני OCR
            </span>
          )}
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-5">
          <h3 className="font-semibold text-ink-900 mb-3 flex items-center justify-between">
            <span>פרטי החשבונית</span>
            <span className="text-[10px] font-normal text-ink-500">
              עברו עם העכבר על שדה כדי לתקן
            </span>
          </h3>
          <dl className="text-sm space-y-2">
            <Row label="ע.מ ספק">
              <EditableField
                companyId={company.id}
                invoiceId={params.invoiceId}
                fieldPath="supplier.tax_id"
                value={inv.supplier.tax_id}
                inputDir="ltr"
                displayValue={<span dir="ltr">{inv.supplier.tax_id || '—'}</span>}
              />
            </Row>
            <Row label="קוד ספק פנימי"><span dir="ltr">{inv.supplier.internal_code_priority}</span></Row>
            <Row label="מטבע"><span dir="ltr">{inv.invoice.currency}</span></Row>
            <Row label="סכום ביניים">
              <EditableField
                companyId={company.id}
                invoiceId={params.invoiceId}
                fieldPath="totals.subtotal"
                value={String(subtotal)}
                inputType="number"
                inputDir="ltr"
                displayValue={<>{subtotal.toFixed(2)} ₪</>}
              />
            </Row>
            <Row label="מע&quot;מ (מחושב)">{vat.toFixed(2)} ₪</Row>
            <Row label="סה&quot;כ">
              <EditableField
                companyId={company.id}
                invoiceId={params.invoiceId}
                fieldPath="totals.total"
                value={String(total)}
                inputType="number"
                inputDir="ltr"
                displayValue={<strong>{total.toFixed(2)} ₪</strong>}
              />
            </Row>
            <Row label="מספר הקצאה">
              <EditableField
                companyId={company.id}
                invoiceId={params.invoiceId}
                fieldPath="invoice.allocation_number"
                value={inv.invoice.allocation_number ?? ''}
                inputDir="ltr"
                displayValue={<span dir="ltr">{inv.invoice.allocation_number ?? '—'}</span>}
              />
            </Row>
          </dl>
        </div>

        <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-5">
          <h3 className="font-semibold text-ink-900 mb-3">פקודת יומן מוצעת</h3>
          <table className="w-full text-sm">
            <thead className="text-ink-600">
              <tr>
                <th className="text-right pb-2 font-medium">חשבון</th>
                <th className="text-right pb-2 font-medium">חובה</th>
                <th className="text-right pb-2 font-medium">זכות</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.account} className="border-t border-ink-100">
                  <td className="py-2">
                    <div className="text-ink-900" dir="ltr">{l.account}</div>
                    <div className="text-xs text-ink-400">{l.label}</div>
                  </td>
                  <td className="py-2 tabular-nums">{l.debit > 0 ? l.debit.toFixed(2) : '—'}</td>
                  <td className="py-2 tabular-nums">{l.credit > 0 ? l.credit.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-400 mt-3">
            זוהי הצעה אוטומטית. עריכה סופית נעשית בעורך פקודות יומן.
          </p>
        </div>
      </section>

      <section className="bg-ink-50/60 border border-ink-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-ink-900">תוצאות validation</h3>
        <div className="text-sm">
          {validation.errors.length === 0 && validation.warnings.length === 0 && (
            <p className="text-green-700">כל הבדיקות עברו ללא הערות.</p>
          )}
          {validation.errors.map((err, i) => (
            <Issue key={`e${i}`} variant="error" code={err.code} message={err.messageHe} />
          ))}
          {validation.warnings.map((w, i) => (
            <Issue key={`w${i}`} variant="warn" code={w.code} message={w.messageHe} />
          ))}
        </div>
      </section>

      <section className="bg-ink-50/60 border border-ink-200 rounded-xl p-5">
        <h3 className="font-semibold text-ink-900 mb-3">תצוגה גולמית של רשומת MOVEIN (180 תו)</h3>
        <pre className="text-xs bg-white p-3 rounded border border-ink-200 overflow-x-auto" dir="ltr">
{record}
        </pre>
      </section>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'received': return 'התקבלה';
    case 'processing': return 'בעיבוד';
    case 'classified': return 'סווגה';
    case 'queued': return 'בתור';
    case 'approved': return 'אושרה';
    case 'exported': return 'יוצאה';
    case 'error': return 'שגיאה';
    default: return status;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-600">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  );
}

function Issue({
  variant, code, message,
}: { variant: 'error' | 'warn'; code: string; message: string }) {
  const styles = variant === 'error'
    ? 'bg-red-50 text-red-800 border-red-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <div className={`flex justify-between gap-3 border rounded p-2 mb-2 ${styles}`}>
      <span>{message}</span>
      <code className="text-xs opacity-70" dir="ltr">{code}</code>
    </div>
  );
}
