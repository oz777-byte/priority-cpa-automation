import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RATE_LIMIT,
  analyzeUserAgent,
  buildClickRecord,
  checkRateLimit,
  clientIp,
  createMemoryStore,
  dailySalt,
  hashIp,
  referrerHost,
  respectsDoNotTrack,
  shouldRecord,
  utcDate,
} from '../src/index.ts';
import type { ClickContext } from '../src/index.ts';

const NOW = Date.parse('2026-07-31T10:15:00Z');
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

function context(overrides: Partial<ClickContext> = {}): ClickContext {
  return {
    linkSlug: 'hx0000001abcdef',
    assetSlug: 'chargers-iphone',
    placement: 'table-row-1',
    offerId: 'offer-1',
    subId: 'chargers-iphone.table-row-1',
    now: NOW,
    ipSalt: 'test-secret',
    headers: { userAgent: CHROME, forwardedFor: '203.0.113.9, 70.41.3.18' },
    ...overrides,
  };
}

describe('privacy', () => {
  it('takes the client from the left of the proxy chain', () => {
    expect(clientIp({ forwardedFor: '203.0.113.9, 70.41.3.18' })).toBe('203.0.113.9');
    expect(clientIp({ realIp: '198.51.100.7' })).toBe('198.51.100.7');
    expect(clientIp({})).toBeNull();
  });

  it('rotates the salt daily, so a hash cannot link a visitor across days', () => {
    expect(dailySalt('s', '2026-07-31')).not.toBe(dailySalt('s', '2026-08-01'));
    expect(utcDate(NOW)).toBe('2026-07-31');
  });

  it('rejects a malformed salt date rather than silently reusing one', () => {
    expect(() => dailySalt('s', '31/07/2026')).toThrow(/ISO date/);
  });

  it('hashes an IP deterministically within a day and differently across days', async () => {
    const today = await hashIp('203.0.113.9', 'secret', NOW);
    const again = await hashIp('203.0.113.9', 'secret', NOW + 3600_000);
    const tomorrow = await hashIp('203.0.113.9', 'secret', NOW + 86_400_000);

    expect(today).toMatch(/^[0-9a-f]{64}$/);
    expect(again).toBe(today);
    expect(tomorrow).not.toBe(today);
  });

  it('refuses to hash without a secret, rather than producing a guessable one', async () => {
    expect(await hashIp('203.0.113.9', undefined, NOW)).toBeNull();
    expect(await hashIp(null, 'secret', NOW)).toBeNull();
  });

  it('keeps only the referrer host', () => {
    expect(referrerHost('https://www.google.com/search?q=personal+thing')).toBe('www.google.com');
    expect(referrerHost('not a url')).toBeNull();
    expect(referrerHost(null)).toBeNull();
  });

  it('honours both do-not-track signals', () => {
    expect(respectsDoNotTrack({ dnt: '1' })).toBe(true);
    expect(respectsDoNotTrack({ gpc: '1' })).toBe(true);
    expect(respectsDoNotTrack({ dnt: '0' })).toBe(false);
    expect(respectsDoNotTrack({})).toBe(false);
  });
});

describe('analyzeUserAgent', () => {
  it('classifies real browsers', () => {
    expect(analyzeUserAgent(CHROME)).toMatchObject({ device: 'desktop', browser: 'Chrome', isBot: false });
    expect(analyzeUserAgent(IPHONE)).toMatchObject({ device: 'mobile', browser: 'Safari', isBot: false });
  });

  it('picks the specific browser over the engine it borrows from', () => {
    // Edge and Opera both carry "Chrome"; Chrome carries "Safari".
    expect(analyzeUserAgent(`${CHROME} Edg/131.0.0.0`).browser).toBe('Edge');
    expect(analyzeUserAgent(`${CHROME} OPR/116.0.0.0`).browser).toBe('Opera');
  });

  it('reads Android without "Mobile" as a tablet', () => {
    expect(analyzeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/131.0').device).toBe('tablet');
    expect(analyzeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S928B Mobile) Chrome/131.0').device).toBe('mobile');
    expect(analyzeUserAgent('Mozilla/5.0 (iPad; CPU OS 18_1) Safari/604.1').device).toBe('tablet');
  });

  it('flags crawlers, tools and scripted clients', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Mozilla/5.0 HeadlessChrome/131.0.0.0',
      'facebookexternalhit/1.1',
      'AhrefsBot/7.0',
    ]) {
      expect(analyzeUserAgent(ua).isBot).toBe(true);
    }
  });

  it('treats a missing user agent as a bot', () => {
    // Far more often a script than a browser, and counting it would inflate
    // the click denominator that EPC divides by.
    expect(analyzeUserAgent(undefined).isBot).toBe(true);
    expect(analyzeUserAgent('').isBot).toBe(true);
  });
});

