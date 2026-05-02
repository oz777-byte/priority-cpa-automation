import Link from 'next/link';
import { BarChart3, Download, Calendar, FileText } from 'lucide-react';
import { CanonicalInvoiceSchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  currentBimonthly,
  currentMonth,
  previousBimonthly,
  previousMonth,
  type DateRange,
} from './period';

export const dynamic = 'force-dynamic';

interface InvoiceForReport {
  id: string;
  status: string;
  supplierName: string;
  supplierTaxId: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  subtotal: number;
  vat: number;
  total: number;
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { from?: string; to?: string; preset?: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const presets = {
    current_bm: currentBimonthly(),
    previous_bm: previousBimonthly(),
    current_m: currentMonth(),
    previous_m: previousMonth(),
  } as const;

  const range: DateRange = resolveRange(searchParams, presets);

  const admin = getAdminClient();
  const { data: rawInvoices } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical')
    .eq('company_id', company.id)
    .neq('status', 'error');

  const allInvoices: InvoiceForReport[] = (
    (rawInvoices ?? []) as Array<{ id: string; status: string; canonical: unknown }>
  )
    .map((row): InvoiceForReport | null => {
      const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
      if (!parsed.success) return null;
      const c = parsed.data;
      const subtotal = c.totals.subtotal;
      const total = c.totals.total;
      const vat = Math.round((total - subtotal) * 100) / 100;
      return {
        id: row.id,
        status: row.status,
        supplierName: c.supplier.name,
        supplierTaxId: c.supplier.tax_id,
        invoiceNumber: c.invoice.number,
        date: c.invoice.date,
        currency: c.invoice.currency,
        subtotal,
        vat,
        total,
      };
    })
    .filter((r): r is InvoiceForReport => r !== null);

  const invoices: InvoiceForReport[] = allInvoices
    .filter((r) => r.date >= range.from && r.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = invoices.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      subtotal: acc.subtotal + r.subtotal,
      vat: acc.vat + r.vat,
      total: acc.total + r.total,
    }),
    { count: 0, subtotal: 0, vat: 0, total: 0 },
  );

  const monthlyBuckets = bucketByMonth(invoices);

  const csvUrl = `/api/reports/vat-csv?companyId=${company.id}&from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <BarChart3 size={18} className="text-brand-500" />
          דוחות תקופתיים
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          סיכום מע"מ תשומות לתקופה — בסיס לדיווח PCN874 לרשות המסים. ייצוא
          CSV לבדיקה מעמיקה ב-Excel.
        </p>
      </div>

      {/* Period selector */}
      <section className="bg-white border border-ink-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-ink-500" />
          <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
            תקופת דיווח
          </span>
          <span className="text-sm text-ink-900 font-medium" dir="ltr">
            {range.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PresetLink
            companyId={company.id}
            preset="current_bm"
            label="תקופה נוכחית (דו־חודשי)"
            range={presets.current_bm}
            active={searchParams.preset === 'current_bm' || (!searchParams.preset && !searchParams.from)}
          />
          <PresetLink
            companyId={company.id}
            preset="previous_bm"
            label="תקופה קודמת (דו־חודשי)"
            range={presets.previous_bm}
            active={searchParams.preset === 'previous_bm'}
          />
          <PresetLink
            companyId={company.id}
            preset="current_m"
            label="חודש נוכחי"
            range={presets.current_m}
            active={searchParams.preset === 'current_m'}
          />
          <PresetLink
            companyId={company.id}
            preset="previous_m"
            label="חודש קודם"
            range={presets.previous_m}
            active={searchParams.preset === 'previous_m'}
          />
          <form
            className="flex items-center gap-2 mr-auto"
            action={`/dashboard/c/${company.id}/reports`}
          >
            <input type="hidden" name="preset" value="custom" />
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="px-2 py-1.5 border border-ink-200 rounded-md text-sm"
              dir="ltr"
            />
            <span className="text-ink-400 text-xs">→</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="px-2 py-1.5 border border-ink-200 rounded-md text-sm"
              dir="ltr"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md"
            >
              סנן
            </button>
          </form>
        </div>
      </section>

      {/* KPI summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="חשבוניות בתקופה" value={totals.count.toString()} accent="blue" />
        <KPI label='סך סכום ביניים' value={fmt(totals.subtotal)} accent="ink" />
        <KPI label='סך מע"מ תשומות' value={fmt(totals.vat)} accent="emerald" highlight />
        <KPI label='סך הכול עם מע"מ' value={fmt(totals.total)} accent="ink" />
      </section>

      {/* Monthly breakdown */}
      {monthlyBuckets.length > 0 && (
        <section className="bg-white border border-ink-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 bg-ink-50/40">
            <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              פירוט חודשי
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
                <th className="text-right px-3 py-2">חודש</th>
                <th className="text-left px-3 py-2 w-24">חשבוניות</th>
                <th className="text-left px-3 py-2 w-32">סכום ביניים</th>
                <th className="text-left px-3 py-2 w-32">מע"מ</th>
                <th className="text-left px-3 py-2 w-32">סך הכול</th>
              </tr>
            </thead>
            <tbody>
              {monthlyBuckets.map((b) => (
                <tr key={b.month} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2 text-ink-900" dir="ltr">{b.month}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{b.count}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(b.subtotal)}</td>
                  <td className="px-3 py-2 text-left tabular-nums text-emerald-700">{fmt(b.vat)}</td>
                  <td className="px-3 py-2 text-left tabular-nums font-medium">{fmt(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Detailed invoice list */}
      <section className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-ink-100 bg-ink-50/40">
          <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
            כל החשבוניות בתקופה ({invoices.length})
          </span>
          <a
            href={csvUrl}
            download
            className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md flex items-center gap-1.5"
          >
            <Download size={12} />
            ייצוא CSV
          </a>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={20} className="mx-auto text-ink-300 mb-2" />
            <div className="text-sm text-ink-600">אין חשבוניות בתקופה הזו.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
                <th className="text-right px-3 py-2">תאריך</th>
                <th className="text-right px-3 py-2">ספק</th>
                <th className="text-right px-3 py-2 w-28">ע.מ</th>
                <th className="text-right px-3 py-2 w-32">מס׳ חשבונית</th>
                <th className="text-left px-3 py-2 w-28">ביניים</th>
                <th className="text-left px-3 py-2 w-28">מע"מ</th>
                <th className="text-left px-3 py-2 w-28">סך הכול</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
                  <td className="px-3 py-2 text-ink-700" dir="ltr">{inv.date}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/c/${company.id}/invoices/${inv.id}`}
                      className="text-ink-900 hover:text-accent-600 hover:underline"
                    >
                      {inv.supplierName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-600 tabular-nums" dir="ltr">{inv.supplierTaxId}</td>
                  <td className="px-3 py-2 text-ink-700 font-mono" dir="ltr">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(inv.subtotal)}</td>
                  <td className="px-3 py-2 text-left tabular-nums text-emerald-700">{fmt(inv.vat)}</td>
                  <td className="px-3 py-2 text-left tabular-nums font-medium">{fmt(inv.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/60 font-semibold">
                <td colSpan={4} className="px-3 py-2.5 text-xs uppercase tracking-wider text-ink-700">
                  סך הכול
                </td>
                <td className="px-3 py-2.5 text-left tabular-nums">{fmt(totals.subtotal)}</td>
                <td className="px-3 py-2.5 text-left tabular-nums text-emerald-700">{fmt(totals.vat)}</td>
                <td className="px-3 py-2.5 text-left tabular-nums">{fmt(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <div className="text-xs text-ink-400 leading-relaxed bg-ink-50/40 border border-ink-100 rounded-lg p-3">
        <strong>הערה:</strong> דוח זה הוא בסיס להכנת PCN874 — דיווח מע"מ
        מקוון לרשות המסים. ייצוא של קובץ PCN874 מובנה (פורמט קבוע) יתווסף בהמשך.
        בינתיים — ייצוא CSV מאפשר בדיקה ידנית או ייבוא לתוכנת דיווח קיימת.
      </div>
    </div>
  );
}

/* ====================== building blocks ====================== */

function PresetLink({
  companyId,
  preset,
  label,
  range,
  active,
}: {
  companyId: string;
  preset: string;
  label: string;
  range: DateRange;
  active: boolean;
}) {
  const href = `/dashboard/c/${companyId}/reports?preset=${preset}&from=${range.from}&to=${range.to}`;
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-xs rounded-md border ${
        active
          ? 'bg-accent-500/10 text-accent-700 border-accent-200'
          : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
      }`}
    >
      {label}
    </Link>
  );
}

function KPI({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  accent: 'ink' | 'blue' | 'emerald';
  highlight?: boolean;
}) {
  const accentBg = {
    ink: 'bg-ink-50 text-ink-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[accent];
  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        highlight ? 'border-emerald-200 shadow-sm' : 'border-ink-200'
      }`}
    >
      <div
        className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${accentBg}`}
      >
        {label}
      </div>
      <div className="text-xl font-bold text-ink-900 mt-2 tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  );
}

function bucketByMonth(invoices: InvoiceForReport[]): Array<{
  month: string;
  count: number;
  subtotal: number;
  vat: number;
  total: number;
}> {
  const byMonth = new Map<
    string,
    { count: number; subtotal: number; vat: number; total: number }
  >();
  for (const inv of invoices) {
    const month = inv.date.slice(0, 7); // YYYY-MM
    const cur = byMonth.get(month) ?? { count: 0, subtotal: 0, vat: 0, total: 0 };
    cur.count += 1;
    cur.subtotal += inv.subtotal;
    cur.vat += inv.vat;
    cur.total += inv.total;
    byMonth.set(month, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sums]) => ({ month, ...sums }));
}

function fmt(n: number): string {
  return n.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function resolveRange(
  sp: { from?: string; to?: string; preset?: string },
  presets: {
    current_bm: DateRange;
    previous_bm: DateRange;
    current_m: DateRange;
    previous_m: DateRange;
  },
): DateRange {
  if (sp.from && sp.to) {
    return { from: sp.from, to: sp.to, label: `${sp.from} → ${sp.to}` };
  }
  if (sp.preset && sp.preset in presets) {
    return presets[sp.preset as keyof typeof presets];
  }
  return presets.current_bm;
}
