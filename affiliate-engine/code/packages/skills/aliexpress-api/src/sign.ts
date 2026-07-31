import { createHash, createHmac } from 'node:crypto';

/**
 * Request signing for the AliExpress open platform gateway.
 *
 * The scheme is the classic TOP one: sort every parameter by key, concatenate
 * key and value with no delimiter, then sign the result. Two variants exist and
 * both are still accepted, so both are implemented — an app provisioned for one
 * fails closed against the other with an opaque "invalid signature" error, and
 * being able to switch is the fastest way to tell which you were given.
 */

export type SignMethod = 'sha256' | 'md5';

/**
 * Parameters excluded from the signature. `sign` itself obviously cannot be
 * part of what it signs, and binary uploads are excluded by the protocol.
 */
const UNSIGNED_KEYS = new Set(['sign']);

export function buildSignatureBase(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => !UNSIGNED_KEYS.has(key) && params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');
}

export function signRequest(
  params: Record<string, string>,
  appSecret: string,
  method: SignMethod = 'sha256',
): string {
  const base = buildSignatureBase(params);

  if (method === 'md5') {
    // The md5 variant wraps the payload in the secret on both sides.
    return createHash('md5').update(`${appSecret}${base}${appSecret}`, 'utf8').digest('hex').toUpperCase();
  }

  return createHmac('sha256', appSecret).update(base, 'utf8').digest('hex').toUpperCase();
}

/**
 * Gateway timestamps are epoch milliseconds as a string. The clock is injected
 * rather than read here so that a signature is reproducible in a test.
 */
export function formatTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`timestamp must be a finite epoch in milliseconds, got: ${epochMs}`);
  }
  return String(Math.floor(epochMs));
}
