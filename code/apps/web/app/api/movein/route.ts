import { NextRequest, NextResponse } from 'next/server';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { buildRawRecord, encodeMoveInBuffer } from '@priority-cpa/movein-generator';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 400 });
  }

  const url = new URL(request.url);
  const singleJEId = url.searchParams.get('je'); // optional UUID for single-JE download

  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  // Pull JEs to export
  let jeQ = admin
    .from('journal_entries')
    .select('id, transaction_type, reference1, reference2, document_date, value_date, currency, details, status, invoice_id')
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
    .select('id, je_id, line_no, account, debit, credit')
    .in('je_id', jeIds)
    .order('line_no', { ascending: true });

  const linesByJE = new Map<string, Array<{ account: string; debit: number; credit: number }>>();
  for (const l of lineRows ?? []) {
    const arr = linesByJE.get(l.je_id as string) ?? [];
    arr.push({
      account: l.account as string,
      debit: Number(l.debit),
      credit: Number(l.credit),
    });
    linesByJE.set(l.je_id as string, arr);
  }

  const records: string[] = [];
  const exportedJEIds: string[] = [];
  const exportedInvoiceIds: string[] = [];

  for (const je of jeRows) {
    const lines = linesByJE.get(je.id as string) ?? [];
    const dr = lines.filter((l) => l.debit > 0).slice(0, 2);
    const cr = lines.filter((l) => l.credit > 0).slice(0, 2);
    if (dr.length === 0 || cr.length === 0) continue;

    // Balance check (within ±0.05)
    const drSum = lines.reduce((s, l) => s + l.debit, 0);
    const crSum = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(drSum - crSum) > 0.05) continue;

    try {
      records.push(
        buildRawRecord({
          transactionType: je.transaction_type as string,
          reference1: je.reference1 as string,
          reference2: (je.reference2 as string | null) ?? 0,
          documentDate: je.document_date as string,
          valueDate: je.value_date as string,
          currency: je.currency as string,
          details: je.details as string,
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
      exportedJEIds.push(je.id as string);
      if (je.invoice_id) exportedInvoiceIds.push(je.invoice_id as string);
    } catch {
      // record build failed — skip this JE silently for now (logs come later)
    }
  }

  if (records.length === 0) {
    return NextResponse.json(
      { error: 'אין פקודות יומן תקינות לייצוא — בדוק איזון ושורות חובה/זכות' },
      { status: 400 },
    );
  }

  const buffer = encodeMoveInBuffer(records);

  // Record the batch
  const batchNumber = String(Date.now()).slice(-6);
  const { data: batchRow } = await admin
    .from('movein_batches')
    .insert({
      company_id: company.id,
      batch_number: batchNumber,
      scenario_breakdown: { records: records.length },
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
        record_count: records.length,
        je_ids: exportedJEIds,
        exported_by: me.email,
      },
    });
  }

  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const filename = singleJEId
    ? `movein-${batchNumber}.dat`
    : `movein-batch-${batchNumber}.dat`;

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(ab.byteLength),
    },
  });
}
