import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import {
  fetchJELines,
  resolveRangeFromQuery,
} from '@/lib/reports/aggregator';

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const account = url.searchParams.get('account');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });

  const company = await loadCompanyForUser(me.id, me.email, companyId);
  const range = resolveRangeFromQuery(buildRangeQuery(url));

  const lines = (await fetchJELines(company.id, range))
    .filter((l) => l.account === account)
    .sort((a, b) => a.document_date.localeCompare(b.document_date));

  const header = ['תאריך', 'JE#', 'אסמכתא', 'תיאור', 'תרחיש', 'חובה', 'זכות', 'יתרה רצה'];
  let running = 0;
  const rows = lines.map((l) => {
    running += l.debit - l.credit;
    return [
      l.document_date,
      l.je_number?.toString() ?? '',
      l.reference1,
      l.line_details ?? l.details ?? '',
      l.je_scenario ?? '',
      l.debit > 0 ? l.debit.toFixed(2) : '',
      l.credit > 0 ? l.credit.toFixed(2) : '',
      running.toFixed(2),
    ];
  });

  const body = '﻿' + [header, ...rows].map(rowToCsv).join('\r\n') + '\r\n';
  const safeAccount = account.replace(/[^a-zA-Z0-9-]/g, '_');
  const safe = company.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `gl-${safe}-${safeAccount}-${range.from}--${range.to}.csv`;
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
