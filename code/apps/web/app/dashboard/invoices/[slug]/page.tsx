import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findPocInvoice } from '@/lib/poc-fixtures';
import { validateInvoice } from '@priority-cpa/je-validator';
import { buildRecord } from '@priority-cpa/movein-generator';
import { TARI_VALIDATION_CONTEXT, TARI_MOVEIN_CONFIG } from '@/lib/tari-context';

export default function InvoiceDetailPage({ params }: { params: { slug: string } }) {
  const inv = findPocInvoice(params.slug);
  if (!inv) notFound();

  const validation = validateInvoice(inv, {
    ...TARI_VALIDATION_CONTEXT,
    todayIso: new Date().toISOString().slice(0, 10),
  });

  const record = buildRecord(inv, TARI_MOVEIN_CONFIG);

  // Construct the JE preview from the canonical invoice (mirrors what
  // movein-generator emits row-by-row).
  const subtotal = inv.totals.subtotal;
  const total = inv.totals.total;
  const vat = Math.round((total - subtotal) * 100) / 100;
  const lines = [
    { account: '502-0', label: 'הוצאה — קניות', debit: subtotal, credit: 0 },
    { account: '205-2', label: 'מע"מ תשומות', debit: vat, credit: 0 },
    {
      account: inv.supplier.internal_code_priority,
      label: `ספק ${inv.supplier.name}`,
      debit: 0,
      credit: total,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/dashboard/invoices"
        className="text-sm text-accent-600 hover:underline"
      >
        ← חזרה לתור
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {inv.supplier.name}
          </h1>
          <p className="text-ink-600 mt-1 text-sm">
            חשבונית{' '}
            <span dir="ltr">{inv.invoice.number}</span> · תאריך{' '}
            <span dir="ltr">{inv.invoice.date}</span>
          </p>
        </div>
        <form action={`/api/movein?slug=${inv.slug}`} method="post">
          <button
            type="submit"
            className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
          >
            הורד MOVEIN.DAT
          </button>
        </form>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h2 className="font-semibold text-ink-900 mb-3">פרטי החשבונית</h2>
          <dl className="text-sm space-y-2">
            <Row label="ע.מ ספק">
              <span dir="ltr">{inv.supplier.tax_id}</span>
            </Row>
            <Row label="קוד ספק פנימי">
              <span dir="ltr">{inv.supplier.internal_code_priority}</span>
            </Row>
            <Row label="מטבע">
              <span dir="ltr">{inv.invoice.currency}</span>
            </Row>
            <Row label="סכום ביניים">{subtotal.toFixed(2)} ₪</Row>
            <Row label="מע&quot;מ (מחושב)">{vat.toFixed(2)} ₪</Row>
            <Row label="סה&quot;כ">
              <strong>{total.toFixed(2)} ₪</strong>
            </Row>
            {inv.invoice.allocation_number && (
              <Row label="מספר הקצאה">
                <span dir="ltr">{inv.invoice.allocation_number}</span>
              </Row>
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
                  <td className="py-2 tabular-nums">
                    {l.debit > 0 ? l.debit.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 tabular-nums">
                    {l.credit > 0 ? l.credit.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink-200">
              <tr>
                <td className="pt-2 text-ink-600 text-xs">סך</td>
                <td className="pt-2 tabular-nums font-semibold">
                  {(subtotal + vat).toFixed(2)}
                </td>
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
