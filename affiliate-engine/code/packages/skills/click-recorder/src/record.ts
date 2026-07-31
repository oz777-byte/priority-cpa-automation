import { analyzeUserAgent } from './agent.ts';
import { clientIp, hashIp, referrerHost, respectsDoNotTrack } from './privacy.ts';

/**
 * Builds the row a click writes.
 *
 * Pure apart from the hash, so the whole decision — what gets stored, what is
 * deliberately left null — is testable without an HTTP server or a database.
 */

export interface ClickHeaders {
  userAgent?: string | null;
  referrer?: string | null;
  forwardedFor?: string | null;
  realIp?: string | null;
  dnt?: string | null;
  gpc?: string | null;
  country?: string | null;
}

export interface ClickContext {
  linkSlug: string;
  assetSlug: string;
  placement: string;
  offerId: string;
  subId: string;
  headers: ClickHeaders;
  /** Injected; never read from the clock inside this module. */
  now: number;
  /** Absent means no IP hash is stored at all. */
  ipSalt?: string;
}

export interface ClickRecord {
  linkSlug: string;
  assetSlug: string;
  placement: string;
  offerId: string;
  subId: string;
  ipHash: string | null;
  visitorHash: string | null;
  device: string;
  browser: string | null;
  country: string | null;
  referrerHost: string | null;
  isBot: boolean;
  createdAt: string;
}

export async function buildClickRecord(context: ClickContext): Promise<ClickRecord> {
  const agent = analyzeUserAgent(context.headers.userAgent);
  const doNotTrack = respectsDoNotTrack(context.headers);

  const ip = clientIp(context.headers);
  const ipHash = doNotTrack ? null : await hashIp(ip, context.ipSalt, context.now);

  return {
    linkSlug: context.linkSlug,
    assetSlug: context.assetSlug,
    placement: context.placement,
    offerId: context.offerId,
    subId: context.subId,
    ipHash,
    // The visitor hash is the only value that could link two clicks together,
    // so it is the one Do Not Track drops. The click itself is still counted:
    // that is aggregate, not personal.
    visitorHash: doNotTrack ? null : ipHash,
    device: agent.device,
    browser: agent.browser,
    country: context.headers.country ?? null,
    referrerHost: referrerHost(context.headers.referrer),
    isBot: agent.isBot,
    createdAt: new Date(context.now).toISOString(),
  };
}

/**
 * Whether a click is worth writing at all.
 *
 * Bot traffic is dropped rather than stored with a flag. Keeping it would mean
 * every query downstream has to remember to exclude it, and the one that
 * forgets reports a deflated EPC that argues for killing a working page.
 */
export function shouldRecord(record: ClickRecord): boolean {
  return !record.isBot;
}
