import { describe, it, expect } from 'vitest';
import { MOCK_PRODUCTS } from '@affiliate/aliexpress-api';
import {
  BRANDS,
  CATEGORIES,
  DEFAULT_CURATION_RULES,
  NormalizeError,
  breadcrumbJsonLd,
  buildCategoryMeta,
  buildSitemap,
  curateCatalog,
  curateProduct,
  dedupeProducts,
  enumeratePages,
  itemListJsonLd,
  listingValue,
  normalizeProduct,
  normalizeProducts,
  productJsonLd,
  rankProducts,
  shouldIndex,
  titleFingerprint,
  toLatinSlug,
} from '../src/index';
import type { CatalogProduct } from '../src/index';

const SITE = {
  baseUrl: 'https://example.co.il',
  siteName: 'OS Tech',
  disclosureHe: 'גילוי נאות: העמוד מכיל קישורי שותפים.',
};

describe('normalizeProduct', () => {
  it('normalises prices, commission and volume off the wire shapes', () => {
    const product = normalizeProduct(MOCK_PRODUCTS[0]!);
    expect(product.productId).toBe('1005006123456789');
    expect(product.salePriceMinor).toBe(1149);
    expect(product.originalPriceMinor).toBe(2499);
    expect(product.currency).toBe('USD');
    expect(product.commissionRate).toBeCloseTo(0.09);
    expect(product.estimatedCommissionMinor).toBe(103);
    expect(product.recentOrders).toBe(4820);
    expect(product.isChoice).toBe(true);
  });

  it('reads a commission with or without a percent sign', () => {
    expect(normalizeProduct(MOCK_PRODUCTS[2]!).commissionRate).toBeCloseTo(0.08);
    expect(normalizeProduct(MOCK_PRODUCTS[1]!).commissionRate).toBeCloseTo(0.125);
  });

  it('recomputes the discount from the prices rather than trusting the field', () => {
    // The reported discount goes stale against the price printed beside it.
    const product = normalizeProduct({ ...MOCK_PRODUCTS[0]!, discount: '10%' });
    expect(product.discountPercent).toBe(54);
  });

  it('falls back to the reported discount when a price is missing', () => {
    const product = normalizeProduct({
      ...MOCK_PRODUCTS[0]!,
      original_price: undefined,
      target_original_price: undefined,
      discount: '31%',
    });
    expect(product.discountPercent).toBe(31);
  });

  it('refuses a product with no id, since it could never be deduplicated', () => {
    expect(() => normalizeProduct({ ...MOCK_PRODUCTS[0]!, product_id: undefined })).toThrow(
      NormalizeError,
    );
  });

  it('refuses a product with no detail url, since no link could be built', () => {
    expect(() =>
      normalizeProduct({ ...MOCK_PRODUCTS[0]!, product_detail_url: undefined }),
    ).toThrow(/no detail url/);
  });

  it('detects the Choice marker case-insensitively', () => {
    expect(normalizeProduct({ ...MOCK_PRODUCTS[0]!, product_tags: ['CHOICE'] }).isChoice).toBe(true);
    expect(normalizeProduct({ ...MOCK_PRODUCTS[0]!, product_tags: 'Choice,FreeShipping' }).isChoice).toBe(true);
    expect(normalizeProduct({ ...MOCK_PRODUCTS[0]!, product_tags: [] }).isChoice).toBe(false);
  });

  it('accepts a configured marker when the default one moves', () => {
    const product = normalizeProduct(
      { ...MOCK_PRODUCTS[0]!, product_tags: ['AE_Choice_2026'] },
      { choiceTags: ['ae_choice_2026'] },
    );
    expect(product.isChoice).toBe(true);
  });

  it('collects failures instead of losing a whole page to one bad row', () => {
    const result = normalizeProducts([
      MOCK_PRODUCTS[0]!,
      { product_title: 'no id' },
      MOCK_PRODUCTS[1]!,
    ]);
    expect(result.products).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.index).toBe(1);
  });
});

