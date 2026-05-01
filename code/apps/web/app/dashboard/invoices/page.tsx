import Link from 'next/link';
import { loadPocInvoices } from '@/lib/poc-fixtures';
import { validateInvoice } from '@priority-cpa/je-validator';
import { TARI_VALIDATION_CONTEXT } from '@/lib/tari-context';

export default function InvoicesPage() {
  const invoices = loadPocInvoices();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">תור החשבוניות</h1>
          <p className="text-ink-600 mt-1 text-sm">
            חשבוניות מה-POC של טארי. ה-validation רץ בזמן אמת על כל אחת.
          </p>
        </div>
        <form action="/api/movein" method="post">
          <button
            type="submit"
            className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
          >
            הפק MOVEIN.DAT לשתיהן
          </button>
        </form>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 border-b border-ink-200 text-ink-600">
            <tr>
              <th className="text-right p-3 font-medium">ספק</th>
              <th className="text-right p-3 font-medium">מס׳ חשבונית</th>
              <th className="text-right p-3 font-medium">תאריך</th>
              <th className="text-right p-3 font-medium">סכום</th>
              <th className="text-right p-3 font-medium">סטטוס</th>
              <th className="text-right p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const result = validateInvoice(inv, {
                ...TARI_VALIDATION_CONTEXT,
                todayIso: new Date().toISOString().slice(0, 10),
              });
              const status = result.passed
                ? result.warnings.length > 0
                  ? 'warn'
                  : 'pass'
                : 'fail';
              return (
                <tr key={inv.slug} className="border-b border-ink-100 last:border-0">
                  <td className="p-3 text-ink-900">{inv.supplier.name}</td>
                  <td className="p-3 text-ink-700" dir="ltr">
                    {inv.invoice.number}
                  </td>
                  <td className="p-3 text-ink-700" dir="ltr">
                    {inv.invoice.date}
                  </td>
                  <td className="p-3 text-ink-900 font-medium">
                    {inv.totals.total.toFixed(2)} ₪
                  </td>
                  <td className="p-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/dashboard/invoices/${inv.slug}`}
                      className="text-accent-600 hover:underline"
                    >
                      פתח
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  const config = {
    pass: { bg: 'bg-green-100', text: 'text-green-800', label: 'מאושר' },
    warn: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'בדיקה' },
    fail: { bg: 'bg-red-100', text: 'text-red-800', label: 'חסום' },
  }[status];
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
