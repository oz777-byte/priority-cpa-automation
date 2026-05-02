import { NextRequest, NextResponse } from 'next/server';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { generateMoveIn } from '@priority-cpa/movein-generator';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildMoveInConfig, type CompanySettings } from '@/lib/company-config';

export async function POST(request: NextRequest) {
  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 400 });
  }

  const url = new URL(request.url);
  const single = url.searchParams.get('slug'); // optional UUID for single-invoice download

  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  // Pull invoices to export
  let q = admin
    .from('invoices_inbox')
    .select('id, canonical, status')
    .eq('company_id', company.id);
  if (single) {
    q = q.eq('id', single);
  } else {
    q = q.in('status', ['approved', 'exported']);
  }
  const { data: invRows, error: fetchErr } = await q;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!invRows || invRows.length === 0) {
    return NextResponse.json(
      { error: 'אין חשבוניות מאושרות לייצוא' },
      { status: 400 },
    );
  }

  const invoices: CanonicalInvoice[] = [];
  const exportedIds: string[] = [];
  for (const row of invRows) {
    const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
    if (!parsed.success) continue;
    invoices.push(parsed.data);
    exportedIds.push(row.id as string);
  }
  if (invoices.length === 0) {
    return NextResponse.json(
      { error: 'אין חשבוניות תקינות לייצוא' },
      { status: 400 },
    );
  }

  const settings = (company.settings ?? {}) as CompanySettings;
  const config = buildMoveInConfig(settings);
  const buffer = generateMoveIn(invoices, config);

  // Record the batch
  const batchNumber = String(Date.now()).slice(-6); // simple human-readable batch id
  const { data: batchRow } = await admin
    .from('movein_batches')
    .insert({
      company_id: company.id,
      batch_number: batchNumber,
      scenario_breakdown: { STANDARD: invoices.length },
      exported_at: new Date().toISOString(),
      exported_by: me.id,
      priority_load_status: 'pending',
    })
    .select('id')
    .single();
  const batchId = batchRow?.id as string | undefined;

  if (batchId) {
    // Mark invoices exported and link the batch on related JEs
    await admin
      .from('invoices_inbox')
      .update({ status: 'exported', processed_at: new Date().toISOString() })
      .in('id', exportedIds);

    await admin
      .from('journal_entries')
      .update({ status: 'exported', batch_id: batchId })
      .in('invoice_id', exportedIds);

    await audit.log({
      companyId: company.id,
      userId: me.id,
      action: 'batch.export',
      entityType: 'batch',
      entityId: batchId,
      payload: {
        batch_number: batchNumber,
        invoice_count: invoices.length,
        exported_by: me.email,
      },
    });
  }

  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const filename = single ? `movein-${batchNumber}.dat` : `movein-batch-${batchNumber}.dat`;

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(ab.byteLength),
    },
  });
}
