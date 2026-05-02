/**
 * Bank of Israel daily FX rate fetcher.
 *
 * Strategy: try BOI's public API. If it returns an unexpected shape or
 * fails outright, fall back to a static mock so the rest of the system
 * keeps working. The mock returns realistic-looking rates fixed in time
 * so it's obvious to the user (via `source: 'mock'`) when real data
 * isn't flowing.
 *
 * BOI's API URL has changed historically — the endpoint is configurable
 * via the BOI_RATES_URL env var so future drift can be patched without
 * a code change.
 */

export interface BoiRate {
  currency: string; // 3-letter ISO (USD, EUR, GBP, ...)
  rate: number;     // ILS per 1 unit of the currency
  unit?: number;    // some BOI responses quote per 100 units (e.g. JPY)
}

export interface BoiFetchResult {
  rateDate: string;            // ISO YYYY-MM-DD
  rates: BoiRate[];
  source: 'boi' | 'mock';
  fetchedAt: string;
  error?: string | undefined;
}

const DEFAULT_BOI_URL = 'https://boi.org.il/PublicApi/GetExchangeRates';
const SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);

export async function fetchBoiRates(opts: {
  url?: string;
  forceMock?: boolean;
} = {}): Promise<BoiFetchResult> {
  const url = opts.url ?? process.env.BOI_RATES_URL ?? DEFAULT_BOI_URL;
  const today = new Date().toISOString().slice(0, 10);

  if (opts.forceMock) return mockResult(today);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // BOI's API can be slow; 10s is generous.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return mockResult(today, `BOI HTTP ${response.status}`);
    }
    const text = await response.text();
    const parsed = parseBoiResponse(text);
    if (!parsed || parsed.rates.length === 0) {
      return mockResult(today, 'BOI returned no rates');
    }
    return {
      rateDate: parsed.rateDate ?? today,
      rates: parsed.rates.filter((r) => SUPPORTED.has(r.currency)),
      source: 'boi',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return mockResult(today, err instanceof Error ? err.message : 'fetch failed');
  }
}

interface ParsedBoi {
  rateDate?: string | undefined;
  rates: BoiRate[];
}

/**
 * Tolerant parser. BOI's response has shifted shapes a few times — we
 * pick out whatever currency-rate pairs we can find, regardless of the
 * exact wrapper.
 */
function parseBoiResponse(text: string): ParsedBoi | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;

  const rates: BoiRate[] = [];
  let rateDate: string | undefined;

  // Walk the JSON looking for objects with a currency-rate shape.
  const stack: unknown[] = [json];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;

    // Capture the as-of date if it appears.
    if (typeof obj.AsOfDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(obj.AsOfDate)) {
      rateDate = obj.AsOfDate.slice(0, 10);
    }

    // Currency identification — try several common field names.
    const currency =
      pickString(obj, ['Key', 'Currency', 'CurrencyCode', 'currency', 'code']);
    const rateValue = pickNumber(obj, [
      'CurrentExchangeRate',
      'Rate',
      'rate',
      'Value',
      'value',
    ]);
    const unit = pickNumber(obj, ['Unit', 'unit']) ?? 1;

    if (currency && rateValue !== null) {
      const cur = currency.toUpperCase();
      // Normalize to "ILS per 1 unit"
      const normalized = unit > 0 ? rateValue / unit : rateValue;
      rates.push({ currency: cur, rate: roundTo6(normalized), unit });
    }

    // Recurse into children objects.
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }

  // Dedupe by currency, prefer the first occurrence.
  const seen = new Set<string>();
  const deduped = rates.filter((r) => {
    if (seen.has(r.currency)) return false;
    seen.add(r.currency);
    return true;
  });

  return { rateDate, rates: deduped };
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function roundTo6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function mockResult(today: string, error?: string): BoiFetchResult {
  // Realistic mid-2025 rates. Clearly tagged so the UI can warn.
  const rates: BoiRate[] = [
    { currency: 'USD', rate: 3.7, unit: 1 },
    { currency: 'EUR', rate: 4.05, unit: 1 },
    { currency: 'GBP', rate: 4.7, unit: 1 },
    { currency: 'CHF', rate: 4.2, unit: 1 },
    { currency: 'JPY', rate: 0.025, unit: 1 },
    { currency: 'AUD', rate: 2.45, unit: 1 },
    { currency: 'CAD', rate: 2.7, unit: 1 },
  ];
  return {
    rateDate: today,
    rates,
    source: 'mock',
    fetchedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}
