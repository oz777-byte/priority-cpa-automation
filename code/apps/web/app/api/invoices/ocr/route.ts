import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceFields, type ExtractedInvoice } from '@priority-cpa/ocr-azure';
import { requireUser } from '@/lib/auth';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  await requireUser();

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
    return NextResponse.json(
      { error: 'נא לגרור קובץ PDF בלבד' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const extracted: ExtractedInvoice = await extractInvoiceFields(buffer);
  // Strip `raw` from the API response — it can be large and is for debugging only.
  const { raw: _raw, ...safe } = extracted;

  return NextResponse.json({
    ok: true,
    extracted: safe,
    fileName: file.name,
    fileSize: file.size,
  });
}
