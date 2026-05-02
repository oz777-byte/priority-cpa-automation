import type { ExtractedInvoice, ExtractConfig } from './types.js';

const API_VERSION = '2023-07-31';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

interface AzureField {
  type?: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount: number; currencyCode?: string };
  content?: string;
  confidence?: number;
}

interface AzureDocument {
  fields?: Record<string, AzureField>;
}

interface AzureAnalyzeResult {
  status: 'notStarted' | 'running' | 'succeeded' | 'failed';
  analyzeResult?: { documents?: AzureDocument[] };
  error?: { message?: string };
}

export async function azureExtract(
  buffer: Buffer,
  config: Required<Pick<ExtractConfig, 'endpoint' | 'key'>> & { modelId: string },
): Promise<ExtractedInvoice> {
  const submitUrl = `${config.endpoint.replace(/\/$/, '')}/formrecognizer/documentModels/${
    config.modelId
  }:analyze?api-version=${API_VERSION}`;

  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.key,
      'Content-Type': 'application/pdf',
    },
    body: new Uint8Array(buffer),
  });

  if (submit.status !== 202) {
    const text = await submit.text();
    throw new Error(`Azure submit failed (${submit.status}): ${text}`);
  }
  const operationLocation = submit.headers.get('operation-location');
  if (!operationLocation) {
    throw new Error('Azure: missing operation-location header');
  }

  const result = await pollAzure(operationLocation, config.key);
  return mapAzureResponse(result);
}

async function pollAzure(
  operationLocation: string,
  key: string,
): Promise<AzureAnalyzeResult> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    const json = (await r.json()) as AzureAnalyzeResult;
    if (json.status === 'succeeded') return json;
    if (json.status === 'failed') {
      throw new Error(`Azure analysis failed: ${json.error?.message ?? 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Azure analysis timed out');
}

function mapAzureResponse(r: AzureAnalyzeResult): ExtractedInvoice {
  const doc = r.analyzeResult?.documents?.[0];
  const f = doc?.fields ?? {};

  const fieldString = (name: string): string | undefined =>
    f[name]?.valueString ?? f[name]?.content ?? undefined;
  const fieldNumber = (name: string): number | undefined => {
    const v = f[name];
    if (!v) return undefined;
    if (typeof v.valueNumber === 'number') return v.valueNumber;
    if (v.valueCurrency?.amount !== undefined) return v.valueCurrency.amount;
    if (v.content) {
      const n = Number.parseFloat(v.content.replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };
  const fieldDate = (name: string): string | undefined => {
    const v = f[name];
    if (!v) return undefined;
    if (v.valueDate) return v.valueDate;
    if (v.content) {
      // Try to parse common date formats; return ISO if it works.
      const parsed = Date.parse(v.content);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
    return undefined;
  };

  // Average the confidences of the fields we successfully extracted.
  const confidences = Object.values(f)
    .map((x) => x.confidence)
    .filter((x): x is number => typeof x === 'number');
  const avgConfidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((s, x) => s + x, 0) / confidences.length;

  return {
    supplier: {
      name: fieldString('VendorName'),
      tax_id: fieldString('VendorTaxId'),
    },
    invoice: {
      number: fieldString('InvoiceId'),
      date: fieldDate('InvoiceDate'),
      currency: f.InvoiceTotal?.valueCurrency?.currencyCode ?? 'ILS',
    },
    totals: {
      subtotal: fieldNumber('SubTotal'),
      vat_amount: fieldNumber('TotalTax'),
      total: fieldNumber('InvoiceTotal'),
    },
    confidence: Math.round(avgConfidence * 100) / 100,
    source: 'azure',
  };
}
