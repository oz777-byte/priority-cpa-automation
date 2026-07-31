import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  buildClickRecord,
  checkRateLimit,
  clientIp,
  createMemoryStore,
  shouldRecord,
} from '@affiliate/click-recorder';
import { getLink } from '../../../lib/catalog';
import { isPreview } from '../../../lib/site';

/**
 * The redirect: /go/{token} records the click and sends the visitor on.
 *
 * This sits in the visitor's path to the marketplace, so latency here is
 * abandonment. Two decisions follow from that and shape everything else:
 *
 *   The destination is resolved from a map loaded with the bundle, so a click
 *   costs a lookup rather than a database round trip.
 *
 *   The click is written after the response, via `after`. A recording failure
 *   costs one row of reporting; making the visitor wait for it costs the sale
 *   the whole system exists to earn.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Per-instance and therefore approximate: an edge deployment runs many
// instances, so the real ceiling is higher than the configured one. This
// exists to stop one script from flooding the click table, not as a security
// boundary — that needs a shared store, which is a Phase 2 item.
const rateLimitStore = createMemoryStore();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const link = getLink(slug);

  if (!link) {
    // 404 rather than a redirect home: a dead affiliate link quietly bouncing
    // to the homepage hides the breakage it should be reporting.
    return new Response('לינק לא נמצא', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const now = Date.now();
  const headers = readHeaders(request);

  const ip = clientIp(headers) ?? 'unknown';
  const limit = checkRateLimit(ip, rateLimitStore, now);
  if (!limit.allowed) {
    return new Response('יותר מדי בקשות', {
      status: 429,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'retry-after': String(limit.retryAfterSeconds),
        'cache-control': 'no-store',
      },
    });
  }

  // In preview the catalog is sample data and the destinations are not real
  // affiliate links, so sending a visitor onward would be sending them to a
  // link that earns nothing and was never verified.
  if (isPreview) {
    return new Response(
      'האתר במצב תצוגה מקדימה — הקישורים ייפתחו כשחשבון השותפים יחובר.',
      {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }

  after(async () => {
    try {
      const record = await buildClickRecord({
        linkSlug: link.token,
        assetSlug: link.assetSlug,
        placement: link.placement,
        offerId: link.productId,
        subId: link.subId,
        headers,
        now,
        ...(process.env.CLICK_IP_SALT ? { ipSalt: process.env.CLICK_IP_SALT } : {}),
      });

      if (shouldRecord(record)) await persist(record);
    } catch {
      // Never let reporting break the redirect. The visitor has already left.
    }
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: link.targetUrl,
      // A cached redirect is a click that never reaches us, so the whole
      // chain is marked uncacheable.
      'cache-control': 'no-store, no-cache, must-revalidate',
      // Marketplaces read the referrer; sending only the origin keeps the
      // visitor's page path out of it.
      'referrer-policy': 'origin',
    },
  });
}

function readHeaders(request: NextRequest) {
  const get = (name: string) => request.headers.get(name);
  return {
    userAgent: get('user-agent'),
    referrer: get('referer'),
    forwardedFor: get('x-forwarded-for'),
    realIp: get('x-real-ip'),
    dnt: get('dnt'),
    gpc: get('sec-gpc'),
    country: get('x-vercel-ip-country'),
  };
}

/**
 * Writes through the Supabase REST endpoint rather than a client library: the
 * edge runtime has `fetch` and nothing else is needed for one insert.
 *
 * With no Supabase configured the click is dropped silently. That is correct
 * for a preview deployment and wrong for a live one, which is why the sync
 * script and the deployment checklist both treat the service key as required
 * before going live.
 */
async function persist(record: Awaited<ReturnType<typeof buildClickRecord>>): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  await fetch(`${url}/rest/v1/clicks`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      subid: record.subId,
      ip_hash: record.ipHash,
      visitor_hash: record.visitorHash,
      device: record.device,
      browser: record.browser,
      country: record.country,
      referrer_host: record.referrerHost,
      is_bot: record.isBot,
      created_at: record.createdAt,
    }),
  });
}
