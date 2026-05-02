import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceFields, type ExtractedInvoice } from '@priority-cpa/ocr-azure';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { uploadInvoicePdf } from '@/lib/storage';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const me = await requireUser();

  const url = new URL(request.url);
  const companyIdParam = url.searchParams.get('companyId');
  if (!companyIdParam) {
    return NextResponse.json(
      { error: 'companyId query parameter required' },
      { status: 400 },
    );
  }
  // Verifies access (404s if the user isn't in the company's firm).
  const company = await loadCompanyForUser(me.id, me.email, companyIdParam);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'expected multipart/form-data' },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `קובץ גדול מדי — מקסימום ${MAX_BYTES / 1024 / 1024}MB` },
      { status: 400 },
    );
  }
  if (file.type && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'נא לגרור קובץ PDF בלבד' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Run extraction + storage upload in parallel — they're independent.
  const [extracted, uploadResult] = await Promise.all([
    extractInvoiceFields(buffer),
    uploadInvoicePdf(company.id, buffer, file.name).catch((err: unknown) => {
      console.error('[ocr] PDF upload failed:', err);
      return null;
    }),
  ]);
  const { raw: _raw, ...safe } = extracted as ExtractedInvoice;

  return NextResponse.json({
    ok: true,
    extracted: safe,
    fileName: file.name,
    fileSize: file.size,
    pdfPath: uploadResult?.path ?? null,
  });
}
