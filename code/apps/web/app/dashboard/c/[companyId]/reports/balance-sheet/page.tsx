import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  aggregateByAccount,
  fetchJELines,
  loadAccountMeta,
  type AccountAggregate,
} from '@/lib/reports/aggregator';
import { PeriodSelector, PrintHeader } from '../period-selector';

export const dynamic = 'force-dynamic';

/**
 * Balance Sheet — snapshot at "as of" date.
 * Uses cumulative balances from inception of the company until the chosen
 * date (no "from" — only "to"). The to-date defaults to today, can be set
 * via ?as_of=YYYY-MM-DD or preset.
 */
export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { as_of?: string; preset?: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const today = new Date().toISOString().slice(0, 10);
  const asOf =
    searchParams.as_of && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.as_of)
      ? searchParams.as_of
      : today;

  // Pull all JE lines from inception to as-of date.
  const lines = await fetchJELines(company.id, { from: '2000-01-01', to: asOf });
  const accountCodes = Array.from(new Set(lines.map((l) => l.account)));
  const accountMeta = await loadAccountMeta(company.id, accountCodes);
  const aggregates = aggregateByAccount(lines, accountMeta);

  // Compute net P&L from inception → flows into retained earnings on equity side.
  const incomeBalance = aggregates
    .filter((a) => a.type === 'income')
    .reduce((s, a) => s + (a.totalCredit - a.totalDebit), 0);
  const expenseBalance = aggregates
    .filter((a) => a.type === 'expense')
    .reduce((s, a) => s + (a.totalDebit - a.totalCredit), 0);
  const accumulatedProfit = incomeBalance - expenseBalance;

  const assets = aggregates
    .filter((a) => a.type === 'asset')
    .map((a) => ({ ...a, displayAmount: a.totalDebit - a.totalCredit }))
    .filter((a) => Math.abs(a.displayAmount) >= 0.005)
    .sort((a, b) => a.code.localeCompare(b.code));

  const liabilities = aggregates
    .filter((a) => a.type === 'liability')
    .map((a) => ({ ...a, displayAmount: a.totalCredit - a.totalDebit }))
    .filter((a) => Math.abs(a.displayAmount) >= 0.005)
    .sort((a, b) => a.code.localeCompare(b.code));

  const equity = aggregates
    .filter((a) => a.type === 'equity')
    .map((a) => ({ ...a, displayAmount: a.totalCredit - a.totalDebit }))
    .filter((a) => Math.abs(a.displayAmount) >= 0.005)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalAssets = assets.reduce((s, r) => s + r.displayAmount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.displayAmount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.displayAmount, 0);
  const totalLiabilitiesPlusEquityWithProfit = totalLiabilities + totalEquity + accumulatedProfit;
  const balanceDiff = totalAssets - totalLiabilitiesPlusEquityWithProfit;

  const csvUrl = `/api/reports/balance-sheet-csv?companyId=${company.id}&as_of=${asOf}`;

  return (
    <div className="space-y-5">
      <PrintHeader
        companyName={company.name}
        reportTitle="מאזן"
        rangeLabel={`נכון ל-${asOf}`}
      />

      <BalanceSheetPeriodSelector
        companyId={company.id}
        asOf={asOf}
        csvUrl={csvUrl}
      />

      {aggregates.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-sm text-ink-500">
          אין תנועות עד תאריך זה.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <KPI label="סך נכסים" value={fmt(totalAssets)} tone="blue" />
            <KPI label="סך התחייבויות" value={fmt(totalLiabilities)} tone="amber" />
            <KPI
              label="סך הון + רווחים"
              value={fmt(totalEquity + accumulatedProfit)}
              tone="emerald"
            />
          </section>

          <div className="grid lg:grid-cols-2 gap-4 print:grid-cols-2">
            {/* Assets side */}
            <Section
              title="נכסים"
              items={assets}
              total={totalAssets}
              tone="blue"
            />

            {/* Liabilities + Equity side */}
            <div className="space-y-4">
              <Section
                title="התחייבויות"
                items={liabilities}
                total={totalLiabilities}
                tone="amber"
              />
              <Section
                title="הון"
                items={equity}
                total={totalEquity}
                tone="emerald"
                extraRows={[
                  {
                    code: '—',
                    name: accumulatedProfit >= 0 ? 'יתרת רווחים מצטברת' : 'יתרת הפסדים מצטברת',
                    displayAmount: accumulatedProfit,
                    inferred: false,
                  },
                ]}
                grandTotal={totalEquity + accumulatedProfit}
              />
            </div>
          </div>

          <section
            className={`rounded-lg border p-4 flex items-center justify-between ${
              Math.abs(balanceDiff) < 0.05
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div>
              <div className="text-xs text-ink-700">בדיקת איזון: נכסים = התחייבויות + הון</div>
              <div className="text-sm font-medium text-ink-900 mt-0.5" dir="ltr">
                {fmt(totalAssets)} {Math.abs(balanceDiff) < 0.05 ? '=' : '≠'} {fmt(totalLiabilitiesPlusEquityWithProfit)}
              </div>
            </div>
            <div className={`text-sm font-semibold ${Math.abs(balanceDiff) < 0.05 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {Math.abs(balanceDiff) < 0.05 ? 'מאוזן ✓' : `הפרש: ${fmt(balanceDiff)} ₪`}
            </div>
          </section>
        </>
      )}

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed print:hidden">
        <strong>המאזן</strong> מציג מצב כספי <strong>מצטבר</strong> מהיווצרות החברה
        (או הזנת יתרות פתיחה) ועד התאריך הנבחר. <strong>יתרת רווחים מצטברת</strong>
        מחושבת אוטומטית כסך כל ההכנסות פחות סך כל ההוצאות. אם הפרש &gt; 0 — בדוק
        שכל פקודות היומן מאוזנות (debit = credit) או שיש יתרות פתיחה חסרות.
      </div>
    </div>
  );
}

