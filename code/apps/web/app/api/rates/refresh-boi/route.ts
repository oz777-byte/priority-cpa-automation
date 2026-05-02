import { NextRequest, NextResponse } from 'next/server';
import { fetchBoiRates } from '@priority-cpa/boi-rates';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth';

/**
 * Refresh the BOI FX rate cache. Two callers:
 *   1. A logged-in user clicking "refresh now" in settings.
 *   2. Vercel Cron, sending a request with header
 *      `Authorization: Bearer ${CRON_SECRET}`.
 *
 * In both cases we upsert into fx_rates and write an audit log row.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCron =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let userId = '';
  let userEmail = '(cron)';
  if (!isCron) {
    const me = await requireUser();
    userId = me.id;
    userEmail = me.email;
  }

  const result = await fetchBoiRates();
  const admin = getAdminClient();

  const records = result.rates.map((r) => ({
    rate_date: result.rateDate,
    currency: r.currency,
    rate: r.rate,
    source: result.source,
    fetched_at: result.fetchedAt,
  }));

  const { error } = await admin
    .from('fx_rates')
    .upsert(records, { onConflict: 'rate_date,currency' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const audit = new SupabaseAuditStore(admin);
  await audit.log({
    companyId: '',
    userId,
    action: 'fx_rates.refresh',
    entityType: 'fx_rates',
    entityId: result.rateDate,
    payload: {
      source: result.source,
      rate_date: result.rateDate,
      currencies: result.rates.map((r) => r.currency),
      count: result.rates.length,
      requested_by: userEmail,
      ...(result.error ? { fetch_error: result.error } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    source: result.source,
    rateDate: result.rateDate,
    count: result.rates.length,
    rates: result.rates,
    ...(result.error ? { warning: result.error } : {}),
  });
}

// Allow GET too so Vercel Cron's default GET works.
export const GET = POST;
