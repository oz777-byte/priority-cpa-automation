import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceFields, type ExtractedInvoice } from '@priority-cpa/ocr-azure';
import { CanonicalInvoiceSchema } from '@priority-cpa/invoice-schema';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { getAdminClient } from '@/lib/supabase/admin';
import { uploadInvoicePdf } from '@/lib/storage';

/**
 * Inbound email webhook.
 *
 * Provider-agnostic: parses any multipart/form-data POST that includes
 * an `envelope` or `to` field plus one or more file attachments.
 * SendGrid Inbound Parse and Mailgun Routes both fit this shape.
 *
 * URL: /api/inbox/email/<INBOUND_EMAIL_SECRET>
 *   The secret in the path is checked against the env var to keep the
 *   endpoint from being scrapeable. Set INBOUND_EMAIL_SECRET in Vercel
 *   to a long random string and configure the same value in your
 *   provider's webhook URL.
 *
 * Recipient routing:
 *   The To address local-part is treated as the company's inbox_token.
 *   E.g. "ab12cd34ef@inbox.app.oz-nihul.com" → company.inbox_token =
 *   "ab12cd34ef". Plus-addressing is supported (we strip "+...").
 */
export async function POST(
  request: NextRequest,
  context: { params: { secret: string } },
) {
  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected || context.params.secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'expected multipart/form-data' },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const recipient = extractRecipient(form);
  if (!recipient) {
    return NextResponse.json({ error: 'missing To address' }, { status: 400 });
  }
  const inboxToken = parseInboxToken(recipient);
  if (!inboxToken) {
    return NextResponse.json({ error: 'invalid recipient' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: company } = await admin
    .from('companies')
    .select('id, name')
    .eq('inbox_token', inboxToken)
    .maybeSingle();
  if (!company) {
    // 200 so the provider doesn't retry forever on a typo'd address.
    return NextResponse.json({ ok: true, ignored: 'unknown_inbox_token' });
  }

  const subject = ((form.get('subject') as string | null) ?? '').trim();
  const fromAddress = ((form.get('from') as string | null) ?? '').trim();

  // Collect every File from the form. SendGrid names them attachment1/2/...
  // Mailgun names them attachment-1/2/... — picking up everything is fine.
  const pdfs: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File && value.size > 0 && isPdfLike(value)) {
      pdfs.push(value);
    }
  }

  const audit = new SupabaseAuditStore(admin);

  if (pdfs.length === 0) {
    await audit.log({
      companyId: company.id as string,
      userId: '',
      action: 'inbox.email_received',
      entityType: 'company',
      entityId: company.id as string,
      payload: {
        from: fromAddress,
        subject,
        attachments: 0,
        note: 'no PDF attachments',
      },
    });
    return NextResponse.json({ ok: true, attachments: 0 });
  }

  const created: string[] = [];
  const skipped: Array<{ fileName: string; reason: string }> = [];

  for (const file of pdfs) {
    try {
      const result = await ingestPdf(company.id as string, file, fromAddress, subject);
      if (result.invoiceId) created.push(result.invoiceId);
      else skipped.push({ fileName: file.name, reason: result.reason ?? 'unknown' });
    } catch (e) {
      skipped.push({
        fileName: file.name,
        reason: e instanceof Error ? e.message : 'error',
      });
    }
  }

  await audit.log({
    companyId: company.id as string,
    userId: '',
    action: 'inbox.email_received',
    entityType: 'company',
    entityId: company.id as string,
    payload: {
      from: fromAddress,
      subject,
      attachments: pdfs.length,
      created: created.length,
      skipped: skipped.length,
      created_invoice_ids: created,
      skipped_reasons: skipped,
    },
  });

  return NextResponse.json({
    ok: true,
    attachments: pdfs.length,
    created: created.length,
    skipped: skipped.length,
  });
}

/* ====================== helpers ====================== */

function extractRecipient(form: FormData): string | null {
  // SendGrid: "envelope" is a JSON string with `to: [...]`. Also has a `to` plain field.
  const envelope = form.get('envelope');
  if (typeof envelope === 'string') {
    try {
      const env = JSON.parse(envelope) as { to?: string | string[] };
      if (Array.isArray(env.to) && env.to.length > 0) return env.to[0]!;
      if (typeof env.to === 'string') return env.to;
    } catch {
      /* fall through */
    }
  }
  const to = form.get('to');
  if (typeof to === 'string') return to;
  // Mailgun convention
  const recipient = form.get('recipient');
  if (typeof recipient === 'string') return recipient;
  return null;
}

