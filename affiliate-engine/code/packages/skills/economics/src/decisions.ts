import { currencyExponent, formatMinor } from '@affiliate/offer-schema';
import type { AssetMetrics } from './metrics.ts';
import { daysBetween } from './metrics.ts';

/**
 * Turns metrics into a single recommended action per asset.
 *
 * The whole point of the system is answering "what should I work on for the
 * next two hours", so a report that stops at numbers is a report that failed.
 */

export type Action = 'scale' | 'hold' | 'investigate' | 'kill' | 'insufficient_data';

export interface DecisionThresholds {
  /** Below this click count no judgement is made — a zero here is noise, not signal. */
  minClicks: number;
  /** Assets younger than this are given time regardless of their numbers. */
  minAgeDays: number;
  /** EPC (minor units) at or above which an asset is worth expanding. */
  scaleEpcMinor: number;
  /** EPC below which an asset is a candidate for removal. */
  killEpcMinor: number;
  /** A reversal rate above this warrants investigation rather than celebration. */
  maxReversalRate: number;
  /**
   * Clicks with zero conversions that suggest broken tracking rather than a
   * weak page. Distinct from `minClicks`: a page can convert badly, but a page
   * with hundreds of clicks and literally nothing is usually a plumbing fault.
   */
  brokenTrackingClicks: number;
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  minClicks: 100,
  minAgeDays: 90,
  scaleEpcMinor: 100, // $1.00 per click
  killEpcMinor: 15, // $0.15 per click
  maxReversalRate: 0.3,
  brokenTrackingClicks: 250,
};

/**
 * Thresholds for marketplace programmes selling low-value physical goods.
 *
 * Applying the default thresholds to this traffic would mark every page as a
 * kill: a few percent of a small order is cents per conversion, so an EPC two
 * orders of magnitude below the software floor is normal rather than a
 * failure. Two consequences follow, and both are encoded here.
 *
 * First, the click floor rises sharply. At these commissions a hundred clicks
 * can easily return zero through ordinary luck, so a judgement made on that
 * sample says nothing.
 *
 * Second, the reversal tolerance rises. Physical orders get cancelled, refunded
 * and returned at rates that would signal fraud in a software programme.
 *
 * Raising the bar back up is the whole point of moving off this preset — a
 * portfolio that stays here indefinitely is one that never found its business.
 */
export const PHYSICAL_GOODS_THRESHOLDS: DecisionThresholds = {
  minClicks: 1000,
  minAgeDays: 60,
  // Calibration, for a $15 order paying about 4%: a page converting 3% of its
  // clicks earns roughly two cents per click. That is a working page, so the
  // kill floor sits below it and the scale bar above it — reaching `scale`
  // here takes an unusually good page, which is the honest picture.
  scaleEpcMinor: 4, // $0.04 per click
  killEpcMinor: 1, // $0.01 per click
  maxReversalRate: 0.45,
  brokenTrackingClicks: 800,
};

export interface Recommendation {
  assetId: string;
  title: string;
  action: Action;
  /** Plain-language justification, safe to render directly in the UI. */
  reason: string;
  /**
   * Ranking weight for the decision list. Higher means more worth doing next.
   * Combines how much is at stake with how confident the signal is.
   */
  priority: number;
  metrics: AssetMetrics;
}

export interface RecommendContext {
  /** Injected so the same inputs always produce the same output in tests. */
  today: string;
  publishedAt?: string | null;
  thresholds?: Partial<DecisionThresholds>;
}

export function recommendAction(
  metrics: AssetMetrics,
  context: RecommendContext,
): Recommendation {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...context.thresholds };
  const base = { assetId: metrics.assetId, title: metrics.title, metrics };

  // Broken tracking is checked before anything else. A page with hundreds of
  // clicks and no conversions at all is far more likely to have a dropped
  // SubID than to be genuinely worthless, and killing it would destroy an
  // asset over a plumbing fault.
  if (metrics.clicks >= thresholds.brokenTrackingClicks && metrics.conversionsTotal === 0) {
    return {
      ...base,
      action: 'investigate',
      reason: `${metrics.clicks} clicks and not one conversion — verify the SubID survives the redirect before judging this page`,
      priority: 90 + Math.min(10, metrics.clicks / 500),
    };
  }

  if (metrics.clicks < thresholds.minClicks) {
    return {
      ...base,
      action: 'insufficient_data',
      reason: `only ${metrics.clicks} clicks, below the ${thresholds.minClicks}-click floor for a judgement`,
      priority: 10,
    };
  }

  const ageDays = context.publishedAt
    ? daysBetween(context.publishedAt, context.today)
    : null;

  if (metrics.reversalRate > thresholds.maxReversalRate) {
    return {
      ...base,
      action: 'investigate',
      reason: `${formatRate(metrics.reversalRate)} of conversions were reversed — check the offer terms and traffic quality`,
      priority: 70 + metrics.reversalRate * 20,
    };
  }

  if (metrics.epcMinor >= thresholds.scaleEpcMinor) {
    return {
      ...base,
      action: 'scale',
      reason: `EPC of ${formatMoney(metrics.epcMinor, metrics.currency)} is above the scale threshold — expand this page and build more like it`,
      priority: 80 + Math.min(20, metrics.epcMinor / thresholds.scaleEpcMinor),
    };
  }

  if (metrics.epcMinor < thresholds.killEpcMinor) {
    if (ageDays !== null && ageDays < thresholds.minAgeDays) {
      return {
        ...base,
        action: 'hold',
        reason: `EPC is low but the page is only ${ageDays} days old — organic traffic has not settled yet`,
        priority: 20,
      };
    }
    return {
      ...base,
      action: 'kill',
      reason: `EPC of ${formatMoney(metrics.epcMinor, metrics.currency)} after ${metrics.clicks} clicks is below the floor — rewrite around a different offer or retire the page`,
      priority: 50,
    };
  }

  return {
    ...base,
    action: 'hold',
    reason: `EPC of ${formatMoney(metrics.epcMinor, metrics.currency)} is workable but not exceptional — leave it and revisit next quarter`,
    priority: 30,
  };
}

/**
 * Ranks every asset by what deserves attention next. Ties break on approved
 * revenue, so when two pages are equally urgent the more valuable one is
 * addressed first.
 */
export function rankRecommendations(recommendations: Recommendation[]): Recommendation[] {
  return [...recommendations].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.metrics.approvedRevenueMinor - a.metrics.approvedRevenueMinor;
  });
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

/**
 * EPC is a rate, so it is fractional even though it is measured in minor
 * units. Rounding to whole minor units keeps the message readable without
 * changing the decision, which was already made against the exact value.
 *
 * Marketplace traffic earns well under a cent per click, where that rounding
 * would print "0.00" and hide the difference between a thin page and a dead
 * one — so sub-cent rates keep extra decimals instead.
 */
function formatMoney(minor: number, currency: string): string {
  if (minor !== 0 && Math.abs(minor) < 1) {
    const exponent = currencyExponent(currency);
    return `${(minor / 10 ** exponent).toFixed(exponent + 2)} ${currency.toUpperCase()}`;
  }
  return formatMinor(Math.round(minor), currency);
}
