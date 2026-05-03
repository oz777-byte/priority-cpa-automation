import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  aggregateByAccount,
  fetchJELines,
  loadAccountMeta,
  resolveRangeFromQuery,
  type AccountAggregate,
} from '@/lib/reports/aggregator';
import { PeriodSelector, PrintHeader } from '../period-selector';

export const dynamic = 'force-dynamic';

export default async function ProfitLossPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { from?: string; to?: string; preset?: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const range = resolveRangeFromQuery(searchParams);

  const lines = await fetchJELines(company.id, range);
  const accountCodes = Array.from(new Set(lines.map((l) => l.account)));
  const accountMeta = await loadAccountMeta(company.id, accountCodes);
  const aggregates = aggregateByAccount(lines, accountMeta);

  // P&L = income (CR-normal) - expense (DR-normal).
  // For income accounts: balance = DR - CR; income is normally CR, so a CR balance is negative.
  // We display revenue as positive (the |CR - DR|) and expense as positive (the DR - CR).
  const incomeRows = aggregates
    .filter((a) => a.type === 'income')
    .map((a) => ({ ...a, displayAmount: a.totalCredit - a.totalDebit }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const expenseRows = aggregates
    .filter((a) => a.type === 'expense')
    .map((a) => ({ ...a, displayAmount: a.totalDebit - a.totalCredit }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalIncome = incomeRows.reduce((s, r) => s + r.displayAmount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.displayAmount, 0);
  const netProfit = totalIncome - totalExpense;

  // Sub-categorize expenses by code prefix for traditional P&L layout.
  const expensesByGroup = groupExpenses(expenseRows);

  const csvUrl = `/api/reports/profit-loss-csv?companyId=${company.id}&from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-5">
      <PrintHeader
        companyName={company.name}
        reportTitle="דוח רווח והפסד"
        rangeLabel={range.label}
      />

      <PeriodSelector
        basePath={`/dashboard/c/${company.id}/reports/profit-loss`}
        rangeLabel={range.label}
        rangeFrom={range.from}
        rangeTo={range.to}
        activePreset={searchParams.preset}
        exportHref={csvUrl}
      />

      {aggregates.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-sm text-ink-500">
          אין תנועות בתקופה הזו.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <KPI label="סך הכנסות" value={fmt(totalIncome)} accent="emerald" />
            <KPI label="סך הוצאות" value={fmt(totalExpense)} accent="amber" />
            <KPI
              label={netProfit >= 0 ? 'רווח נקי' : 'הפסד נקי'}
              value={fmt(Math.abs(netProfit))}
              accent={netProfit >= 0 ? 'emerald' : 'red'}
              highlight
            />
          </section>

          <section className="bg-white border border-ink-200 rounded-xl overflow-hidden print:border-0 print:rounded-none">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 border-b-2 border-ink-200">
                <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                  <th className="text-right px-3 py-2 w-24">חשבון</th>
                  <th className="text-right px-3 py-2">שם</th>
                  <th className="text-left px-3 py-2 w-36">סכום</th>
                </tr>
              </thead>
              <tbody>
                {/* Income */}
                <SectionHeader label="הכנסות" />
                {incomeRows.map((r) => (
                  <DataRow
                    key={r.code}
                    code={r.code}
                    name={r.name}
                    inferred={r.source === 'inferred'}
                    amount={r.displayAmount}
                    tone="emerald"
                  />
                ))}
                <SubtotalRow label="סך הכנסות" amount={totalIncome} tone="emerald" />

                {/* Expenses by group */}
                <SectionHeader label="הוצאות" />
                {Object.entries(expensesByGroup).map(([groupName, items]) => {
                  const groupTotal = items.reduce((s, r) => s + r.displayAmount, 0);
                  return (
                    <>
                      <tr key={`grp-${groupName}`} className="bg-ink-50/40">
                        <td colSpan={3} className="px-3 py-1.5 text-[11px] font-medium text-ink-700">
                          {groupName}
                        </td>
                      </tr>
                      {items.map((r) => (
                        <DataRow
                          key={r.code}
                          code={r.code}
                          name={r.name}
                          inferred={r.source === 'inferred'}
                          amount={r.displayAmount}
                          tone="amber"
                        />
                      ))}
                      <tr className="border-b border-ink-200 text-xs">
                        <td colSpan={2} className="px-3 py-1 text-ink-500 text-left pr-6">
                          סיכום ביניים — {groupName}
                        </td>
                        <td className="px-3 py-1 text-left tabular-nums text-ink-700" dir="ltr">
                          {fmt(groupTotal)}
                        </td>
                      </tr>
                    </>
                  );
                })}
                <SubtotalRow label="סך הוצאות" amount={totalExpense} tone="amber" />
              </tbody>
              <tfoot>
                <tr
                  className={`text-white font-semibold ${netProfit >= 0 ? 'bg-emerald-700' : 'bg-red-700'}`}
                >
                  <td colSpan={2} className="px-3 py-2.5 text-xs uppercase tracking-wider">
                    {netProfit >= 0 ? 'רווח נקי לפני מס' : 'הפסד נקי לפני מס'}
                  </td>
                  <td className="px-3 py-2.5 text-left tabular-nums" dir="ltr">
                    {fmt(Math.abs(netProfit))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed print:hidden">
            הדוח כולל את <strong>כל</strong> תנועות ההכנסות וההוצאות בתקופה — לפני התאמות
            סוף תקופה (PERIOD_ACCRUAL, FX_REVALUATION) ולפני סגירת שנה. רווח נקי =
            סך ההכנסות פחות סך ההוצאות.
          </div>
        </>
      )}
    </div>
  );
}

function groupExpenses(
  rows: Array<AccountAggregate & { displayAmount: number }>,
): Record<string, Array<AccountAggregate & { displayAmount: number }>> {
  const groups: Record<string, Array<AccountAggregate & { displayAmount: number }>> = {
    'עלות המכר (500-549)': [],
    'תפעוליות + ניהול (550-599)': [],
    'משכורות וסוציאליות (600-649)': [],
    'פיננסיות (620-699)': [],
    'אחר (700-899)': [],
  };
  for (const r of rows) {
    const n = parseInt(r.code.replace(/[^0-9]/g, '').slice(0, 3), 10);
    if (n >= 500 && n < 550) groups['עלות המכר (500-549)']!.push(r);
    else if (n >= 550 && n < 600) groups['תפעוליות + ניהול (550-599)']!.push(r);
    else if (n >= 600 && n < 620) groups['משכורות וסוציאליות (600-649)']!.push(r);
    else if (n >= 620 && n < 700) groups['פיננסיות (620-699)']!.push(r);
    else groups['אחר (700-899)']!.push(r);
  }
  // Drop empty groups.
  for (const k of Object.keys(groups)) {
    if (groups[k]!.length === 0) delete groups[k];
  }
  return groups;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-accent-50/60 border-b-2 border-accent-200">
      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold text-accent-800 uppercase tracking-wider">
        {label}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: 'emerald' | 'amber';
}) {
  const cls =
    tone === 'emerald' ? 'text-emerald-700' : 'text-amber-700';
  return (
    <tr className="bg-ink-50 border-b-2 border-ink-300 font-semibold">
      <td colSpan={2} className="px-3 py-2 text-xs text-ink-800">
        {label}
      </td>
      <td className={`px-3 py-2 text-left tabular-nums ${cls}`} dir="ltr">
        {fmt(amount)}
      </td>
    </tr>
  );
}

function DataRow({
  code,
  name,
  inferred,
  amount,
  tone,
}: {
  code: string;
  name: string;
  inferred: boolean;
  amount: number;
  tone: 'emerald' | 'amber';
}) {
  const cls = tone === 'emerald' ? 'text-emerald-700' : 'text-ink-700';
  return (
    <tr className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
      <td className="px-3 py-1.5 text-ink-700 font-mono text-xs" dir="ltr">{code}</td>
      <td className="px-3 py-1.5 text-ink-700 text-xs">
        {name}
        {inferred && <span className="text-[9px] text-amber-600 mr-1.5" title="לא במאסטר">?</span>}
      </td>
      <td className={`px-3 py-1.5 text-left tabular-nums text-xs ${cls}`} dir="ltr">
        {fmt(amount)}
      </td>
    </tr>
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
  accent: 'emerald' | 'amber' | 'red';
  highlight?: boolean;
}) {
  const accentBg = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[accent];
  const border =
    accent === 'emerald'
      ? 'border-emerald-200'
      : accent === 'amber'
        ? 'border-amber-200'
        : 'border-red-200';
  return (
    <div className={`bg-white border rounded-xl p-4 ${highlight ? `${border} shadow-sm` : 'border-ink-200'}`}>
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
