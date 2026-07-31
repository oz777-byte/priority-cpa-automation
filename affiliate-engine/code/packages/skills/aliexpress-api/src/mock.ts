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

    // Keyword matching is crude on purpose — enough that different category
    // queries return different products, so a build over the whole taxonomy
    // exercises the same paths a live sync will.
    const keywords = (params.get('keywords') ?? '').toLowerCase();
    const terms = keywords.split(/\s+/).filter((term) => term.length > 2);
    const matched = terms.length
      ? products.filter((product) => {
          const title = (product.product_title ?? '').toLowerCase();
          return terms.every((term) => title.includes(term));
        })
      : products;

    const pageSize = Number(params.get('page_size') ?? 20);
    const page = Number(params.get('page_no') ?? 1);
    const start = (page - 1) * pageSize;
    const slice = matched.slice(start, start + pageSize);

    return {
      aliexpress_affiliate_product_query_response: {
        resp_result: {
          resp_code: 200,
          result: {
            current_page_no: page,
            page_size: pageSize,
            total_record_count: matched.length,
            // A single result really does arrive unwrapped; the client handles both.
            products: { product: slice.length === 1 ? slice[0] : slice },
          },
        },
      },
    };
  };
}

export const MOCK_PRODUCTS: RawProduct[] = [
  // --- chargers -----------------------------------------------------
  p('1005006123456789', 'Magnetic Wireless Charger 15W for iPhone 15 16 17 Pro Max MagSafe', 'TechGear Official Store', '9001', 97.4, 4820, '11.49', '24.99', '9.0%'),
  p('1005007777888999', '65W GaN Fast Charger USB C PD Adapter for iPhone Samsung Galaxy Laptop', 'PowerMax Official Store', '9005', 96.9, 7630, '18.76', '39.90', '10.0%'),
  p('1005007777111222', 'Magnetic Wireless Charger Stand for Samsung Galaxy S24 S25 Ultra 15W', 'PowerMax Official Store', '9005', 96.9, 3140, '14.20', '29.99', '9.5%'),
  p('1005007777333444', '33W Fast Charger Adapter for iPhone 16 Pro Max PD Wall Plug', 'TechGear Official Store', '9001', 97.4, 2890, '7.85', '16.90', '8.5%'),
  p('1005007777555666', '45W GaN Fast Charger USB C Dual Port for Samsung Galaxy S25 Ultra', 'PowerMax Official Store', '9005', 96.9, 1980, '15.40', '32.00', '9.0%'),

  // --- screen protectors --------------------------------------------
  p('1005006987654321', 'Tempered Glass Screen Protector for Samsung Galaxy S24 S25 Ultra 3 Pack', 'ProtectPro Store', '9002', 98.1, 12400, '4.32', '12.00', '12.5%'),
  p('1005006987111222', 'Tempered Glass Screen Protector for iPhone 16 17 Pro Max 3 Pack HD', 'ProtectPro Store', '9002', 98.1, 9870, '3.98', '11.50', '12.5%'),
  p('1005006987333444', 'Privacy Screen Protector Anti Spy for iPhone 16 Pro Max Tempered Glass', 'ProtectPro Store', '9002', 98.1, 3420, '6.74', '15.90', '11.0%'),
  p('1005006987555666', 'Privacy Screen Protector for Samsung Galaxy S25 Ultra Anti Spy Glass', 'ShieldWorks Store', '9006', 96.2, 1760, '7.10', '17.40', '10.5%'),

  // --- cases --------------------------------------------------------
  // Commission arrives here without a percent sign — the gateway sends both forms.
  p('1005007111222333', 'Shockproof Clear Case for iPhone 16 17 Pro Max Camera Lens Protection', 'CaseHouse Store', '9003', 95.8, 2210, '3.15', '9.90', '8.0'),
  p('1005007111444555', 'Magnetic Clear Case for iPhone 16 Pro MagSafe Shockproof Slim Cover', 'CaseHouse Store', '9003', 95.8, 5640, '5.44', '14.20', '9.0%'),
  p('1005007111666777', 'Shockproof Clear Case for Samsung Galaxy S24 S25 Ultra Armor Cover', 'CaseHouse Store', '9003', 95.8, 4180, '4.60', '12.80', '8.5%'),
  p('1005007111888999', 'Magnetic Case for Samsung Galaxy S25 Ultra Clear Shockproof Ring Holder', 'ArmorLine Store', '9007', 97.1, 2960, '6.90', '18.00', '9.5%'),
  p('1005007112000111', 'Clear Case for iPhone 15 Shockproof Transparent Slim Cover', 'ArmorLine Store', '9007', 97.1, 3310, '2.99', '8.50', '7.5%'),

  // --- cables -------------------------------------------------------
  p('1005007222111333', 'USB C Cable Fast Charging 100W Braided for Samsung Galaxy iPhone 2m', 'CableCraft Store', '9008', 96.5, 8940, '3.72', '9.99', '11.0%'),
  p('1005007222444555', 'Lightning Cable Braided Fast Charging for iPhone 14 MFi 1.8m', 'CableCraft Store', '9008', 96.5, 5210, '4.15', '11.20', '10.0%'),
  p('1005007222666777', 'USB C Cable Fast Charging 240W for iPhone 16 Pro Max Nylon Braided', 'CableCraft Store', '9008', 96.5, 3480, '5.30', '13.90', '10.5%'),

  // --- power banks --------------------------------------------------
  p('1005007333111444', 'Magnetic Power Bank 10000mAh Wireless for iPhone 16 Pro Max MagSafe', 'VoltHub Store', '9009', 97.8, 6120, '21.40', '48.00', '9.0%'),
  p('1005007333555666', 'Power Bank 20000mAh Slim Fast Charging for Samsung Galaxy iPhone PD', 'VoltHub Store', '9009', 97.8, 4470, '17.90', '39.00', '8.5%'),

  // --- mounts -------------------------------------------------------
  p('1005007444111555', 'Magnetic Car Mount Phone Holder for iPhone 16 Pro Max Dashboard', 'DriveFit Store', '9010', 96.0, 7250, '6.20', '15.00', '10.0%'),
  p('1005007444666777', 'Magnetic Car Mount Phone Holder for Samsung Galaxy S25 Ultra Vent Clip', 'DriveFit Store', '9010', 96.0, 3890, '5.80', '14.00', '9.5%'),
  p('1005007444888999', 'Phone Stand Desk Aluminium Foldable for iPhone Samsung Galaxy Tablet', 'DriveFit Store', '9010', 96.0, 5030, '4.90', '12.50', '9.0%'),

  // --- camera -------------------------------------------------------
  p('1005007555111666', 'Camera Lens Protector Tempered Glass for iPhone 16 17 Pro Max 2 Pack', 'ProtectPro Store', '9002', 98.1, 4310, '3.40', '9.20', '11.5%'),
  p('1005007555777888', 'Camera Lens Protector Metal Ring for Samsung Galaxy S25 Ultra', 'ShieldWorks Store', '9006', 96.2, 2140, '4.80', '11.90', '10.0%'),

  // --- audio --------------------------------------------------------
  p('1005007666111777', 'TWS Earbuds Bluetooth 5.4 for iPhone Samsung Galaxy Wireless ANC', 'SoundNest Store', '9011', 95.4, 9680, '16.30', '42.00', '11.0%'),
  p('1005007666888999', 'Bluetooth Earphones ANC Noise Cancelling for Samsung Galaxy iPhone', 'SoundNest Store', '9011', 95.4, 3720, '22.50', '55.00', '10.0%'),

  // --- deliberately rejectable ---------------------------------------
  {
    // Not a Choice listing, and the store sits below the quality bar — kept so
    // the curation filters have something real to reject.
    product_id: '1005007444555666',
    product_title: 'Universal Phone Holder Car Mount Cheap Plastic',
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
    // Choice, well rated, but barely sold — the volume floor exists for this.
    product_id: '1005007444777888',
    product_title: 'Magnetic Case for iPhone 17 Pro Max Clear Shockproof New Release',
    product_main_image_url: 'https://example-cdn.invalid/img/new-case.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005007444777888.html',
    sale_price: '8.40',
    sale_price_currency: 'USD',
    commission_rate: '9.0%',
    shop_id: '9003',
    shop_name: 'CaseHouse Store',
    evaluate_rate: '95.8',
    lastest_volume: 24,
    product_tags: ['Choice'],
  },
];

/** Builds a Choice listing from a store that clears the quality bar. */
function p(
  id: string,
  title: string,
  shopName: string,
  shopId: string,
  rating: number,
  volume: number,
  salePrice: string,
  originalPrice: string,
  commission: string,
): RawProduct {
  return {
    product_id: id,
    product_title: title,
    product_main_image_url: `https://example-cdn.invalid/img/${id}.jpg`,
    product_detail_url: `https://www.aliexpress.com/item/${id}.html`,
    original_price: originalPrice,
    sale_price: salePrice,
    target_sale_price: salePrice,
    sale_price_currency: 'USD',
    commission_rate: commission,
    first_level_category_id: '509',
    first_level_category_name: 'Phone Accessories',
    shop_id: shopId,
    shop_name: shopName,
    shop_url: `https://www.aliexpress.com/store/${shopId}`,
    evaluate_rate: String(rating),
    lastest_volume: volume,
    product_tags: ['Choice', 'FreeShipping'],
  };
}

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
