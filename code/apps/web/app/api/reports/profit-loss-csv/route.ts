import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  aggregateByAccount,
  fetchJELines,
  loadAccountMeta,
  resolveRangeFromQuery,
} from '@/lib/reports/aggregator';

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const company = await loadCompanyForUser(me.id, me.email, companyId);
  const range = resolveRangeFromQuery(buildRangeQuery(url));

  const lines = await fetchJELines(company.id, range);
  const codes = Array.from(new Set(lines.map((l) => l.account)));
  const meta = await loadAccountMeta(company.id, codes);
  const aggregates = aggregateByAccount(lines, meta);

  const incomeRows = aggregates
    .filter((a) => a.type === 'income')
    .map((a) => ({ ...a, displayAmount: a.totalCredit - a.totalDebit }));
  const expenseRows = aggregates
    .filter((a) => a.type === 'expense')
    .map((a) => ({ ...a, displayAmount: a.totalDebit - a.totalCredit }));

  const totalIncome = incomeRows.reduce((s, r) => s + r.displayAmount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.displayAmount, 0);
  const netProfit = totalIncome - totalExpense;

  const header = ['קטגוריה', 'חשבון', 'שם', 'סכום'];
  const rows: string[][] = [];

  rows.push(['הכנסות', '', '', '']);
  for (const r of incomeRows) rows.push(['', r.code, r.name, r.displayAmount.toFixed(2)]);
  rows.push(['', '', 'סך הכנסות', totalIncome.toFixed(2)]);

  rows.push(['הוצאות', '', '', '']);
  for (const r of expenseRows) rows.push(['', r.code, r.name, r.displayAmount.toFixed(2)]);
  rows.push(['', '', 'סך הוצאות', totalExpense.toFixed(2)]);

  rows.push(['', '', netProfit >= 0 ? 'רווח נקי' : 'הפסד נקי', netProfit.toFixed(2)]);

  const body = '﻿' + [header, ...rows].map(rowToCsv).join('\r\n') + '\r\n';
  const safe = company.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `profit-loss-${safe}-${range.from}--${range.to}.csv`;
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

function buildRangeQuery(url: URL): { from?: string; to?: string; preset?: string } {
  const out: { from?: string; to?: string; preset?: string } = {};
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const preset = url.searchParams.get('preset');
  if (from) out.from = from;
  if (to) out.to = to;
  if (preset) out.preset = preset;
  return out;
}