function parseInboxToken(recipient: string): string | null {
  // Recipient may be "Name <local@domain.tld>" or just "local@domain.tld"
  const m = recipient.match(/<?([^<>\s]+)@([^<>\s]+)>?/);
  if (!m) return null;
  let local = m[1]!;
  // Strip plus-addressing: "abc+anything" → "abc"
  const plusIdx = local.indexOf('+');
  if (plusIdx >= 0) local = local.slice(0, plusIdx);
  // Inbox tokens are 10 hex chars from the migration; allow alphanumerics
  // generally, length 6-32, lowercase only.
  const token = local.toLowerCase().trim();
  if (!/^[a-z0-9]{6,32}$/.test(token)) return null;
  return token;
}

function isPdfLike(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return true;
  return file.type.includes('pdf');
}

interface IngestResult {
  invoiceId?: string;
  reason?: string;
}

async function ingestPdf(
  companyId: string,
  file: File,
  fromAddress: string,
  subject: string,
): Promise<IngestResult> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const [extracted, uploadResult] = await Promise.all([
    extractInvoiceFields(buffer),
    uploadInvoicePdf(companyId, buffer, file.name).catch((err: unknown) => {
      console.error('[inbox.email] PDF upload failed:', err);
      return null;
    }),
  ]);

  const supplierName = extracted.supplier?.name?.trim();
  const supplierTaxId = extracted.supplier?.tax_id?.trim();
  const invoiceNumber = extracted.invoice?.number?.trim();
  const invoiceDate = extracted.invoice?.date;
  const subtotal = extracted.totals?.subtotal;
  const total = extracted.totals?.total;

  if (!supplierName || !invoiceNumber || !invoiceDate || total === undefined) {
    return { reason: 'incomplete OCR (missing supplier/number/date/total)' };
  }

  const admin = getAdminClient();

  // Resolve supplier internal code from the master, fall back to tax_id.
  let supplierInternalCode = supplierTaxId ?? '0';
  if (supplierTaxId) {
    const { data: existingSupplier } = await admin
      .from('suppliers')
      .select('internal_code')
      .eq('company_id', companyId)
      .eq('tax_id', supplierTaxId)
      .maybeSingle();
    if (existingSupplier) {
      supplierInternalCode = existingSupplier.internal_code as string;
    } else {
      await admin.from('suppliers').insert({
        company_id: companyId,
        internal_code: supplierTaxId,
        name: supplierName,
        tax_id: supplierTaxId,
      });
    }
  }

  const subtotalFinal = subtotal ?? Math.round((total / 1.18) * 100) / 100;
  const fingerprint = [
    (supplierTaxId ?? '').toLowerCase(),
    invoiceNumber,
    invoiceDate,
    total.toFixed(2),
  ].join('|');

  const { data: existing } = await admin
    .from('invoices_inbox')
    .select('id')
    .eq('company_id', companyId)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (existing) {
    return { reason: 'duplicate' };
  }

  const canonical = {
    invoice: {
      number: invoiceNumber,
      date: invoiceDate,
      currency: extracted.invoice?.currency ?? 'ILS',
      allocation_number: null,
    },
    supplier: {
      name: supplierName,
      tax_id: supplierTaxId ?? '',
      internal_code_priority: supplierInternalCode,
    },
    totals: {
      subtotal: subtotalFinal,
      total,
      vat_rate: invoiceDate >= '2025-01-01' ? 18 : 17,
      vat_amount: Math.round((total - subtotalFinal) * 100) / 100,
    },
    metadata: {
      source: 'email',
      ingested_at: new Date().toISOString(),
      original_filename: file.name,
      email_from: fromAddress,
      email_subject: subject,
    },
  };

  // Validate the canonical shape before insert.
  const parsed = CanonicalInvoiceSchema.safeParse(canonical);
  if (!parsed.success) {
    return { reason: 'canonical validation failed' };
  }

  const { data: row, error } = await admin
    .from('invoices_inbox')
    .insert({
      company_id: companyId,
      source: 'email',
      canonical: parsed.data,
      fingerprint,
      status: 'queued',
      ...(uploadResult?.path ? { pdf_path: uploadResult.path } : {}),
    })
    .select('id')
    .single();
  if (error || !row) {
    return { reason: error?.message ?? 'insert failed' };
  }

  return { invoiceId: row.id as string };
}
