import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  PHYSICAL_GOODS_THRESHOLDS,
  computeAssetMetrics,
  daysBetween,
  rankRecommendations,
  recommendAction,
} from '../src/index';
import type { AssetInput } from '../src/index';

const TODAY = '2026-07-31';

function asset(overrides: Partial<AssetInput> = {}): AssetInput {
  return {
    assetId: 'a1',
    title: 'Israeli invoicing tools compared',
    clicks: 500,
    pageviews: 5000,
    conversionsTotal: 12,
    conversionsApproved: 10,
    conversionsReversed: 2,
    grossRevenueMinor: 60000,
    approvedRevenueMinor: 50000,
    currency: 'USD',
    hoursInvested: 8,
    publishedAt: '2025-01-15',
    ...overrides,
  };
}

describe('computeAssetMetrics', () => {
  it('computes the core rates', () => {
    const m = computeAssetMetrics(asset());
    expect(m.epcMinor).toBe(100); // $500.00 over 500 clicks
    expect(m.grossEpcMinor).toBe(120);
    expect(m.conversionRate).toBeCloseTo(0.02);
    expect(m.approvalRate).toBeCloseTo(10 / 12);
    expect(m.reversalRate).toBeCloseTo(2 / 12);
    expect(m.rpmMinor).toBe(10000);
    expect(m.timeRoiMinor).toBe(6250);
  });

  it('returns zero rather than dividing by zero on a brand new asset', () => {
    const m = computeAssetMetrics(
      asset({
        clicks: 0,
        pageviews: 0,
        conversionsTotal: 0,
        conversionsApproved: 0,
        conversionsReversed: 0,
        grossRevenueMinor: 0,
        approvedRevenueMinor: 0,
        hoursInvested: 0,
      }),
    );
    expect(m.epcMinor).toBe(0);
    expect(m.conversionRate).toBe(0);
    expect(m.approvalRate).toBe(0);
    expect(m.rpmMinor).toBeNull();
    expect(m.timeRoiMinor).toBeNull();
  });

  it('separates gross from approved revenue', () => {
    // EPC before approval is a fiction — the network reverses a share of it.
    const m = computeAssetMetrics(asset({ grossRevenueMinor: 100000 }));
    expect(m.grossEpcMinor).toBe(200);
    expect(m.epcMinor).toBe(100);
  });

  it('rejects impossible conversion counts', () => {
    expect(() =>
      computeAssetMetrics(asset({ conversionsTotal: 5, conversionsApproved: 10 })),
    ).toThrow(/exceed the total/);
  });

  it('rejects negative inputs', () => {
    expect(() => computeAssetMetrics(asset({ clicks: -1 }))).toThrow(/non-negative/);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-07-31', '2026-07-31')).toBe(0);
  });

  it('rejects malformed dates', () => {
    expect(() => daysBetween('31/07/2026', TODAY)).toThrow(/ISO dates/);
  });
});

describe('recommendAction', () => {
  it('refuses to judge an asset below the click floor', () => {
    const m = computeAssetMetrics(asset({ clicks: 40, conversionsTotal: 0, conversionsApproved: 0, conversionsReversed: 0, approvedRevenueMinor: 0, grossRevenueMinor: 0 }));
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2025-01-15' });
    expect(rec.action).toBe('insufficient_data');
    expect(rec.reason).toMatch(/below the 100-click floor/);
  });

  it('flags broken tracking instead of killing a page with no conversions at all', () => {
    const m = computeAssetMetrics(
      asset({
        clicks: 340,
        conversionsTotal: 0,
        conversionsApproved: 0,
        conversionsReversed: 0,
        grossRevenueMinor: 0,
        approvedRevenueMinor: 0,
      }),
    );
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2024-01-01' });
    expect(rec.action).toBe('investigate');
    expect(rec.reason).toMatch(/SubID survives the redirect/);
  });

  it('recommends scaling a high-EPC asset', () => {
    const m = computeAssetMetrics(asset({ approvedRevenueMinor: 90000 }));
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2025-01-15' });
    expect(rec.action).toBe('scale');
    expect(rec.reason).toMatch(/above the scale threshold/);
  });

  it('recommends killing a mature low-EPC asset', () => {
    const m = computeAssetMetrics(
      asset({ approvedRevenueMinor: 2000, conversionsApproved: 1, conversionsReversed: 0, conversionsTotal: 1 }),
    );
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2025-01-15' });
    expect(rec.action).toBe('kill');
  });

  it('holds a young low-EPC asset rather than killing it early', () => {
    const m = computeAssetMetrics(
      asset({ approvedRevenueMinor: 2000, conversionsApproved: 1, conversionsReversed: 0, conversionsTotal: 1 }),
    );
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2026-06-20' });
    expect(rec.action).toBe('hold');
    expect(rec.reason).toMatch(/only 41 days old/);
  });

  it('investigates a high reversal rate before trusting the revenue', () => {
    const m = computeAssetMetrics(
      asset({ conversionsTotal: 10, conversionsApproved: 5, conversionsReversed: 5 }),
    );
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2025-01-15' });
    expect(rec.action).toBe('investigate');
    expect(rec.reason).toMatch(/50% of conversions were reversed/);
  });

  it('holds a merely adequate asset', () => {
    const m = computeAssetMetrics(asset({ approvedRevenueMinor: 25000 }));
    const rec = recommendAction(m, { today: TODAY, publishedAt: '2025-01-15' });
    expect(rec.action).toBe('hold');
    expect(rec.reason).toMatch(/workable but not exceptional/);
  });

  it('honours overridden thresholds', () => {
    const m = computeAssetMetrics(asset({ clicks: 120 }));
    const strict = recommendAction(m, {
      today: TODAY,
      publishedAt: '2025-01-15',
      thresholds: { minClicks: 500 },
    });
    expect(strict.action).toBe('insufficient_data');
  });

  it('never judges without a publish date beyond the click floor rules', () => {
    const m = computeAssetMetrics(
      asset({ approvedRevenueMinor: 2000, conversionsApproved: 1, conversionsReversed: 0, conversionsTotal: 1 }),
    );
    const rec = recommendAction(m, { today: TODAY });
    expect(rec.action).toBe('kill');
  });
});

