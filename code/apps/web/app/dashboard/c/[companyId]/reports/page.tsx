import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  aggregateByAccount,
  fetchJELines,
  loadAccountMeta,
  resolveRangeFromQuery,
  type AccountAggregate,
  type AccountType,
} from '@/lib/reports/aggregator';
import { PeriodSelector, PrintHeader } from './period-selector';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'נכסים (100-199)',
  liability: 'התחייבויות (200-299)',
  equity: 'הון (300-399, 900-999)',
  income: 'הכנסות (400-499, 700-799)',
  expense: 'הוצאות (500-699, 800-899)',
};

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

export default async function TrialBalancePage({
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

  const grouped = groupByType(aggregates);
  const totalDr = aggregates.reduce((s, a) => s + a.totalDebit, 0);
  const totalCr = aggregates.reduce((s, a) => s + a.totalCredit, 0);

  const csvUrl = `/api/reports/trial-balance-csv?companyId=${company.id}&from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-5">
      <PrintHeader
        companyName={company.name}
        reportTitle="מאזן בוחן"
        rangeLabel={range.label}
      />

      <PeriodSelector
        basePath={`/dashboard/c/${company.id}/reports`}
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
        <div className="bg-white border border-ink-200 rounded-xl overflow-hidden print:border-0 print:rounded-none">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b-2 border-ink-200">
              <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                <th className="text-right px-3 py-2 w-24">חשבון</th>
                <th className="text-right px-3 py-2">שם</th>
                <th className="text-left px-3 py-2 w-20">תנועות</th>
                <th className="text-left px-3 py-2 w-32">סך חובה</th>
                <th className="text-left px-3 py-2 w-32">סך זכות</th>
                <th className="text-left px-3 py-2 w-32">יתרה</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.map((type) => {
                const items = grouped[type] ?? [];
                if (items.length === 0) return null;
                const grpDr = items.reduce((s, a) => s + a.totalDebit, 0);
                const grpCr = items.reduce((s, a) => s + a.totalCredit, 0);
                const grpBal = grpDr - grpCr;
                return (
                  <>
                    <tr key={`hdr-${type}`} className="bg-accent-50/40">
                      <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-accent-800 uppercase tracking-wider">
                        {TYPE_LABEL[type]}
                      </td>
                    </tr>
                    {items.map((a) => (
                      <tr key={a.code} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
                        <td className="px-3 py-1.5 text-ink-900 font-mono text-xs" dir="ltr">
                          {a.code}
                        </td>
                        <td className="px-3 py-1.5 text-ink-700">
                          {a.name}
                          {a.source === 'inferred' && (
                            <span className="text-[9px] text-amber-600 mr-1.5" title="חשבון לא במאסטר — שם נגזר אוטומטית">
                              ?
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-left tabular-nums text-ink-500 text-xs">{a.txCount}</td>
                        <td className="px-3 py-1.5 text-left tabular-nums" dir="ltr">{fmt(a.totalDebit)}</td>
                        <td className="px-3 py-1.5 text-left tabular-nums" dir="ltr">{fmt(a.totalCredit)}</td>
                        <td className={`px-3 py-1.5 text-left tabular-nums font-medium ${a.balance < 0 ? 'text-blue-700' : a.balance > 0 ? 'text-emerald-700' : 'text-ink-500'}`} dir="ltr">
                          {fmtSigned(a.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr key={`sub-${type}`} className="bg-ink-50/40 border-b-2 border-ink-200 font-semibold text-xs">
                      <td colSpan={3} className="px-3 py-1.5 text-ink-700">
                        סיכום ביניים — {TYPE_LABEL[type].split(' ')[0]}
                      </td>
                      <td className="px-3 py-1.5 text-left tabular-nums" dir="ltr">{fmt(grpDr)}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums" dir="ltr">{fmt(grpCr)}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums" dir="ltr">{fmtSigned(grpBal)}</td>
                    </tr>
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ink-900 text-white font-semibold">
                <td colSpan={3} className="px-3 py-2 text-xs uppercase tracking-wider">
                  סך כל המאזן
                </td>
                <td className="px-3 py-2 text-left tabular-nums" dir="ltr">{fmt(totalDr)}</td>
                <td className="px-3 py-2 text-left tabular-nums" dir="ltr">{fmt(totalCr)}</td>
                <td className="px-3 py-2 text-left tabular-nums" dir="ltr">
                  {Math.abs(totalDr - totalCr) < 0.05 ? (
                    <span className="text-emerald-300">מאוזן ✓</span>
                  ) : (
                    <span className="text-amber-300">{fmtSigned(totalDr - totalCr)}</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed print:hidden">
        <strong>המאזן הבוחן</strong> מציג את כל החשבונות שהיתה בהם תנועה בתקופה.
        <strong> יתרה חיובית</strong> (ירוק) = יתרת חובה (DR &gt; CR), טיפוסי לנכסים והוצאות.
        <strong> יתרה שלילית</strong> (כחול) = יתרת זכות, טיפוסי להתחייבויות, הון והכנסות.
        סימן <strong>?</strong> מציין חשבון שלא קיים במאסטר — שמו נגזר אוטומטית מהקוד.
      </div>
    </div>
  );
}

function groupByType(rows: AccountAggregate[]): Partial<Record<AccountType, AccountAggregate[]>> {
  const out: Partial<Record<AccountType, AccountAggregate[]>> = {};
  for (const r of rows) {
    (out[r.type] ??= []).push(r);
  }
  return out;
}

function fmt(n: number): string {
  return n.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSigned(n: number): string {
  if (Math.abs(n) < 0.005) return '0.00';
  return (n < 0 ? '(' + fmt(Math.abs(n)) + ')' : fmt(n));
}
