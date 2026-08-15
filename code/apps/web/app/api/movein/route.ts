import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
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

interface ValidJE {
  je: JERow;
  lines: LineRow[];
  canonical: InvoiceCanonicalSnippet | null;
}

interface BuiltFile {
  body: ArrayBuffer;
  filename: string;
  contentType: string;
  useFlex: boolean;
  recordCount: number;
}

const FLEX_ALLOC_THRESHOLD = 5;
const FLEX_REFERENCE_THRESHOLD = 5;
const FLEX_MAX_180_LINES = 4;

function shouldUseFlexible(records: ValidJE[]): boolean {
  for (const r of records) {
    if (r.lines.length > FLEX_MAX_180_LINES) return true;
    const cc = r.canonical?.invoice?.cost_center;
    if (cc && cc.length > 0) return true;
    const alloc = r.canonical?.invoice?.allocation_number;
    if (alloc && alloc.length > FLEX_ALLOC_THRESHOLD) return true;
    // Invoice number longer than 5 digits gets truncated by the 180-format
    // (אסמכתא 1 = 5 digits). Switch to FLEXIBLE so the full number is
    // preserved for PCN874 and audit purposes.
    const refStr = String(r.je.reference1 ?? '');
    if (refStr.length > FLEX_REFERENCE_THRESHOLD) return true;
  }
  return false;
}

/**
 * Pull JEs + lines + invoice canonical for a list of JE ids, filter out
 * malformed rows, return the structured set ready for file generation.
 */
async function loadValidJEs(
  jeIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<ValidJE[]> {
  if (jeIds.length === 0) return [];

  const { data: jeRows } = await admin
    .from('journal_entries')
    .select(
      'id, transaction_type, reference1, reference2, document_date, value_date, currency, details, invoice_id',
    )
    .in('id', jeIds);

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

  const invoiceIds = Array.from(
    new Set(
      ((jeRows ?? []) as JERow[])
        .map((j) => j.invoice_id)
        .filter((v): v is string => !!v),
    ),
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

  const validJEs: ValidJE[] = [];
  for (const j of (jeRows ?? []) as JERow[]) {
    const lines = linesByJE.get(j.id) ?? [];
    if (lines.length === 0) continue;
    const drSum = lines.reduce((s, l) => s + l.debit, 0);
    const crSum = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(drSum - crSum) > 0.05) continue;
    if (!lines.some((l) => l.debit > 0)) continue;
    if (!lines.some((l) => l.credit > 0)) continue;
    validJEs.push({
      je: j,
      lines,
      canonical: j.invoice_id
        ? canonicalByInvoice.get(j.invoice_id) ?? null
        : null,
    });
  }
  // Preserve document_date ordering for stable output
  validJEs.sort((a, b) => a.je.document_date.localeCompare(b.je.document_date));
  return validJEs;
}

async function buildMoveInFileAsync(
  validJEs: ValidJE[],
  companyName: string,
  batchNumber: string,
): Promise<BuiltFile | null> {
  const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const useFlex = shouldUseFlexible(validJEs);

  if (!useFlex) {
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
      } catch {
        /* skip malformed */
      }
    }
    if (records.length === 0) return null;
    const buffer = encodeMoveInBuffer(records);
    return {
      body: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
      filename: `movein-${safeName}-${batchNumber}.dat`,
      contentType: 'application/octet-stream',
      useFlex: false,
      recordCount: records.length,
    };
  }

  const flexLines: FlexibleLineInput[] = [];
  for (const { je, lines, canonical } of validJEs) {
    const cc = canonical?.invoice?.cost_center;
    const alloc = canonical?.invoice?.allocation_number ?? undefined;
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
    }
  }
  if (flexLines.length === 0) return null;

  const { doc, prm } = generateMoveInFlex(flexLines);
  const zip = new JSZip();
  zip.file('movein.doc', doc);
  zip.file('movein.prm', prm);
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

  return {
    body: zipBuf.buffer.slice(
      zipBuf.byteOffset,
      zipBuf.byteOffset + zipBuf.byteLength,
    ) as ArrayBuffer,
    filename: `movein-${safeName}-${batchNumber}.zip`,
    contentType: 'application/zip',
    useFlex: true,
    recordCount: validJEs.length,
  };
}