describe('rankRecommendations', () => {
  it('puts the most urgent work first and breaks ties on revenue', () => {
    const broken = recommendAction(
      computeAssetMetrics(
        asset({
          assetId: 'broken',
          clicks: 400,
          conversionsTotal: 0,
          conversionsApproved: 0,
          conversionsReversed: 0,
          grossRevenueMinor: 0,
          approvedRevenueMinor: 0,
        }),
      ),
      { today: TODAY, publishedAt: '2024-01-01' },
    );
    const winner = recommendAction(
      computeAssetMetrics(asset({ assetId: 'winner', approvedRevenueMinor: 90000 })),
      { today: TODAY, publishedAt: '2025-01-15' },
    );
    const quiet = recommendAction(
      computeAssetMetrics(asset({ assetId: 'quiet', clicks: 20, conversionsTotal: 0, conversionsApproved: 0, conversionsReversed: 0, grossRevenueMinor: 0, approvedRevenueMinor: 0 })),
      { today: TODAY, publishedAt: '2025-01-15' },
    );

    const ranked = rankRecommendations([quiet, winner, broken]);
    expect(ranked.map((r) => r.assetId)).toEqual(['broken', 'winner', 'quiet']);
  });
});

describe('DEFAULT_THRESHOLDS', () => {
  it('keeps the decision floors as configuration, not magic numbers', () => {
    expect(DEFAULT_THRESHOLDS.minClicks).toBe(100);
    expect(DEFAULT_THRESHOLDS.killEpcMinor).toBeLessThan(DEFAULT_THRESHOLDS.scaleEpcMinor);
  });
});

describe('PHYSICAL_GOODS_THRESHOLDS', () => {
  // A marketplace page that is working: 1,200 clicks, 40 approved orders of
  // about $15 paying 4%, so roughly 60 cents a conversion and two cents a click.
  const marketplaceAsset = () =>
    computeAssetMetrics({
      assetId: 'usb-hubs',
      title: 'USB-C hubs compared',
      clicks: 1200,
      pageviews: 9000,
      conversionsTotal: 48,
      conversionsApproved: 40,
      conversionsReversed: 8,
      grossRevenueMinor: 2880,
      approvedRevenueMinor: 2400,
      currency: 'USD',
      hoursInvested: 6,
      publishedAt: '2026-02-01',
    });

  it('would be killed by the software thresholds despite converting fine', () => {
    const rec = recommendAction(marketplaceAsset(), {
      today: TODAY,
      publishedAt: '2026-02-01',
    });
    expect(rec.action).toBe('kill');
  });

  it('reads as viable under the physical-goods thresholds', () => {
    const rec = recommendAction(marketplaceAsset(), {
      today: TODAY,
      publishedAt: '2026-02-01',
      thresholds: PHYSICAL_GOODS_THRESHOLDS,
    });
    expect(rec.action).toBe('hold');
  });

  it('still kills a marketplace page that earns nothing per click', () => {
    const dead = computeAssetMetrics({
      assetId: 'phone-cases',
      title: 'Phone cases roundup',
      clicks: 1500,
      conversionsTotal: 6,
      conversionsApproved: 5,
      conversionsReversed: 1,
      grossRevenueMinor: 360,
      approvedRevenueMinor: 300,
      currency: 'USD',
      hoursInvested: 5,
      publishedAt: '2026-01-01',
    });
    const rec = recommendAction(dead, {
      today: TODAY,
      publishedAt: '2026-01-01',
      thresholds: PHYSICAL_GOODS_THRESHOLDS,
    });
    expect(rec.action).toBe('kill');
    // Sub-cent EPC must stay legible rather than rounding to "0.00".
    expect(rec.reason).toMatch(/0\.0020 USD/);
  });

  it('demands far more clicks before judging, since commissions are tiny', () => {
    expect(PHYSICAL_GOODS_THRESHOLDS.minClicks).toBeGreaterThan(
      DEFAULT_THRESHOLDS.minClicks * 5,
    );
  });

  it('tolerates the cancellations and refunds physical orders bring', () => {
    expect(PHYSICAL_GOODS_THRESHOLDS.maxReversalRate).toBeGreaterThan(
      DEFAULT_THRESHOLDS.maxReversalRate,
    );
  });

  it('still refuses to judge a page below its own click floor', () => {
    const thin = computeAssetMetrics({
      assetId: 'thin',
      title: 'Too early to tell',
      clicks: 300,
      conversionsTotal: 0,
      conversionsApproved: 0,
      conversionsReversed: 0,
      grossRevenueMinor: 0,
      approvedRevenueMinor: 0,
      currency: 'USD',
      hoursInvested: 3,
    });
    const rec = recommendAction(thin, {
      today: TODAY,
      thresholds: PHYSICAL_GOODS_THRESHOLDS,
    });
    expect(rec.action).toBe('insufficient_data');
  });
});
