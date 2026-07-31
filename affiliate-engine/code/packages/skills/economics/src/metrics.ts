/**
 * Unit economics for a content asset.
 *
 * Every money value is an integer in minor units. Rates are returned as plain
 * ratios (0.023), not percentages — formatting is a UI concern.
 */

export interface AssetInput {
  assetId: string;
  title: string;
  clicks: number;
  /** Page views, when known. Required for RPM. */
  pageviews?: number;
  /** Conversions in any state, including ones later reversed. */
  conversionsTotal: number;
  conversionsApproved: number;
  conversionsReversed: number;
  /** Commission across all conversions, regardless of state. */
  grossRevenueMinor: number;
  /** Commission from approved conversions only. */
  approvedRevenueMinor: number;
  currency: string;
  hoursInvested: number;
  /** ISO date the asset was published, for age-based patience rules. */
  publishedAt?: string | null;
}

export interface AssetMetrics {
  assetId: string;
  title: string;
  clicks: number;
  conversionsTotal: number;
  conversionsApproved: number;
  conversionsReversed: number;
  /** Approved revenue per click — the headline number. */
  epcMinor: number;
  /** Gross revenue per click, before the network reverses anything. */
  grossEpcMinor: number;
  /** Conversions per click, on approved conversions. */
  conversionRate: number;
  /** Share of conversions the network actually approved. */
  approvalRate: number;
  reversalRate: number;
  /** Revenue per thousand pageviews. Null when pageviews are unknown. */
  rpmMinor: number | null;
  /** Approved revenue per hour invested. Null when no hours were recorded. */
  timeRoiMinor: number | null;
  approvedRevenueMinor: number;
  currency: string;
}

export function computeAssetMetrics(input: AssetInput): AssetMetrics {
  assertNonNegative(input.clicks, 'clicks');
  assertNonNegative(input.conversionsTotal, 'conversionsTotal');
  assertNonNegative(input.hoursInvested, 'hoursInvested');

  if (input.conversionsApproved + input.conversionsReversed > input.conversionsTotal) {
    throw new Error(
      `asset ${input.assetId}: approved + reversed conversions exceed the total`,
    );
  }

  return {
    assetId: input.assetId,
    title: input.title,
    clicks: input.clicks,
    conversionsTotal: input.conversionsTotal,
    conversionsApproved: input.conversionsApproved,
    conversionsReversed: input.conversionsReversed,
    epcMinor: ratio(input.approvedRevenueMinor, input.clicks),
    grossEpcMinor: ratio(input.grossRevenueMinor, input.clicks),
    conversionRate: ratio(input.conversionsApproved, input.clicks),
    approvalRate: ratio(input.conversionsApproved, input.conversionsTotal),
    reversalRate: ratio(input.conversionsReversed, input.conversionsTotal),
    rpmMinor:
      input.pageviews && input.pageviews > 0
        ? (input.approvedRevenueMinor / input.pageviews) * 1000
        : null,
    timeRoiMinor:
      input.hoursInvested > 0 ? input.approvedRevenueMinor / input.hoursInvested : null,
    approvedRevenueMinor: input.approvedRevenueMinor,
    currency: input.currency,
  };
}

/** Division that yields 0 rather than NaN or Infinity when the denominator is 0. */
function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function assertNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number, got: ${value}`);
  }
}

/** Whole days between two ISO dates. Time is always injected, never read from the clock. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error(`expected ISO dates (YYYY-MM-DD), got: ${fromIsoDate}, ${toIsoDate}`);
  }
  return Math.round((to - from) / 86_400_000);
}