describe('curation', () => {
  const products = normalizeProducts(MOCK_PRODUCTS).products;

  it('admits Choice listings from stores with a track record', () => {
    const result = curateCatalog(products);
    expect(result.admitted.map((p) => p.productId)).toEqual([
      '1005006123456789',
      '1005006987654321',
      '1005007111222333',
      '1005007777888999',
    ]);
  });

  it('rejects a non-Choice listing and says exactly why', () => {
    const junk = products.find((p) => p.productId === '1005007444555666')!;
    const verdict = curateProduct(junk);
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons).toContain('not_choice');
    expect(verdict.reasons).toContain('shop_rating_too_low');
    expect(verdict.reasons).toContain('too_few_orders');
    expect(verdict.reasons).toContain('commission_too_low');
    expect(verdict.reasons).toContain('price_out_of_range');
  });

  it('counts rejections by reason, so a filter eating the catalog is visible', () => {
    const result = curateCatalog(products);
    expect(result.rejectionCounts.not_choice).toBe(1);
    expect(result.rejectionCounts.shop_rating_too_low).toBe(1);
  });

  it('drops a Choice listing from a store that has barely sold anything', () => {
    const unproven: CatalogProduct = {
      ...products[0]!,
      productId: 'unproven',
      recentOrders: 12,
    };
    expect(curateProduct(unproven).reasons).toEqual(['too_few_orders']);
  });

  it('honours relaxed rules', () => {
    const junk = products.find((p) => p.productId === '1005007444555666')!;
    const verdict = curateProduct(junk, {
      ...DEFAULT_CURATION_RULES,
      requireChoice: false,
      minShopRating: 80,
      minRecentOrders: 10,
      minCommissionRate: 0.01,
      minSalePriceMinor: 100,
    });
    expect(verdict.admitted).toBe(true);
  });
});

describe('ranking', () => {
  const products = normalizeProducts(MOCK_PRODUCTS).products;

  it('values a listing on commission and demand together', () => {
    // Ranking on commission alone promotes expensive items nobody buys;
    // ranking on volume alone promotes items that earn nothing.
    const charger = products.find((p) => p.productId === '1005007777888999')!;
    const glass = products.find((p) => p.productId === '1005006987654321')!;
    expect(listingValue(charger)).toBeGreaterThan(listingValue(glass));
  });

  it('is stable for listings of equal value', () => {
    const a: CatalogProduct = { ...products[0]!, productId: 'aaa' };
    const b: CatalogProduct = { ...products[0]!, productId: 'bbb' };
    expect(rankProducts([b, a]).map((p) => p.productId)).toEqual(['aaa', 'bbb']);
  });

  it('scores a listing with no commission at zero rather than crashing', () => {
    expect(listingValue({ ...products[0]!, estimatedCommissionMinor: null })).toBe(0);
  });
});

describe('deduplication', () => {
  it('collapses the same accessory relisted by several resellers', () => {
    const base = normalizeProduct(MOCK_PRODUCTS[1]!);
    const reseller: CatalogProduct = {
      ...base,
      productId: 'copy-1',
      title: 'Tempered Glass Screen Protector For Samsung Galaxy S24 S25 Ultra - 3 Pack HIGH QUALITY',
      recentOrders: 10,
    };
    const deduped = dedupeProducts([base, reseller]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.productId).toBe(base.productId);
  });

  it('keeps genuinely different products apart', () => {
    const products = normalizeProducts(MOCK_PRODUCTS).products;
    expect(dedupeProducts(products)).toHaveLength(products.length);
  });

  it('ignores filler words when fingerprinting a title', () => {
    expect(titleFingerprint('Clear Case For iPhone 16 Pro')).toBe(
      titleFingerprint('iPhone 16 Pro Clear Case - High Quality Free Shipping'),
    );
  });
});

