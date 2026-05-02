import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { validateInvoice } from '@priority-cpa/je-validator';
import { buildRecord } from '@priority-cpa/movein-generator';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  buildValidationContext,
  buildMoveInConfig,
  type CompanySettings,
} from '@/lib/company-config';
import { ApproveButton } from './approve-button';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({ params }: { params: { slug: string } }) {
  if (!UUID_RE.test(params.slug)) notFound();

  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) redirect('/dashboard/companies');

  const admin = getAdminClient();
  const { data: invRow } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical, created_at, company_id')
    .eq('id', params.slug)
    .maybeSingle();

  if (!invRow || invRow.company_id !== company.id) notFound();

  const parsed = CanonicalInvoiceSchema.safeParse(invRow.canonical);
  if (!parsed.success) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/dashboard/invoices" className="text-sm text-accent-600 hover:underline">
          ← חזרה לתור
        </Link>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
          נתוני חשבונית פגומים. לא ניתן להציג.
        </div>
      </div>
    );
  }
  const inv: CanonicalInvoice = parsed.data;
  const settings = (company.settings ?? {}) as CompanySettings;

  // Validate
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

  // Construct JE preview
  const subtotal = inv.totals.subtotal;
  const total = inv.totals.total;
  const vat = Math.round((total - subtotal) * 100) / 100;
  const lines = [
    {
      account: settings.expense_account ?? '502-0',
      label: 'הוצאה',
      debit: subtotal,
      credit: 0,
    },
    {
      account: settings.vat_input_account ?? '205-2',
      label: 'מע"מ תשומות',
      debit: vat,
      credit: 0,
    },
    {
      account: inv.supplier.internal_code_priority,
      label: `ספק ${inv.supplier.name}`,
      debit: 0,
      credit: total,
    },
  ];

  const isApproved = invRow.status === 'approved' || invRow.status === 'exported';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/dashboard/invoices" className="text-sm text-accent-600 hover:underline">
        ← חזרה לתור
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{inv.supplier.name}</h1>
          <p className="text-ink-600 mt-1 text-sm">
            חשבונית <span dir="ltr">{inv.invoice.number}</span> ·
            תאריך <span dir="ltr">{inv.invoice.date}</span> ·
            סטטוס: <strong>{statusLabel(invRow.status)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          {!isApproved && validation.passed && (
            <ApproveButton invoiceId={invRow.id as string} />
          )}
          {isApproved && (
            <form action={`/api/movein?slug=${invRow.id}`} method="post">
              <button
                type="submit"
                className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
              >
                הורד MOVEIN.DAT
              </button>
            </form>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h2 className="font-semibold text-ink-900 mb-3">פרטי החשבונית</h2>
          <dl className="text-sm space-y-2">
            <Row label="ע.מ ספק"><span dir="ltr">{inv.supplier.tax_id}</span></Row>
            <Row label="קוד ספק פנימי"><span dir="ltr">{inv.supplier.internal_code_priority}</span></Row>
            <Row label="מטבע"><span dir="ltr">{inv.invoice.currency}</span></Row>
            <Row label="סכום ביניים">{subtotal.toFixed(2)} ₪</Row>
            <Row label="מע&quot;מ (מחושב)">{vat.toFixed(2)} ₪</Row>
            <Row label="סה&quot;כ"><strong>{total.toFixed(2)} ₪</strong></Row>
            {inv.invoice.allocation_number && (
              <Row label="מספר הקצאה"><span dir="ltr">{inv.invoice.allocation_number}</span></Row>
            )}
          </dl>
        </div>

        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h2 className="font-semibold text-ink-900 mb-3">פקודת יומן מוצעת</h2>
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
            <tfoot className="border-t-2 border-ink-200">
              <tr>
                <td className="pt-2 text-ink-600 text-xs">סך</td>
                <td className="pt-2 tabular-nums font-semibold">{(subtotal + vat).toFixed(2)}</td>
                <td className="pt-2 tabular-nums font-semibold">{total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-ink-900">תוצאות validation</h2>
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

      <section className="bg-white border border-ink-200 rounded-xl p-5">
        <h2 className="font-semibold text-ink-900 mb-3">תצוגה גולמית של רשומת MOVEIN</h2>
        <pre className="text-xs bg-ink-100 p-3 rounded overflow-x-auto" dir="ltr">
{record}
        </pre>
        <p className="text-xs text-ink-400 mt-2">
          178 תווים + CR/LF = 180 בייטים. קידוד CP1255.
        </p>
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
  variant,
  code,
  message,
}: {
  variant: 'error' | 'warn';
  code: string;
  message: string;
}) {
  const styles =
    variant === 'error'
      ? 'bg-red-50 text-red-800 border-red-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <div className={`flex justify-between gap-3 border rounded p-2 mb-2 ${styles}`}>
      <span>{message}</span>
      <code className="text-xs opacity-70" dir="ltr">{code}</code>
    </div>
  );
}
