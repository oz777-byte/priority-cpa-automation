import { describe, it, expect } from 'vitest';
import {
  AliExpressApiError,
  buildSignatureBase,
  createAliExpressClient,
  createMockTransport,
  formatTimestamp,
  isRetryable,
  signRequest,
} from '../src/index';
import type { Transport } from '../src/index';

const FIXED_NOW = () => 1_785_000_000_000;

function makeClient(transport: Transport) {
  return createAliExpressClient({
    appKey: 'test-key',
    appSecret: 'test-secret',
    trackingId: 'ostech',
    now: FIXED_NOW,
    transport,
    defaults: { shipToCountry: 'IL', targetCurrency: 'USD', targetLanguage: 'HE' },
  });
}

describe('signing', () => {
  it('sorts parameters and concatenates key with value', () => {
    expect(buildSignatureBase({ b: '2', a: '1', c: '3' })).toBe('a1b2c3');
  });

  it('excludes the signature itself and empty values', () => {
    expect(buildSignatureBase({ a: '1', sign: 'XYZ', empty: '' })).toBe('a1');
  });

  it('is deterministic and uppercase hex', () => {
    const first = signRequest({ a: '1' }, 'secret');
    expect(first).toBe(signRequest({ a: '1' }, 'secret'));
    expect(first).toMatch(/^[0-9A-F]+$/);
  });

  it('produces different signatures for the two accepted schemes', () => {
    // An app provisioned for one scheme fails closed against the other, so
    // being able to switch is how a rejected signature gets diagnosed.
    expect(signRequest({ a: '1' }, 'secret', 'md5')).not.toBe(
      signRequest({ a: '1' }, 'secret', 'sha256'),
    );
    expect(signRequest({ a: '1' }, 'secret', 'md5')).toHaveLength(32);
    expect(signRequest({ a: '1' }, 'secret', 'sha256')).toHaveLength(64);
  });

  it('rejects a non-finite timestamp', () => {
    expect(() => formatTimestamp(Number.NaN)).toThrow(/finite epoch/);
  });
});

describe('buildParams', () => {
  it('includes the protocol envelope and a signature', () => {
    const params = makeClient(createMockTransport()).buildParams('some.method', { foo: 'bar' });
    expect(params.app_key).toBe('test-key');
    expect(params.method).toBe('some.method');
    expect(params.v).toBe('2.0');
    expect(params.format).toBe('json');
    expect(params.timestamp).toBe('1785000000000');
    expect(params.sign).toMatch(/^[0-9A-F]{64}$/);
  });

  it('drops undefined and empty values rather than sending blanks', () => {
    const params = makeClient(createMockTransport()).buildParams('m', {
      present: 'yes',
      absent: undefined,
      blank: '',
    });
    expect(params.present).toBe('yes');
    expect('absent' in params).toBe(false);
    expect('blank' in params).toBe(false);
  });

  it('signs exactly what is sent', () => {
    const client = makeClient(createMockTransport());
    const params = client.buildParams('m', { foo: 'bar' });
    const { sign, ...signed } = params;
    expect(signRequest(signed, 'test-secret')).toBe(sign);
  });
});

describe('queryProducts', () => {
  it('returns normalised paging alongside the raw products', async () => {
    const result = await makeClient(createMockTransport()).queryProducts({
      keywords: 'iPhone 16 case',
      page: 1,
      pageSize: 20,
    });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.currentPage).toBe(1);
    expect(result.totalRecords).toBeGreaterThan(0);
  });

  it('sends the tracking id, without which nothing is attributed', async () => {
    let sentBody = '';
    const spy: Transport = async (_url, body) => {
      sentBody = body;
      return createMockTransport()(_url, body);
    };
    await makeClient(spy).queryProducts({ keywords: 'charger' });
    expect(new URLSearchParams(sentBody).get('tracking_id')).toBe('ostech');
  });

  it('applies the configured defaults for locale and shipping', async () => {
    let sentBody = '';
    const spy: Transport = async (_url, body) => {
      sentBody = body;
      return createMockTransport()(_url, body);
    };
    await makeClient(spy).queryProducts({ keywords: 'charger' });
    const params = new URLSearchParams(sentBody);
    expect(params.get('ship_to_country')).toBe('IL');
    expect(params.get('target_currency')).toBe('USD');
  });

  it('unwraps a single result that arrives as an object rather than a list', async () => {
    const result = await makeClient(createMockTransport()).queryProducts({ page: 1, pageSize: 1 });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.product_id).toBeDefined();
  });
});

describe('generateLinks', () => {
  it('carries the SubID into the generated link', async () => {
    const result = await makeClient(createMockTransport()).generateLinks(
      ['https://www.aliexpress.com/item/1005006123456789.html'],
      'cases-iphone-16-pro_table-row-1',
    );
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.promotionLink).toContain(
      encodeURIComponent('cases-iphone-16-pro_table-row-1'),
    );
  });

  it('skips the round trip for an empty list', async () => {
    let called = false;
    const spy: Transport = async (url, body) => {
      called = true;
      return createMockTransport()(url, body);
    };
    expect(await makeClient(spy).generateLinks([], 'sub')).toEqual({ links: [] });
    expect(called).toBe(false);
  });
});

describe('listOrders', () => {
  it('returns orders with the SubID echoed back', async () => {
    const result = await makeClient(createMockTransport()).listOrders({
      startTime: '2026-07-01 00:00:00',
      endTime: '2026-07-31 23:59:59',
    });
    expect(result.orders[0]!.sub_id).toBe('mtn-iphone-16-pro_table-row-1');
  });
});

describe('error handling', () => {
  it('raises the gateway error that arrives inside an HTTP 200', async () => {
    const failing: Transport = async () => ({
      error_response: {
        code: '15',
        msg: 'Remote service error',
        sub_code: 'isp.flow-control',
        sub_msg: 'request rate limited',
        request_id: 'req-1',
      },
    });

    await expect(makeClient(failing).queryProducts({ keywords: 'x' })).rejects.toThrow(
      AliExpressApiError,
    );

    let caught: AliExpressApiError | undefined;
    try {
      await makeClient(failing).queryProducts({ keywords: 'x' });
    } catch (err) {
      caught = err as AliExpressApiError;
    }
    expect(caught?.code).toBe('15');
    expect(caught?.subCode).toBe('isp.flow-control');
    expect(caught?.requestId).toBe('req-1');
  });

  it('raises a rejection reported through the second failure channel', async () => {
    const failing: Transport = async () => ({
      aliexpress_affiliate_product_query_response: {
        resp_result: { resp_code: 4001, resp_msg: 'invalid tracking id' },
      },
    });
    await expect(makeClient(failing).queryProducts({})).rejects.toThrow(/invalid tracking id/);
  });

  it('treats rate limits as retryable and bad credentials as not', () => {
    expect(
      isRetryable(new AliExpressApiError({ message: 'rate limited', code: '15' })),
    ).toBe(true);
    expect(
      isRetryable(
        new AliExpressApiError({ message: 'Invalid app key', code: '25', subCode: 'isv.invalid-app-key' }),
      ),
    ).toBe(false);
    expect(isRetryable(new Error('network down'))).toBe(false);
  });
});