describe('taxonomy', () => {
  it('enumerates a page for every category and brand', () => {
    const pages = enumeratePages({ includeModels: false });
    const expected = CATEGORIES.reduce(
      (sum, category) =>
        sum + (category.brands.length > 0 ? category.brands.length : BRANDS.length),
      0,
    );
    expect(pages).toHaveLength(expected);
  });

  it('generates long-tail model pages, which is where the volume comes from', () => {
    const pages = enumeratePages();
    expect(pages.length).toBeGreaterThan(80);
    expect(pages.some((page) => page.slug === 'cases-iphone-17-pro-max')).toBe(true);
  });

  it('builds search terms that name the device', () => {
    const page = enumeratePages().find((p) => p.slug === 'chargers-galaxy-s25-ultra')!;
    expect(page.queryTerms[0]).toContain('Samsung Galaxy S25 Ultra');
    expect(page.titleHe).toBe('מטענים לגלקסי S25 Ultra');
  });

  it('keeps every slug unique and URL-safe', () => {
    const slugs = enumeratePages().map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
  });
});

describe('seo', () => {
  const products = curateCatalog(normalizeProducts(MOCK_PRODUCTS).products).admitted;
  const page = enumeratePages().find((p) => p.slug === 'cases-iphone')!;

  it('transliterates Hebrew into a Latin slug', () => {
    // The slug becomes the first SubID segment, which must be [a-z0-9-].
    expect(toLatinSlug('כיסויים לאייפון')).toBe('kysvyym-layypvn');
    expect(toLatinSlug('מטענים 65W')).toMatch(/^[a-z0-9-]+$/);
    expect(toLatinSlug('  Mixed עברית 123  ')).toMatch(/^[a-z0-9-]+$/);
  });

  it('produces a stable slug for the same input', () => {
    expect(toLatinSlug('מגני מסך')).toBe(toLatinSlug('מגני מסך'));
  });

  it('keeps the title within the length search results will show', () => {
    const meta = buildCategoryMeta(page, products, SITE);
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeLessThanOrEqual(155);
    expect(meta.direction).toBe('rtl');
    expect(meta.locale).toBe('he_IL');
  });

  it('marks an empty page noindex rather than publishing a thin one', () => {
    const meta = buildCategoryMeta(page, [], SITE);
    expect(meta.robots).toBe('noindex,follow');
    expect(shouldIndex([])).toBe(false);
    expect(shouldIndex(products, 2)).toBe(true);
  });

  it('emits product structured data without inventing a rating', () => {
    // The marketplace gives a seller rating; passing it off as a product
    // rating would be both a schema violation and a false claim.
    const jsonLd = productJsonLd(products[0]!, SITE, 'https://example.co.il/cases/iphone');
    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.aggregateRating).toBeUndefined();
    expect(jsonLd.review).toBeUndefined();
    const offer = jsonLd.offers as Record<string, unknown>;
    expect(offer.price).toBe('11.49');
    expect(offer.priceCurrency).toBe('USD');
  });

  it('omits the price when the listing has none', () => {
    const offer = productJsonLd(
      { ...products[0]!, salePriceMinor: null },
      SITE,
      'https://example.co.il/x',
    ).offers as Record<string, unknown>;
    expect(offer.price).toBeUndefined();
  });

  it('numbers list items from one', () => {
    const jsonLd = itemListJsonLd(products, SITE, 'https://example.co.il/cases/iphone');
    const items = jsonLd.itemListElement as Array<Record<string, unknown>>;
    expect(items[0]!.position).toBe(1);
    expect(jsonLd.numberOfItems).toBe(products.length);
  });

  it('builds a breadcrumb trail in order', () => {
    const jsonLd = breadcrumbJsonLd([
      { name: 'ראשי', url: 'https://example.co.il/' },
      { name: 'כיסויים', url: 'https://example.co.il/cases' },
    ]);
    const items = jsonLd.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((item) => item.position)).toEqual([1, 2]);
  });

  it('escapes urls in the sitemap', () => {
    const xml = buildSitemap([
      { loc: 'https://example.co.il/cases?a=1&b=2', lastmod: '2026-07-31', priority: 0.8 },
    ]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/loc>[^<]*&(?!amp;)/);
    expect(xml).toContain('<priority>0.8</priority>');
  });
});
