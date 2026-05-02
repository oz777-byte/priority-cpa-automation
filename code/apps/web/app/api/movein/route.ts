import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  buildRawRecord,
  encodeMoveInBuffer,
  generateMoveInFlex,
  type FlexibleLineInput,
} from '@priority-cpa/movein-generator';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

interface JERow {
  id: string;
  transaction_type: string;
  reference1: string;
  reference2: string | null;
  document_date: string;
  value_date: string;
  currency: string;
  details: string;
  invoice_id: string | null;
}

interface LineRow {
  account: string;
  debit: number;
  credit: number;
  debit_fx: number;
  credit_fx: number;
}

interface InvoiceCanonicalSnippet {
  invoice?: {
    cost_center?: string;
    allocation_number?: string | null;
  };
}

const FLEX_ALLOC_THRESHOLD = 5;
const FLEX_MAX_180_LINES = 4;

/**
 * Choose 180 vs FLEXIBLE for an entire batch. We pick FLEXIBLE if any
 * record needs richer fields than the fixed 180 layout can carry.
 */
function shouldUseFlexible(
  records: Array<{
    lines: LineRow[];
    canonical: InvoiceCanonicalSnippet | null;
  }>,
): boolean {
  for (const r of records) {
    if (r.lines.length > FLEX_MAX_180_LINES) return true;
    const cc = r.canonical?.invoice?.cost_center;
    if (cc && cc.length > 0) return true;
    const alloc = r.canonical?.invoice?.allocation_number;
    if (alloc && alloc.length > FLEX_ALLOC_THRESHOLD) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const companyIdParam = url.searchParams.get('companyId');

  const company = companyIdParam
    ? await loadCompanyForUser(me.id, me.email, companyIdParam)
    : await getCurrentCompany(me.id, me.email);

  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 400 });
  }

  const singleJEId = url.searchParams.get('je');

  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  let jeQ = admin
    .from('journal_entries')
    .select(
      'id, transaction_type, reference1, reference2, document_date, value_date, currency, details, status, invoice_id',
    )
    .eq('company_id', company.id);
  if (singleJEId) {
    jeQ = jeQ.eq('id', singleJEId);
  } else {
    jeQ = jeQ.in('status', ['draft', 'validated', 'approved']);
  }
  const { data: jeRows, error: jeErr } = await jeQ.order('document_date', { ascending: true });
  if (jeErr) return NextResponse.json({ error: jeErr.message }, { status: 500 });

  if (!jeRows || jeRows.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן לייצוא' },
      { status: 400 },
    );
  }

  const jeIds = jeRows.map((j) => j.id as string);
  const { data: lineRows } = await admin
    .from('journal_entry_lines')
    .select('id, je_id, line_no, account, debit, credit, debit_fx, credit_fx')
    .in('je_id', jeIds)
    .order('line_no', { ascending: true });

  const linesByJE = new Map<string, LineRow[]>();
  for (const l of lineRows ?? []) {
    const arr = linesByJE.get(l.je_id as string) ?? [];
    arr.push({
      account: l.account as string,
      debit: Number(l.debit),
      credit: Number(l.credit),
      debit_fx: Number(l.debit_fx),
      credit_fx: Number(l.credit_fx),
    });
    linesByJE.set(l.je_id as string, arr);
  }

  // Pull canonical for invoices to read cost_center / allocation_number /
  // expense_splits — these drive FLEXIBLE detection and per-line metadata.
  const invoiceIds = Array.from(
    new Set(jeRows.map((j) => j.invoice_id).filter((v): v is string => !!v)),
  );
  const canonicalByInvoice = new Map<string, InvoiceCanonicalSnippet>();
  if (invoiceIds.length > 0) {
    const { data: invRows } = await admin
      .from('invoices_inbox')
      .select('id, canonical')
      .in('id', invoiceIds);
    for (const r of invRows ?? []) {
      canonicalByInvoice.set(
        r.id as string,
        (r.canonical as InvoiceCanonicalSnippet | null) ?? {},
      );
    }
  }

  const validJEs: Array<{
    je: JERow;
    lines: LineRow[];
    canonical: InvoiceCanonicalSnippet | null;
  }> = [];

  for (const j of jeRows) {
    const je = j as unknown as JERow;
    const lines = linesByJE.get(je.id) ?? [];
    if (lines.length === 0) continue;
    const drSum = lines.reduce((s, l) => s + l.debit, 0);
    const crSum = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(drSum - crSum) > 0.05) continue;
    const hasDr = lines.some((l) => l.debit > 0);
    const hasCr = lines.some((l) => l.credit > 0);
    if (!hasDr || !hasCr) continue;
    validJEs.push({
      je,
      lines,
      canonical: je.invoice_id ? canonicalByInvoice.get(je.invoice_id) ?? null : null,
    });
  }

  if (validJEs.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן תקינות לייצוא — בדוק איזון ושורות חובה/זכות' },
      { status: 400 },
    );
  }

  const useFlex = shouldUseFlexible(validJEs);
  const exportedJEIds: string[] = [];
  const exportedInvoiceIds: string[] = [];
  const batchNumber = String(Date.now()).slice(-6);
  const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');

  let responseBody: ArrayBuffer;
  let responseFilename: string;
  let responseContentType: string;
  let recordCount = 0;

  if (!useFlex) {
    // ---------- 180-char fixed format ----------
    const records: string[] = [];
    for (const { je, lines } of validJEs) {
      const dr = lines.filter((l) => l.debit > 0).slice(0, 2);
      const cr = lines.filter((l) => l.credit > 0).slice(0, 2);
      try {
        records.push(
          buildRawRecord({
            transactionType: je.transaction_type,
            reference1: je.reference1,
            reference2: je.reference2 ?? 0,
            documentDate: je.document_date,
            valueDate: je.value_date,
            currency: je.currency,
            details: je.details,
            dr1Account: dr[0]!.account,
            dr1Amount: dr[0]!.debit,
            dr2Account: dr[1]?.account,
            dr2Amount: dr[1]?.debit,
            cr1Account: cr[0]!.account,
            cr1Amount: cr[0]!.credit,
            cr2Account: cr[1]?.account,
            cr2Amount: cr[1]?.credit,
          }),
        );
        exportedJEIds.push(je.id);
        if (je.invoice_id) exportedInvoiceIds.push(je.invoice_id);
      } catch {
        /* skip malformed JE */
      }
    }
    if (records.length === 0) {
      return NextResponse.json(
        { error: 'אין פקודות יומן תקינות לייצוא' },
        { status: 400 },
      );
    }
    const buffer = encodeMoveInBuffer(records);
    responseBody = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    responseFilename = `movein-${safeName}-${batchNumber}.dat`;
    responseContentType = 'application/octet-stream';
    recordCount = records.length;
  } else {
    // ---------- FLEXIBLE TSV format (movein.doc + movein.prm in zip) ----------
    const flexLines: FlexibleLineInput[] = [];
    for (const { je, lines, canonical } of validJEs) {
      const cc = canonical?.invoice?.cost_center;
      const alloc = canonical?.invoice?.allocation_number ?? undefined;
      // Each DB line becomes one FLEXIBLE row. cost_center / allocation_number
      // come from the invoice header — applied to all lines of that JE.
      let lineEmitted = false;
      for (const l of lines) {
        const isDebit = l.debit > 0;
        flexLines.push({
          transactionType: je.transaction_type,
          reference1: je.reference1,
          ...(je.reference2 ? { reference2: je.reference2 } : {}),
          documentDate: je.document_date,
          valueDate: je.value_date,
          currency: je.currency,
          account: l.account,
          side: isDebit ? 'D' : 'C',
          amountIls: isDebit ? l.debit : l.credit,
          ...(l.debit_fx > 0 || l.credit_fx > 0
            ? { amountFx: isDebit ? l.debit_fx : l.credit_fx }
            : {}),
          ...(cc ? { costCenter: cc } : {}),
          ...(alloc ? { allocationNumber: alloc } : {}),
          ...(je.details ? { details: je.details } : {}),
        });
        lineEmitted = true;
      }
      if (lineEmitted) {
        exportedJEIds.push(je.id);
        if (je.invoice_id) exportedInvoiceIds.push(je.invoice_id);
      }
    }
    if (flexLines.length === 0) {
      return NextResponse.json(
        { error: 'אין שורות לייצוא בפורמט FLEXIBLE' },
        { status: 400 },
      );
    }
    const { doc, prm } = generateMoveInFlex(flexLines);
    const zip = new JSZip();
    zip.file('movein.doc', doc);
    zip.file('movein.prm', prm);
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
    responseBody = zipBuf.buffer.slice(
      zipBuf.byteOffset,
      zipBuf.byteOffset + zipBuf.byteLength,
    ) as ArrayBuffer;
    responseFilename = `movein-${safeName}-${batchNumber}.zip`;
    responseContentType = 'application/zip';
    recordCount = validJEs.length;
  }

  const { data: batchRow } = await admin
    .from('movein_batches')
    .insert({
      company_id: company.id,
      batch_number: batchNumber,
      scenario_breakdown: {
        records: recordCount,
        format: useFlex ? 'flexible' : '180',
      },
      exported_at: new Date().toISOString(),
      exported_by: me.id,
      priority_load_status: 'pending',
    })
    .select('id')
    .single();
  const batchId = batchRow?.id as string | undefined;

  if (batchId && exportedJEIds.length > 0) {
    await admin
      .from('journal_entries')
      .update({ status: 'exported', batch_id: batchId })
      .in('id', exportedJEIds);
    if (exportedInvoiceIds.length > 0) {
      await admin
        .from('invoices_inbox')
        .update({ status: 'exported', processed_at: new Date().toISOString() })
        .in('id', exportedInvoiceIds);
    }

    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'batch.export',
      entityType: 'batch',
      entityId: batchId,
      payload: {
        batch_number: batchNumber,
        record_count: recordCount,
        format: useFlex ? 'flexible' : '180',
        je_ids: exportedJEIds,
        exported_by: me.email,
      },
    });
  }

  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': responseContentType,
      'Content-Disposition': `attachment; filename="${responseFilename}"`,
      'Content-Length': String(responseBody.byteLength),
      'X-Movein-Format': useFlex ? 'flexible' : '180',
    },
  });
}
