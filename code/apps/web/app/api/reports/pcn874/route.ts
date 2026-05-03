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

  // 1. Company VAT meta.
  const { data: comp } = await admin
    .from('companies')
    .select('tax_id, vat_basis')
    .eq('id', companyId)
    .maybeSingle();
  const vatIdRaw = String(comp?.tax_id ?? '').replace(/\D/g, '');
  if (vatIdRaw.length !== 9) {
    throw new Error(`ע.מ של החברה אינו תקני (${vatIdRaw || 'ריק'}). עדכן בהגדרות חברה.`);
  }
  const vatBasis = (comp?.vat_basis as 'accrual' | 'cash' | undefined) ?? 'accrual';
  if (vatBasis === 'cash') {
    warnings.push(
      'חברה מסומנת כדיווח על בסיס מזומן — תיעוד לפי תאריך תשלום בפועל יתווסף בהמשך, כרגע מדווחים לפי תאריך הדיווח של ה-JE.',
    );
  }

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // 2. Pull JEs in this VAT-reporting period (filtered by vat_reporting_date,
  //    NOT by invoice date). This fixes the late-arriving-invoice case.
  const { data: jeRows } = await admin
    .from('journal_entries')
    .select('id, invoice_id, sales_invoice_id, vat_reporting_date')
    .eq('company_id', companyId)
    .gte('vat_reporting_date', monthStart)
    .lt('vat_reporting_date', monthEnd)
    .neq('status', 'cancelled')
    .neq('status', 'error');

  const jeList = (jeRows ?? []) as Array<{
    id: string;
    invoice_id: string | null;
    sales_invoice_id: string | null;
    vat_reporting_date: string;
  }>;

  const inputInvoiceIds = new Set<string>();
  const saleInvoiceIds = new Set<string>();
  // Map invoice → its vat_reporting_date so we can still expose it on the record.
  const reportingDateByInvoiceId = new Map<string, string>();
  const reportingDateBySaleId = new Map<string, string>();
  for (const je of jeList) {
    if (je.invoice_id) {
      inputInvoiceIds.add(je.invoice_id);
      reportingDateByInvoiceId.set(je.invoice_id, je.vat_reporting_date);
    }
    if (je.sales_invoice_id) {
      saleInvoiceIds.add(je.sales_invoice_id);
      reportingDateBySaleId.set(je.sales_invoice_id, je.vat_reporting_date);
    }
  }

  // 3. Pull supplier master to know which suppliers are exempt dealers.
  //    Exempt-dealer invoices must NOT be included in the inputs side
  //    (no VAT to claim, supplier doesn't report).
  const { data: supplierRows } = await admin
    .from('suppliers')
    .select('tax_id, dealer_status')
    .eq('company_id', companyId);
  const exemptSupplierTaxIds = new Set<string>();
  for (const s of (supplierRows ?? []) as Array<{ tax_id: string | null; dealer_status: string }>) {
    if (s.dealer_status === 'exempt' && s.tax_id) {
      exemptSupplierTaxIds.add(s.tax_id);
    }
  }

  // 4. Inputs (תשומות).
  const inputs: Pcn874Transaction[] = [];
  if (inputInvoiceIds.size > 0) {
    const { data: invRows } = await admin
      .from('invoices_inbox')
      .select('id, status, canonical')
      .in('id', Array.from(inputInvoiceIds));

    for (const row of (invRows ?? []) as InvoiceRow[]) {
      const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
      if (!parsed.success) {
        warnings.push(`חשבונית ${row.id} — נתונים לא תקינים, דולגת.`);
        continue;
      }
      const c = parsed.data;
      if (c.invoice.currency !== 'ILS') {
        warnings.push(
          `חשבונית ${c.invoice.number}: מטבע זר (${c.invoice.currency}) — לא נכלל ב-874.`,
        );
        continue;
      }

      // Skip exempt-dealer suppliers.
      if (c.supplier.tax_id && exemptSupplierTaxIds.has(c.supplier.tax_id)) {
        warnings.push(
          `חשבונית ${c.invoice.number} מספק עוסק פטור (${c.supplier.name}) — לא נכלל ב-תשומות 874.`,
        );
        continue;
      }

      const subtotal = c.totals.subtotal;
      const vat = ROUND2(c.totals.total - c.totals.subtotal);
      // If recorded with no VAT (e.g. 6-month rule blocked it), still track the expense
      // for income but skip the VAT side. For 874 we need VAT; if vat=0 + supplier registered → skip.
      if (vat <= 0 && !c.invoice.is_self_invoice) {
        warnings.push(
          `חשבונית ${c.invoice.number}: ללא מע"מ (חוק 6 חודשים? עוסק פטור?) — לא נכלל ב-תשומות 874.`,
        );
        continue;
      }
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
  }

  // 5. Sales (עסקאות) — including 0% rate separation.
  const sales: Pcn874Transaction[] = [];
  if (saleInvoiceIds.size > 0) {
    const { data: salesRows } = await admin
      .from('sales_invoices')
      .select('id, status, doc_type, canonical')
      .in('id', Array.from(saleInvoiceIds));

    for (const row of (salesRows ?? []) as SaleRow[]) {
      const parsed = SalesInvoiceSchema.safeParse(row.canonical);
      if (!parsed.success) {
        warnings.push(`חשבונית מכירה ${row.id} — נתונים לא תקינים, דולגת.`);
        continue;
      }
      const s = parsed.data;
      if (row.doc_type === 'proforma') continue;
      const subtotal = s.totals.subtotal;
      const vat = ROUND2(s.totals.total - s.totals.subtotal);
      const isCredit = row.doc_type === 'credit_note';

      // Detect zero-rate / exempt sales by checking if any line is non-standard.
      const linesAny = (s.lines ?? []) as Array<{ vat_category?: string }>;
      const hasZeroOrExempt = linesAny.some(
        (l) => l.vat_category === 'zero' || l.vat_category === 'exempt',
      );
      const allZeroOrExempt =
        linesAny.length > 0 &&
        linesAny.every((l) => l.vat_category === 'zero' || l.vat_category === 'exempt');

      if (allZeroOrExempt && vat === 0) {
        // Reported as "L" (other income) — separate from standard taxable sales.
        sales.push({
          counterpartyVatId: s.customer.tax_id || null,
          documentDate: s.invoice.date,
          referenceNumber: s.invoice.number,
          subtotal: isCredit ? -subtotal : subtotal,
          vat: 0,
          subType: 'petty', // maps to record code 'L' in builder
        });
        continue;
      }
      if (hasZeroOrExempt) {
        warnings.push(
          `חשבונית מכירה ${s.invoice.number}: מעורבת (חלק 0%/פטור, חלק 18%). דווחה כעסקה רגילה — מומלץ לפצל.`,
        );
      }

      sales.push({
        counterpartyVatId: s.customer.tax_id || null,
        documentDate: s.invoice.date,
        referenceNumber: s.invoice.number,
        subtotal: isCredit ? -subtotal : subtotal,
        vat: isCredit ? -vat : vat,
        subType: 'standard',
      });
    }
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
