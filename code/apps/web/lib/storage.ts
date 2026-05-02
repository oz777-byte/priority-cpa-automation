import { randomUUID } from 'node:crypto';
import { getAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'invoice-pdfs';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Upload an invoice PDF to Supabase Storage under <companyId>/<uuid>.pdf.
 * Returns the storage path (not a URL — generate a signed URL on demand).
 */
export async function uploadInvoicePdf(
  companyId: string,
  buffer: Buffer,
  originalFileName: string,
): Promise<{ path: string }> {
  const ext = originalFileName.toLowerCase().endsWith('.pdf') ? '' : '.pdf';
  const safeName = `${randomUUID()}${ext || '.pdf'}`;
  const path = `${companyId}/${safeName}`;

  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  return { path };
}

/**
 * Generate a short-lived signed URL for reading a stored invoice PDF.
 * Returns null if the file doesn't exist.
 */
export async function getInvoicePdfSignedUrl(path: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Delete a stored invoice PDF. Used when an invoice is removed.
 * Errors are swallowed — storage is best-effort.
 */
export async function deleteInvoicePdf(path: string): Promise<void> {
  const admin = getAdminClient();
  await admin.storage.from(BUCKET).remove([path]);
}
