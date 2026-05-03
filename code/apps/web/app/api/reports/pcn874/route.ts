import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  CanonicalInvoiceSchema,
  SalesInvoiceSchema,
} from '@priority-cpa/invoice-schema';
import { buildPcn874, type Pcn874Transaction } from '@priority-cpa/pcn874-builder';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Build (and optionally save+lock) a PCN874 file for a single (company, year, month).
 *
 * Modes:
 *  - GET ?preview=1 → JSON summary only, no DB write, no lock.
 *  - POST           → builds, saves to pcn874_exports, auto-locks period, returns file.
 */

interface InvoiceRow {
  id: string;
  status: string;
  canonical: unknown;
}

interface SaleRow {
  id: string;
  status: string;
  canonical: unknown;
  doc_type: string;
}

const ROUND2 = (n: number): number => Math.round(n * 100) / 100;

async function gather(
  companyId: string,
  year: number,
  month: number,
): Promise<{
  vatId: string;
  inputs: Pcn874Transaction[];
  sales: Pcn874Transaction[];
  warnings: string[];
}> {
  const admin = getAdminClient();
  const warnings: string[] = [];

  const { data: comp } = await admin
    .from('companies')
    .select('tax_id')
    .eq('id', companyId)
    .maybeSingle();
  const vatIdRaw = String(comp?.tax_id ?? '').replace(/\D/g, '');
  if (vatIdRaw.length !== 9) {
    throw new Error(`ע.מ של החברה אינו תקני (${vatIdRaw || 'ריק'}). עדכן בהגדרות חברה.`);
  }

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // Inputs (תשומות) — from invoices_inbox.
  const { data: invRows } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical')
    .eq('company_id', companyId)
    .neq('status', 'error');

  const inputs: Pcn874Transaction[] = [];
  for (const row of (invRows ?? []) as InvoiceRow[]) {
    const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
    if (!parsed.success) {
      warnings.push(`חשבונית ${row.id} — נתונים לא תקינים, דולגת.`);
      continue;
    }
    const c = parsed.data;
    if (c.invoice.date < monthStart || c.invoice.date >= monthEnd) continue;
    if (c.invoice.currency !== 'ILS') {
      warnings.push(
        `חשבונית ${c.invoice.number}: מטבע זר (${c.invoice.currency}) — לא נכלל ב-874.`,
      );
      continue;
    }
    const subtotal = c.totals.subtotal;
    const vat = ROUND2(c.totals.total - c.totals.subtotal);
    const subType: Pcn874Transaction['subType'] = c.invoice.is_self_invoice
      ? 'self'
      : 'standard';
    inputs.push({
      counterpartyVatId: c.supplier.tax_id ?? null,
      documentDate: c.invoice.date,
      referenceNumber: c.invoice.number,
      ...(c.invoice.allocation_number ? { allocationNumber: c.invoice.allocation_number } : {}),
      subtotal: c.invoice.is_credit_note ? -subtotal : subtotal,
      vat: c.invoice.is_credit_note ? -vat : vat,
      subType,
    });
  }

  // Sales (עסקאות) — from sales_invoices.
  const { data: salesRows } = await admin
    .from('sales_invoices')
    .select('id, status, doc_type, canonical')
    .eq('company_id', companyId)
    .neq('status', 'error');

  const sales: Pcn874Transaction[] = [];
  for (const row of (salesRows ?? []) as SaleRow[]) {
    const parsed = SalesInvoiceSchema.safeParse(row.canonical);
    if (!parsed.success) {
      warnings.push(`חשבונית מכירה ${row.id} — נתונים לא תקינים, דולגת.`);
      continue;
    }
    const s = parsed.data;
    if (s.invoice.date < monthStart || s.invoice.date >= monthEnd) continue;
    // Proforma is not a tax document — skip.
    if (row.doc_type === 'proforma') continue;
    const subtotal = s.totals.subtotal;
    const vat = ROUND2(s.totals.total - s.totals.subtotal);
    const isCredit = row.doc_type === 'credit_note';
    sales.push({
      counterpartyVatId: s.customer.tax_id || null,
      documentDate: s.invoice.date,
      referenceNumber: s.invoice.number,
      subtotal: isCredit ? -subtotal : subtotal,
      vat: isCredit ? -vat : vat,
      subType: 'standard',
    });
  }

  return { vatId: vatIdRaw, inputs, sales, warnings };
}

function md5(buf: Buffer | string): string {
  return createHash('md5').update(buf).digest('hex');
}

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json({ error: 'year and month required' }, { status: 400 });
  }

  const company = await loadCompanyForUser(me.id, me.email, companyId);

  try {
    const { vatId, inputs, sales, warnings } = await gather(company.id, year, month);
    const result = buildPcn874({ vatId, year, month, inputs, sales });
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      warnings,
      preview: result.text.split('\r\n').slice(0, 5).join('\n'),
      vatId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const me = await requireUser();
  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  const year = Number(body.year);
  const month = Number(body.month);
  const lockPeriod: boolean = body.lockPeriod !== false; // default true

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json({ error: 'year and month required' }, { status: 400 });
  }

  const company = await loadCompanyForUser(me.id, me.email, companyId);
  const admin = getAdminClient();

  try {
    const { vatId, inputs, sales, warnings } = await gather(company.id, year, month);
    const result = buildPcn874({ vatId, year, month, inputs, sales });

    let periodLockedNow = false;
    if (lockPeriod) {
      const { data: existing } = await admin
        .from('accounting_periods')
        .select('id, status')
        .eq('company_id', company.id)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();
      const wasOpen = !existing || existing.status === 'open';
      if (wasOpen) {
        await admin
          .from('accounting_periods')
          .upsert(
            {
              company_id: company.id,
              year,
              month,
              status: 'locked',
              locked_at: new Date().toISOString(),
              locked_by: me.id,
              notes: `נעילה אוטומטית עקב הפקת PCN874 (${result.summary.vatToPay >= 0 ? 'לתשלום' : 'להחזר'} ${Math.abs(result.summary.vatToPay).toFixed(2)} ₪)`,
            },
            { onConflict: 'company_id,year,month' },
          );
        periodLockedNow = true;
      }
    }

    const fileMd5 = md5(result.buffer);
    await admin.from('pcn874_exports').insert({
      company_id: company.id,
      year,
      month,
      total_inputs_subtotal: result.summary.totalInputsSubtotal,
      total_inputs_vat: result.summary.totalInputsVat,
      total_sales_subtotal: result.summary.totalSalesSubtotal,
      total_sales_vat: result.summary.totalSalesVat,
      vat_to_pay: result.summary.vatToPay,
      je_count: result.summary.inputsCount + result.summary.salesCount,
      file_content: result.text,
      file_md5: fileMd5,
      file_byte_size: result.buffer.byteLength,
      generated_by: me.id,
      period_locked_by_this: periodLockedNow,
    });

    const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `pcn874-${safeName}-${year}${String(month).padStart(2, '0')}.txt`;

    // The file is binary (Windows-1255), but Next/NextResponse accepts ArrayBuffer.
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=windows-1255',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-PCN874-MD5': fileMd5,
        'X-PCN874-Period-Locked': periodLockedNow ? '1' : '0',
        'X-PCN874-Warnings': String(warnings.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
