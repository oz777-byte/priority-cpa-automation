import { NextRequest, NextResponse } from 'next/server';
import { CanonicalInvoiceSchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyIdParam = url.searchParams.get('companyId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!companyIdParam) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }
  if (!from || !ISO_DATE.test(from) || !to || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'from/to required (YYYY-MM-DD)' }, { status: 400 });
  }

  const company = await loadCompanyForUser(me.id, me.email, companyIdParam);
  const admin = getAdminClient();

  const { data: rawInvoices } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical')
    .eq('company_id', company.id)
    .neq('status', 'error');

  const rows = ((rawInvoices ?? []) as Array<{ id: string; status: string; canonical: unknown }>)
    .map((row) => {
      const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
      if (!parsed.success) return null;
      const c = parsed.data;
      const date = c.invoice.date;
      if (date < from || date > to) return null;
      const subtotal = c.totals.subtotal;
      const total = c.totals.total;
      const vat = Math.round((total - subtotal) * 100) / 100;
      return {
        date,
        supplierName: c.supplier.name,
        supplierTaxId: c.supplier.tax_id,
        supplierCode: c.supplier.internal_code_priority,
        invoiceNumber: c.invoice.number,
        currency: c.invoice.currency,
        subtotal,
        vat,
        total,
        status: row.status,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    'תאריך',
    'שם ספק',
    'ע.מ ספק',
    'קוד ספק',
    'מס׳ חשבונית',
    'מטבע',
    'סכום ביניים',
    'מע"מ',
    'סך הכול',
    'סטטוס',
  ];

  const lines: string[] = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.supplierName,
        r.supplierTaxId,
        r.supplierCode,
        r.invoiceNumber,
        r.currency,
        r.subtotal.toFixed(2),
        r.vat.toFixed(2),
        r.total.toFixed(2),
        r.status,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // Excel-friendly: UTF-8 with BOM so Hebrew renders correctly when
  // double-clicked in Windows Excel.
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `vat-${safeName}-${from}--${to}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
