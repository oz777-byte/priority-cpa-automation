import { NextRequest, NextResponse } from 'next/server';
import { generateMoveIn } from '@priority-cpa/movein-generator';
import { findPocInvoice, loadPocInvoices } from '@/lib/poc-fixtures';
import { TARI_MOVEIN_CONFIG } from '@/lib/tari-context';

export async function POST(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');

  const invoices = slug
    ? [findPocInvoice(slug)].filter((x): x is NonNullable<typeof x> => x !== null)
    : loadPocInvoices();

  if (invoices.length === 0) {
    return NextResponse.json({ error: 'No invoices found' }, { status: 404 });
  }

  const buffer = generateMoveIn(invoices, TARI_MOVEIN_CONFIG);
  // Node Buffer → fresh ArrayBuffer (BodyInit-compatible across TS lib variants).
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  const filename = slug ? `movein-${slug}.dat` : 'movein.dat';

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(ab.byteLength),
    },
  });
}