describe('buildClickRecord', () => {
  it('records the attribution fields and a hashed IP', async () => {
    const record = await buildClickRecord(context());
    expect(record.subId).toBe('chargers-iphone.table-row-1');
    expect(record.assetSlug).toBe('chargers-iphone');
    expect(record.placement).toBe('table-row-1');
    expect(record.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.device).toBe('desktop');
    expect(record.createdAt).toBe('2026-07-31T10:15:00.000Z');
  });

  it('never carries a raw IP or a full user agent into the record', async () => {
    const record = await buildClickRecord(
      context({
        headers: {
          userAgent: CHROME,
          forwardedFor: '203.0.113.9',
          referrer: 'https://www.google.com/search?q=something+private',
        },
      }),
    );
    const serialised = JSON.stringify(record);
    expect(serialised).not.toContain('203.0.113.9');
    expect(serialised).not.toContain('AppleWebKit');
    expect(serialised).not.toContain('q=something+private');
    expect(record.referrerHost).toBe('www.google.com');
  });

  it('drops every linking identifier under do-not-track, but still counts the click', async () => {
    const record = await buildClickRecord(
      context({ headers: { userAgent: CHROME, forwardedFor: '203.0.113.9', dnt: '1' } }),
    );
    expect(record.ipHash).toBeNull();
    expect(record.visitorHash).toBeNull();
    expect(record.subId).toBe('chargers-iphone.table-row-1');
    expect(shouldRecord(record)).toBe(true);
  });

  it('stores no IP hash when no salt is configured', async () => {
    const record = await buildClickRecord(context({ ipSalt: undefined }));
    expect(record.ipHash).toBeNull();
  });

  it('marks bot traffic so it is dropped rather than stored with a flag', async () => {
    const record = await buildClickRecord(context({ headers: { userAgent: 'curl/8.4.0' } }));
    expect(record.isBot).toBe(true);
    expect(shouldRecord(record)).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('allows up to the limit inside a window', () => {
    const store = createMemoryStore();
    for (let i = 0; i < DEFAULT_RATE_LIMIT.limit; i += 1) {
      expect(checkRateLimit('ip-1', store, NOW).allowed).toBe(true);
    }
    const blocked = checkRateLimit('ip-1', store, NOW);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('starts a fresh window once the old one expires', () => {
    const store = createMemoryStore();
    const rules = { limit: 2, windowMs: 1000 };
    checkRateLimit('ip-1', store, NOW, rules);
    checkRateLimit('ip-1', store, NOW, rules);
    expect(checkRateLimit('ip-1', store, NOW, rules).allowed).toBe(false);
    expect(checkRateLimit('ip-1', store, NOW + 1001, rules).allowed).toBe(true);
  });

  it('keeps separate counters per key', () => {
    const store = createMemoryStore();
    const rules = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit('ip-1', store, NOW, rules).allowed).toBe(true);
    expect(checkRateLimit('ip-2', store, NOW, rules).allowed).toBe(true);
    expect(checkRateLimit('ip-1', store, NOW, rules).allowed).toBe(false);
  });

  it('caps memory so a warm instance cannot leak one entry per visitor', () => {
    const store = createMemoryStore(3);
    for (const key of ['a', 'b', 'c', 'd']) checkRateLimit(key, store, NOW);
    // 'a' was evicted, so it starts a fresh window rather than continuing one.
    expect(checkRateLimit('a', store, NOW).remaining).toBe(DEFAULT_RATE_LIMIT.limit - 1);
  });
});