function fileResponse(file: BuiltFile): NextResponse {
  return new NextResponse(file.body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.body.byteLength),
      'X-Movein-Format': file.useFlex ? 'flexible' : '180',
    },
  });
}

/* ======================================================================
 * GET — re-download an existing batch (no DB writes, idempotent)
 * Required: ?batch=<batch_id>&companyId=<company_id>
 * ====================================================================== */

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const url = new URL(request.url);
  const batchId = url.searchParams.get('batch');
  const companyIdParam = url.searchParams.get('companyId');

  if (!batchId) {
    return NextResponse.json(
      { error: 'GET requires ?batch=<id> for re-download' },
      { status: 400 },
    );
  }

  const company = companyIdParam
    ? await loadCompanyForUser(me.id, me.email, companyIdParam)
    : await getCurrentCompany(me.id, me.email);
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: batch } = await admin
    .from('movein_batches')
    .select('id, batch_number, company_id')
    .eq('id', batchId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: 'batch_not_found' }, { status: 404 });
  }

  const { data: jeIdRows } = await admin
    .from('journal_entries')
    .select('id')
    .eq('batch_id', batch.id)
    .eq('company_id', company.id);
  const jeIds = (jeIdRows ?? []).map((r) => r.id as string);

  if (jeIds.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן באצווה זו לייצוא חוזר' },
      { status: 400 },
    );
  }

  const validJEs = await loadValidJEs(jeIds, admin);
  if (validJEs.length === 0) {
    return NextResponse.json(
      { error: 'פקודות היומן באצווה אינן תקינות' },
      { status: 400 },
    );
  }

  const file = await buildMoveInFileAsync(
    validJEs,
    company.name,
    (batch.batch_number as string | null) ?? batch.id.slice(0, 6),
  );
  if (!file) {
    return NextResponse.json({ error: 'failed_to_build_file' }, { status: 500 });
  }

  return fileResponse(file);
}

/* ======================================================================
 * POST — create new export (creates batch, marks JEs exported)
 * Optional: ?je=<je_id> for single-JE export
 * ====================================================================== */

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

  // Find candidate JE ids
  let jeIdQ = admin
    .from('journal_entries')
    .select('id')
    .eq('company_id', company.id);
  if (singleJEId) {
    jeIdQ = jeIdQ.eq('id', singleJEId);
  } else {
    jeIdQ = jeIdQ.in('status', ['draft', 'validated', 'approved']);
  }
  const { data: jeIdRows, error: jeErr } = await jeIdQ;
  if (jeErr) return NextResponse.json({ error: jeErr.message }, { status: 500 });

  const jeIds = (jeIdRows ?? []).map((r) => r.id as string);
  if (jeIds.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן לייצוא' },
      { status: 400 },
    );
  }

  const validJEs = await loadValidJEs(jeIds, admin);
  if (validJEs.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן תקינות לייצוא — בדוק איזון ושורות חובה/זכות' },
      { status: 400 },
    );
  }

  // Millisecond timestamp alone can collide on concurrent exports — append a
  // random suffix so the batch number is actually unique.
  const batchNumber = `${String(Date.now()).slice(-6)}-${randomUUID().slice(0, 4)}`;
  const file = await buildMoveInFileAsync(validJEs, company.name, batchNumber);
  if (!file) {
    return NextResponse.json({ error: 'failed_to_build_file' }, { status: 500 });
  }

  const exportedJEIds = validJEs.map((v) => v.je.id);
  const exportedInvoiceIds = validJEs
    .map((v) => v.je.invoice_id)
    .filter((v): v is string => !!v);

  const { data: batchRow } = await admin
    .from('movein_batches')
    .insert({
      company_id: company.id,
      batch_number: batchNumber,
      scenario_breakdown: {
        records: file.recordCount,
        format: file.useFlex ? 'flexible' : '180',
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
        record_count: file.recordCount,
        format: file.useFlex ? 'flexible' : '180',
        je_ids: exportedJEIds,
        exported_by: me.email,
      },
    });
  }

  return fileResponse(file);
}
