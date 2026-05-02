import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Look up the closest stored BOI rate for a given currency on or before
 * `asOfDate`. Returns null if nothing is cached.
 *
 * Used by manual invoice creation + JE constructor wiring to auto-fill
 * fx_rate when a foreign-currency invoice doesn't carry one explicitly.
 */
export async function getRateForDate(
  currency: string,
  asOfDate: string, // YYYY-MM-DD
): Promise<{ rate: number; rateDate: string; source: string } | null> {
  if (currency === 'ILS') return null;
  const admin = getAdminClient();
  const { data } = await admin
    .from('fx_rates')
    .select('rate, rate_date, source')
    .eq('currency', currency)
    .lte('rate_date', asOfDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    rate: Number(data.rate),
    rateDate: data.rate_date as string,
    source: data.source as string,
  };
}

/**
 * Latest cached rates per currency (one row each, most recent date).
 * Used by the settings UI to display "current rates" + last-fetched.
 */
export async function getLatestRatesPerCurrency(): Promise<
  Array<{ currency: string; rate: number; rateDate: string; source: string }>
> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('fx_rates')
    .select('currency, rate, rate_date, source')
    .order('rate_date', { ascending: false })
    .limit(200);
  const seen = new Set<string>();
  const result: Array<{
    currency: string;
    rate: number;
    rateDate: string;
    source: string;
  }> = [];
  for (const row of data ?? []) {
    const cur = row.currency as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    result.push({
      currency: cur,
      rate: Number(row.rate),
      rateDate: row.rate_date as string,
      source: row.source as string,
    });
  }
  return result.sort((a, b) => a.currency.localeCompare(b.currency));
}
