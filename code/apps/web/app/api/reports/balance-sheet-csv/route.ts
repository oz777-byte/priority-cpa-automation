import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  aggregateByAccount,
  fetchJELines,
  loadAccountMeta,
} from '@/lib/reports/aggregator';

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const company = await loadCompanyForUser(me.id, me.email, companyId);
  const today = new Date().toISOString().slice(0, 10);
  const asOfRaw = url.searchParams.get('as_of');
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : today;

  const lines = await fetchJELines(company.id, { from: '2000-01-01', to: asOf });
  const codes = Array.from(new Set(lines.map((l) => l.account)));
  const meta = await loadAccountMeta(company.id, codes);
  const aggregates = aggregateByAccount(lines, meta);

  const incomeBal = aggregates
    .filter((a) => a.type === 'income')
    .reduce((s, a) => s + (a.totalCredit - a.totalDebit), 0);
  const expenseBal = aggregates
    .filter((a) => a.type === 'expense')
    .reduce((s, a) => s + (a.totalDebit - a.totalCredit), 0);
  const accumulatedProfit = incomeBal - expenseBal;

  const assets = aggregates.filter((a) => a.type === 'asset').map((a) => ({ ...a, amt: a.totalDebit - a.totalCredit }));
  const liabilities = aggregates.filter((a) => a.type === 'liability').map((a) => ({ ...a, amt: a.totalCredit - a.totalDebit }));
  const equity = aggregates.filter((a) => a.type === 'equity').map((a) => ({ ...a, amt: a.totalCredit - a.totalDebit }));

  const header = ['קטגוריה', 'חשבון', 'שם', 'יתרה'];
  const rows: string[][] = [];

  rows.push(['נכסים', '', '', '']);
  for (const r of assets) rows.push(['', r.code, r.name, r.amt.toFixed(2)]);
  rows.push(['', '', 'סך נכסים', assets.reduce((s, r) => s + r.amt, 0).toFixed(2)]);

  rows.push(['התחייבויות', '', '', '']);
  for (const r of liabilities) rows.push(['', r.code, r.name, r.amt.toFixed(2)]);
  rows.push(['', '', 'סך התחייבויות', liabilities.reduce((s, r) => s + r.amt, 0).toFixed(2)]);

  rows.push(['הון', '', '', '']);
  for (const r of equity) rows.push(['', r.code, r.name, r.amt.toFixed(2)]);
  rows.push(['', '—', accumulatedProfit >= 0 ? 'יתרת רווחים מצטברת' : 'יתרת הפסדים מצטברת', accumulatedProfit.toFixed(2)]);
  rows.push(['', '', 'סך הון + רווחים', (equity.reduce((s, r) => s + r.amt, 0) + accumulatedProfit).toFixed(2)]);

  const body = '﻿' + [header, ...rows].map(rowToCsv).join('\r\n') + '\r\n';
  const safe = company.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `balance-sheet-${safe}-${asOf}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function rowToCsv(values: string[]): string {
  return values.map(csvCell).join(',');
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
