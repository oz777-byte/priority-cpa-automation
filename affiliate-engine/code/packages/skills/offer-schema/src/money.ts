/**
 * Money is carried as integer minor units (cents, agorot) throughout the
 * engine. Currencies with a different exponent are declared explicitly —
 * assuming "always 2 decimals" silently corrupts JPY and KWD amounts.
 */

const EXPONENT_OVERRIDES: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

const DEFAULT_EXPONENT = 2;

export function currencyExponent(currency: string): number {
  return EXPONENT_OVERRIDES[currency.toUpperCase()] ?? DEFAULT_EXPONENT;
}

/** "12.34" or 12.34 -> 1234 (for a 2-exponent currency). */
export function toMinor(amount: number | string, currency: string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error(`cannot convert non-finite amount to minor units: ${amount}`);
  }
  const factor = 10 ** currencyExponent(currency);
  // Round on a string to dodge binary representation edges such as 1.005.
  return Math.round(Number((value * factor).toPrecision(15)));
}

/** 1234 -> 12.34 (for a 2-exponent currency). */
export function fromMinor(minor: number, currency: string): number {
  assertMinor(minor);
  return minor / 10 ** currencyExponent(currency);
}

export function formatMinor(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return `${fromMinor(minor, currency).toFixed(exponent)} ${currency.toUpperCase()}`;
}

export function assertMinor(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`money must be an integer in minor units, got: ${value}`);
  }
}

/**
 * Applies a percentage to a minor-unit amount, rounding half away from zero.
 * Used for revshare payouts.
 */
export function percentOfMinor(minor: number, percent: number): number {
  assertMinor(minor);
  if (!Number.isFinite(percent)) {
    throw new Error(`percent must be finite, got: ${percent}`);
  }
  const raw = (minor * percent) / 100;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}
