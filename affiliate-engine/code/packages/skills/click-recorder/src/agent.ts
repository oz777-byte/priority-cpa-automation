/**
 * User-agent handling.
 *
 * The full string is a fingerprinting surface and is never stored — only a
 * coarse device class and browser family, which is all the reporting needs.
 */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';

export interface AgentInfo {
  device: DeviceClass;
  browser: string | null;
  isBot: boolean;
}

/**
 * Bot signatures. Deliberately broad: a bot counted as a visitor inflates the
 * click denominator, which pushes EPC down and can make a healthy page look
 * like one worth killing. Over-matching costs a few real clicks in the
 * reporting; under-matching corrupts the decision the reporting exists for.
 */
const BOT_PATTERNS = [
  /bot\b/i, /crawler/i, /spider/i, /slurp/i, /scrape/i,
  /headless/i, /phantomjs/i, /puppeteer/i, /playwright/i, /selenium/i,
  /curl\//i, /wget\//i, /python-requests/i, /axios\//i, /node-fetch/i, /go-http-client/i,
  /facebookexternalhit/i, /whatsapp/i, /telegrambot/i, /twitterbot/i, /linkedinbot/i,
  /slackbot/i, /discordbot/i, /embedly/i, /pingdom/i, /uptimerobot/i, /lighthouse/i,
  /google-inspectiontool/i, /chrome-lighthouse/i, /ahrefsbot/i, /semrushbot/i, /mj12bot/i,
];

const BROWSERS: Array<{ name: string; match: RegExp }> = [
  // Order matters: several browsers carry "Chrome" or "Safari" in their own
  // strings, so the more specific families must be tested first.
  { name: 'Edge', match: /\bedg(?:e|a|ios)?\//i },
  { name: 'Opera', match: /\bopr\/|\bopera\//i },
  { name: 'Samsung Internet', match: /samsungbrowser\//i },
  { name: 'Firefox', match: /\bfxios\/|\bfirefox\//i },
  { name: 'Chrome', match: /\bcrios\/|\bchrome\//i },
  { name: 'Safari', match: /\bsafari\//i },
];

export function analyzeUserAgent(userAgent: string | null | undefined): AgentInfo {
  if (!userAgent || userAgent.trim() === '') {
    // A missing user agent is far more often a script than a browser.
    return { device: 'unknown', browser: null, isBot: true };
  }

  if (BOT_PATTERNS.some((pattern) => pattern.test(userAgent))) {
    return { device: 'bot', browser: null, isBot: true };
  }

  const browser = BROWSERS.find((candidate) => candidate.match.test(userAgent))?.name ?? null;

  return { device: classifyDevice(userAgent), browser, isBot: false };
}

function classifyDevice(userAgent: string): DeviceClass {
  if (/\bipad\b|\btablet\b|\bplaybook\b|\bsilk\b/i.test(userAgent)) return 'tablet';
  // Android without "Mobile" is a tablet, which is the one case the obvious
  // check gets backwards.
  if (/\bandroid\b/i.test(userAgent)) {
    return /\bmobile\b/i.test(userAgent) ? 'mobile' : 'tablet';
  }
  if (/\biphone\b|\bipod\b|\bmobile\b|\bwindows phone\b/i.test(userAgent)) return 'mobile';
  if (/\bmacintosh\b|\bwindows nt\b|\bx11\b|\bcros\b/i.test(userAgent)) return 'desktop';
  return 'unknown';
}
