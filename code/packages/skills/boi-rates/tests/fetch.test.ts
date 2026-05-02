import { describe, it, expect } from 'vitest';
import { fetchBoiRates } from '../src/index.js';

describe('fetchBoiRates — mock mode', () => {
  it('returns mock data when forceMock is true', async () => {
    const r = await fetchBoiRates({ forceMock: true });
    expect(r.source).toBe('mock');
    expect(r.rates.length).toBeGreaterThan(0);
  });

  it('mock includes the major currencies', async () => {
    const r = await fetchBoiRates({ forceMock: true });
    const codes = new Set(r.rates.map((x) => x.currency));
    expect(codes.has('USD')).toBe(true);
    expect(codes.has('EUR')).toBe(true);
    expect(codes.has('GBP')).toBe(true);
  });

  it('all rates are positive finite numbers', async () => {
    const r = await fetchBoiRates({ forceMock: true });
    for (const rate of r.rates) {
      expect(rate.rate).toBeGreaterThan(0);
      expect(Number.isFinite(rate.rate)).toBe(true);
    }
  });

  it('rateDate is ISO YYYY-MM-DD', async () => {
    const r = await fetchBoiRates({ forceMock: true });
    expect(r.rateDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to mock when URL is unreachable', async () => {
    const r = await fetchBoiRates({ url: 'https://invalid.example.invalid/api' });
    expect(r.source).toBe('mock');
    expect(r.error).toBeDefined();
  });
});
