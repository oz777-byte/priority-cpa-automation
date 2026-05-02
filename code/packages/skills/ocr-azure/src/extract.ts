import { azureExtract } from './azure.js';
import { mockExtract } from './mock.js';
import type { ExtractConfig, ExtractedInvoice } from './types.js';

/**
 * Extract structured invoice fields from a PDF buffer.
 *
 * Strategy: if both `endpoint` and `key` are provided in the config (or
 * pulled from env vars), call Azure Document Intelligence. Otherwise
 * return a deterministic mock so the rest of the pipeline stays exercisable.
 */
export async function extractInvoiceFields(
  buffer: Buffer,
  config: ExtractConfig = {},
): Promise<ExtractedInvoice> {
  const endpoint = config.endpoint ?? process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT;
  const key = config.key ?? process.env.AZURE_DOC_INTELLIGENCE_KEY;
  const modelId = config.modelId ?? 'prebuilt-invoice';

  if (endpoint && key) {
    try {
      return await azureExtract(buffer, { endpoint, key, modelId });
    } catch (err) {
      // If Azure fails, fall back to mock so the user can still proceed.
      // The error is surfaced to the caller via console; the mock is
      // labeled accordingly so the UI can show a soft warning.
      console.error('[ocr-azure] Azure call failed, falling back to mock:', err);
      return { ...mockExtract(buffer), source: 'mock' };
    }
  }

  return mockExtract(buffer);
}
