import type { Transport } from './client';
import type { RawProduct } from './types';

/**
 * Fixture transport, so the storefront and the catalog pipeline can be built
 * and demonstrated before affiliate API credentials are approved — which takes
 * days and is entirely outside our control.
 *
 * The fixtures deliberately include the awkward cases the real gateway returns:
 * a single result arriving as an object rather than a list, prices as strings,
 * commission as a percentage string, and a store below the quality bar.
 */
export function createMockTransport(products: RawProduct[] = MOCK_PRODUCTS): Transport {
  return async (_url: string, body: string) => {
    const params = new URLSearchParams(body);
    const method = params.get('method') ?? '';

    if (method.endsWith('link.generate')) {
      const sources = (params.get('source_values') ?? '').split(',').filter(Boolean);
      const subId = params.get('sub_id') ?? '';
      return {
        aliexpress_affiliate_link_generate_response: {
          resp_result: {
            resp_code: 200,
            result: {
              promotion_links: {
                promotion_link: sources.map((source) => ({
                  source_value: source,
                  promotion_link: `${source}${source.includes('?') ? '&' : '?'}aff_sub1=${encodeURIComponent(subId)}`,
                })),
              },
            },
          },
        },
      };
    }

    if (method.endsWith('order.list')) {
      return {
        aliexpress_affiliate_order_list_response: {
          resp_result: {
            resp_code: 200,
            result: {
              current_page_no: 1,
              total_record_count: MOCK_ORDERS.length,
              orders: { order: MOCK_ORDERS },
            },
          },
        },
      };
    }

    const pageSize = Number(params.get('page_size') ?? 20);
    const page = Number(params.get('page_no') ?? 1);
    const start = (page - 1) * pageSize;
    const slice = products.slice(start, start + pageSize);

    return {
      aliexpress_affiliate_product_query_response: {
        resp_result: {
          resp_code: 200,
          result: {
            current_page_no: page,
            page_size: pageSize,
            total_record_count: products.length,
            // A single result really does arrive unwrapped; the client handles both.
            products: { product: slice.length === 1 ? slice[0] : slice },
          },
        },
      },
    };
  };
}

export const MOCK_PRODUCTS: RawProduct[] = [
  {
    product_id: '1005006123456789',
    product_title: 'Magnetic Wireless Charger 15W for iPhone 15 16 Pro Max MagSafe Compatible',
    product_main_image_url: 'https://example-cdn.invalid/img/magsafe-charger.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005006123456789.html',
    original_price: '24.99',
    sale_price: '11.49',
    target_sale_price: '11.49',
    sale_price_currency: 'USD',
    discount: '54%',
    commission_rate: '9.0%',
    first_level_category_id: '509',
    first_level_category_name: 'Phone Accessories',
    shop_id: '9001',
    shop_name: 'TechGear Official Store',
    shop_url: 'https://www.aliexpress.com/store/9001',
    evaluate_rate: '97.4',
    lastest_volume: 4820,
    product_tags: ['Choice', 'FreeShipping'],
  },
  {
    product_id: '1005006987654321',
    product_title: 'Tempered Glass Screen Protector for Samsung Galaxy S24 S25 Ultra 3 Pack',
    product_main_image_url: 'https://example-cdn.invalid/img/s24-glass.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005006987654321.html',
    original_price: '12.00',
    sale_price: '4.32',
    sale_price_currency: 'USD',
    discount: '64%',
    commission_rate: '12.5%',
    first_level_category_id: '509',
    first_level_category_name: 'Phone Accessories',
    shop_id: '9002',
    shop_name: 'ProtectPro Store',
    evaluate_rate: '98.1',
    lastest_volume: 12400,
    product_tags: ['Choice'],
  },
  {
    product_id: '1005007111222333',
    product_title: 'Shockproof Clear Case for iPhone 16 Pro Camera Lens Protection',
    product_main_image_url: 'https://example-cdn.invalid/img/iphone16-case.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005007111222333.html',
    original_price: '9.90',
    sale_price: '3.15',
    sale_price_currency: 'USD',
    commission_rate: '8.0',
    first_level_category_id: '509',
    shop_id: '9003',
    shop_name: 'CaseHouse Store',
    evaluate_rate: '95.8',
    lastest_volume: 2210,
    product_tags: ['Choice'],
  },
  {
    // Not a Choice listing, and the store sits below the quality bar — kept so
    // the catalog filters have something real to reject.
    product_id: '1005007444555666',
    product_title: 'Universal Phone Holder Car Mount Cheap',
    product_main_image_url: 'https://example-cdn.invalid/img/car-mount.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005007444555666.html',
    sale_price: '1.99',
    sale_price_currency: 'USD',
    commission_rate: '3.0%',
    shop_id: '9004',
    shop_name: 'Random Trading Co',
    evaluate_rate: '88.2',
    lastest_volume: 47,
    product_tags: [],
  },
  {
    product_id: '1005007777888999',
    product_title: '65W GaN Fast Charger USB C PD Adapter for iPhone Samsung Laptop',
    product_main_image_url: 'https://example-cdn.invalid/img/gan-charger.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005007777888999.html',
    original_price: '39.90',
    sale_price: '18.76',
    sale_price_currency: 'USD',
    discount: '53%',
    commission_rate: '10.0%',
    first_level_category_id: '509',
    shop_id: '9005',
    shop_name: 'PowerMax Official Store',
    evaluate_rate: '96.9',
    lastest_volume: 7630,
    product_tags: ['Choice', 'FreeShipping'],
  },
];

export const MOCK_ORDERS = [
  {
    order_id: '3011234567890',
    sub_id: 'mtn-iphone-16-pro_table-row-1',
    order_status: 'Payment Completed',
    paid_amount: '11.49',
    estimated_paid_commission: '1.03',
    commission_rate: '9.0%',
    currency: 'USD',
    paid_time: '2026-07-28 14:02:11',
    product_id: '1005006123456789',
    product_title: 'Magnetic Wireless Charger 15W',
  },
];
