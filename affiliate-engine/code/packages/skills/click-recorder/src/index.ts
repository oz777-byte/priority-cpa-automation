export type { AgentInfo, DeviceClass } from './agent.ts';
export { analyzeUserAgent } from './agent.ts';

export {
  clientIp,
  dailySalt,
  hashIp,
  referrerHost,
  respectsDoNotTrack,
  utcDate,
} from './privacy.ts';

export type {
  RateLimitEntry,
  RateLimitRules,
  RateLimitStore,
  RateLimitVerdict,
} from './rate-limit.ts';
export { DEFAULT_RATE_LIMIT, checkRateLimit, createMemoryStore } from './rate-limit.ts';

export type { ClickContext, ClickHeaders, ClickRecord } from './record.ts';
export { buildClickRecord, shouldRecord } from './record.ts';
