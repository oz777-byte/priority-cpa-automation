import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  fetchJELines,
  loadAccountMeta,
  resolveRangeFromQuery,
} from '@/lib/reports/aggregator';
import { PeriodSelector, PrintHeader } from '../period-selector';

export const dynamic = 'force-dynamic';

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { from?: string; to?: string; preset?: string; account?: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const range = resolveRangeFromQuery(searchParams);

  const allLines = await fetchJELines(company.id, range);
  const accountCodes = Array.from(new Set(allLines.map((l) => l.account))).sort();
  const accountMeta = await loadAccountMeta(company.id, accountCodes);

  const selectedAccount = searchParams.account;
  const lines = selectedAccount
    ? allLines
        .filter((l) => l.account === selectedAccount)
        .sort((a, b) => a.document_date.localeCompare(b.document_date))
    : [];

  // Compute running balance for the selected account.
  let running = 0;
  const linesWithBalance = lines.map((l) => {
    running += l.debit - l.credit;
    return { ...l, runningBalance: running };
  });

  const meta = selectedAccount ? accountMeta.get(selectedAccount) : null;
  const totalDr = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = lines.reduce((s, l) => s + l.credit, 0);

  const csvUrl = selectedAccount
    ? `/api/reports/general-ledger-csv?companyId=${company.id}&from=${range.from}&to=${range.to}&account=${encodeURIComponent(selectedAccount)}`
    : undefined;

  return (
    <div className="space-y-5">
      <PrintHeader
        companyName={company.name}
        reportTitle={meta ? `כרטסת חשבון — ${meta.code} ${meta.name}` : 'כרטסת חשבון'}
        rangeLabel={range.label}
      />

      <PeriodSelector
        basePath={`/dashboard/c/${company.id}/reports/general-ledger${selectedAccount ? `?account=${encodeURIComponent(selectedAccount)}` : ''}`}
        rangeLabel={range.label}
        rangeFrom={range.from}
        rangeTo={range.to}
        activePreset={searchParams.preset}
        exportHref={csvUrl}
      />

      <AccountPicker
        companyId={company.id}
        rangeFrom={range.from}
        rangeTo={range.to}
        preset={searchParams.preset ?? null}
        accountCodes={accountCodes}
        accountMeta={accountMeta}
        selectedAccount={selectedAccount ?? null}
      />

      {!selectedAccount ? (
        <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-6 text-center text-sm text-ink-600">
          בחר חשבון מהרשימה למעלה כדי לראות את כל התנועות בו.
        </div>
      ) : lines.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-sm text-ink-500">
          אין תנועות בחשבון {selectedAccount} בתקופה הזו.
        </div>
      ) : (
        <div className="bg-white border border-ink-200 rounded-xl overflow-hidden print:border-0 print:rounded-none">
          <div className="px-4 py-2 border-b border-ink-100 bg-ink-50/40 print:hidden">
            <span className="text-xs font-semibold text-ink-700">
              חשבון <span className="font-mono" dir="ltr">{meta?.code}</span> — {meta?.name} · {lines.length} תנועות
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b-2 border-ink-200">
              <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                <th className="text-right px-3 py-2 w-24">תאריך</th>
                <th className="text-right px-3 py-2 w-16">JE#</th>
                <th className="text-right px-3 py-2 w-32">אסמכתא</th>
                <th className="text-right px-3 py-2">תיאור</th>
                <th className="text-left px-3 py-2 w-28">חובה</th>
                <th className="text-left px-3 py-2 w-28">זכות</th>
                <th className="text-left px-3 py-2 w-32">יתרה רצה</th>
              </tr>
            </thead>
            <tbody>
              {linesWithBalance.map((l, i) => (
                <tr key={`${l.je_id}-${i}`} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
                  <td className="px-3 py-1.5 text-ink-700 text-xs" dir="ltr">{l.document_date}</td>
                  <td className="px-3 py-1.5 text-ink-500 text-xs tabular-nums" dir="ltr">
                    {l.je_number ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-ink-700 font-mono text-xs" dir="ltr">{l.reference1}</td>
                  <td className="px-3 py-1.5 text-ink-700 text-xs">
                    {l.line_details ?? l.details ?? '—'}
                    {l.je_scenario && (
                      <code className="text-[9px] mr-1.5 px-1 py-0.5 bg-ink-100 text-ink-600 rounded" dir="ltr">
                        {l.je_scenario}
                      </code>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-left tabular-nums text-xs" dir="ltr">
                    {l.debit > 0 ? fmt(l.debit) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-left tabular-nums text-xs" dir="ltr">
                    {l.credit > 0 ? fmt(l.credit) : '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-left tabular-nums font-medium text-xs ${l.runningBalance < 0 ? 'text-blue-700' : l.runningBalance > 0 ? 'text-emerald-700' : 'text-ink-500'}`} dir="ltr">
                    {fmtSigned(l.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-900 text-white font-semibold">
                <td colSpan={4} className="px-3 py-2 text-xs uppercase tracking-wider">
                  סיכום
                </td>
                <td className="px-3 py-2 text-left tabular-nums text-xs" dir="ltr">{fmt(totalDr)}</td>
                <td className="px-3 py-2 text-left tabular-nums text-xs" dir="ltr">{fmt(totalCr)}</td>
                <td className="px-3 py-2 text-left tabular-nums text-xs" dir="ltr">{fmtSigned(totalDr - totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function AccountPicker({
  companyId,
  rangeFrom,
  rangeTo,
  preset,
  accountCodes,
  accountMeta,
  selectedAccount,
}: {
  companyId: string;
  rangeFrom: string;
  rangeTo: string;
  preset: string | null;
  accountCodes: string[];
  accountMeta: Map<string, { code: string; name: string }>;
  selectedAccount: string | null;
}) {
  const base = `/dashboard/c/${companyId}/reports/general-ledger`;
  const presetParam = preset ? `&preset=${preset}` : `&from=${rangeFrom}&to=${rangeTo}`;

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-3 print:hidden">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
        חשבון
      </div>
      {accountCodes.length === 0 ? (
        <div className="text-xs text-ink-500">אין תנועות בתקופה.</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {accountCodes.map((code) => {
            const m = accountMeta.get(code);
            const href = `${base}?account=${encodeURIComponent(code)}${presetParam}`;
            const active = selectedAccount === code;
            return (
              <Link
                key={code}
                href={href}
                className={`px-2 py-1 text-xs rounded border ${
                  active
                    ? 'bg-accent-500/10 text-accent-700 border-accent-200'
                    : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
                }`}
              >
                <span className="font-mono" dir="ltr">{code}</span>
                {m?.name && code !== m.name && <span className="text-ink-500 mr-1.5">{m.name}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(n: number): string {
  if (Math.abs(n) < 0.005) return '0.00';
  return n < 0 ? '(' + fmt(Math.abs(n)) + ')' : fmt(n);
}