function BalanceSheetPeriodSelector({
  companyId,
  asOf,
  csvUrl,
}: {
  companyId: string;
  asOf: string;
  csvUrl: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const lastYear = `${new Date().getFullYear() - 1}-12-31`;

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-4 space-y-3 print:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
            נכון לתאריך
          </span>
          <span className="text-sm text-ink-900 font-medium" dir="ltr">{asOf}</span>
        </div>
        <div className="flex gap-2">
          <a
            href={csvUrl}
            download
            className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md"
          >
            ייצוא CSV
          </a>
        </div>
      </div>
      <form className="flex flex-wrap items-center gap-2" action={`/dashboard/c/${companyId}/reports/balance-sheet`}>
        <PresetButton href={`/dashboard/c/${companyId}/reports/balance-sheet?as_of=${today}`} label="היום" active={asOf === today} />
        <PresetButton href={`/dashboard/c/${companyId}/reports/balance-sheet?as_of=${lastYear}`} label="סוף שנה קודמת" active={asOf === lastYear} />
        <input
          type="date"
          name="as_of"
          defaultValue={asOf}
          className="px-2 py-1.5 border border-ink-200 rounded-md text-sm mr-auto"
          dir="ltr"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md"
        >
          הצג
        </button>
      </form>
    </section>
  );
}

function PresetButton({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`px-3 py-1.5 text-xs rounded-md border ${
        active
          ? 'bg-accent-500/10 text-accent-700 border-accent-200'
          : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
      }`}
    >
      {label}
    </a>
  );
}

interface SectionItem {
  code: string;
  name: string;
  displayAmount: number;
  inferred?: boolean;
  source?: 'master' | 'inferred';
}

function Section({
  title,
  items,
  total,
  tone,
  extraRows,
  grandTotal,
}: {
  title: string;
  items: Array<AccountAggregate & { displayAmount: number }>;
  total: number;
  tone: 'blue' | 'amber' | 'emerald';
  extraRows?: SectionItem[];
  grandTotal?: number;
}) {
  const headerBg =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-800 border-blue-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200';

  return (
    <div className="bg-white border border-ink-200 rounded-xl overflow-hidden print:border print:rounded-none">
      <div className={`px-4 py-2 border-b font-semibold text-sm ${headerBg}`}>{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {items.length === 0 && (!extraRows || extraRows.length === 0) ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-xs text-ink-500">
                אין יתרות
              </td>
            </tr>
          ) : (
            <>
              {items.map((r) => (
                <tr key={r.code} className="border-b border-ink-100">
                  <td className="px-3 py-1.5 text-ink-700 font-mono text-xs w-24" dir="ltr">{r.code}</td>
                  <td className="px-3 py-1.5 text-ink-700 text-xs">
                    {r.name}
                    {r.source === 'inferred' && (
                      <span className="text-[9px] text-amber-600 mr-1.5" title="לא במאסטר">?</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-left tabular-nums text-xs w-32" dir="ltr">
                    {fmt(r.displayAmount)}
                  </td>
                </tr>
              ))}
              {extraRows?.map((r, i) => (
                <tr key={`extra-${i}`} className="border-b border-ink-100 bg-ink-50/30">
                  <td className="px-3 py-1.5 text-ink-500 text-xs italic" dir="ltr">{r.code}</td>
                  <td className="px-3 py-1.5 text-ink-700 text-xs italic">{r.name}</td>
                  <td className={`px-3 py-1.5 text-left tabular-nums text-xs italic ${r.displayAmount < 0 ? 'text-red-700' : ''}`} dir="ltr">
                    {fmt(r.displayAmount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-xs text-ink-800">
                  סך {title}
                </td>
                <td className="px-3 py-2 text-left tabular-nums text-xs" dir="ltr">
                  {fmt(grandTotal ?? total)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'amber' | 'emerald' }) {
  const accentBg = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4">
      <div className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${accentBg}`}>
        {label}
      </div>
      <div className="text-xl font-bold text-ink-900 mt-2 tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
