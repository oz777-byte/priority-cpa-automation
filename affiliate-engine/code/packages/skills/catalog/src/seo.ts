import type { CatalogProduct } from './normalize.ts';
import type { CategoryBrandPage } from './taxonomy.ts';

/**
 * SEO output for the storefront: page metadata, structured data, and sitemaps.
 *
 * Hebrew is what the visitor reads; the URL stays Latin. That is not a style
 * preference — the page slug becomes the first segment of the SubID, which
 * must match `[a-z0-9-]`, so a Hebrew URL would make every click on the page
 * impossible to attribute.
 */

/**
 * Hebrew letters to Latin, for slugs derived from Hebrew titles. Deliberately
 * plain: reversibility does not matter, stability does. The same input must
 * always produce the same slug, or a URL changes under a page that already ranks.
 */
const HEBREW_TRANSLITERATION: Readonly<Record<string, string>> = {
  א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't',
  י: 'y', כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's',
  ע: 'a', פ: 'p', ף: 'f', צ: 'ts', ץ: 'ts', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
};

export function toLatinSlug(input: string): string {
  const transliterated = [...input]
    .map((char) => HEBREW_TRANSLITERATION[char] ?? char)
    .join('');

  return transliterated
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** Hebrew content for an Israeli audience. */
  locale: string;
  direction: 'rtl';
  robots: string;
}

export interface SiteConfig {
  baseUrl: string;
  siteName: string;
  /** Shown on every page. Required, not optional — see compliance_israel.md. */
  disclosureHe: string;
}

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;

export function buildCategoryMeta(
  page: CategoryBrandPage,
  products: CatalogProduct[],
  site: SiteConfig,
): PageMeta {
  const count = products.length;
  const cheapest = products
    .map((product) => product.salePriceMinor)
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b)[0];

  const priceHint = cheapest !== undefined ? ` החל מ-$${(cheapest / 100).toFixed(2)}` : '';

  return {
    title: truncate(`${page.titleHe} — ${count} מוצרים נבחרים | ${site.siteName}`, MAX_TITLE),
    description: truncate(
      `${page.category.blurbHe} ${count} מוצרי Choice מחנויות מדורגות${priceHint}.`,
      MAX_DESCRIPTION,
    ),
    canonical: `${site.baseUrl}/${page.category.slug}/${page.model?.slug ?? page.brand.slug}`,
    locale: 'he_IL',
    direction: 'rtl',
    robots: count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

/**
 * A category page with nothing on it is worse than no page: thin pages drag
 * down how the whole domain is assessed. So an empty page is emitted as
 * `noindex` rather than quietly published.
 */
export function shouldIndex(products: CatalogProduct[], minProducts = 6): boolean {
  return products.length >= minProducts;
}

export interface JsonLd {
  '@context': string;
  '@type': string;
  [key: string]: unknown;
}

/**
 * Product structured data.
 *
 * Only fields we actually hold are emitted. In particular there is no
 * `aggregateRating`: the marketplace gives a *seller* rating, and passing that
 * off as a product rating is both a structured-data violation and a false
 * claim to a shopper.
 */
export function productJsonLd(product: CatalogProduct, site: SiteConfig, url: string): JsonLd {
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    url,
    availability: 'https://schema.org/InStock',
  };

  if (product.salePriceMinor !== null) {
    offer.price = (product.salePriceMinor / 100).toFixed(2);
    offer.priceCurrency = product.currency;
  }
  if (product.shopName) {
    offer.seller = { '@type': 'Organization', name: product.shopName };
  }

  const jsonLd: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    offers: offer,
  };

  if (product.imageUrl) jsonLd.image = product.imageUrl;
  if (product.categoryName) jsonLd.category = product.categoryName;
  if (product.shopName) jsonLd.brand = { '@type': 'Brand', name: product.shopName };

  return jsonLd;
}

export function itemListJsonLd(
  products: CatalogProduct[],
  site: SiteConfig,
  pageUrl: string,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: pageUrl,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: productJsonLd(product, site, `${pageUrl}#${product.productId}`),
    })),
  };
}

export function breadcrumbJsonLd(
  trail: Array<{ name: string; url: string }>,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export interface SitemapEntry {
  loc: string;
  /** ISO date. Injected, never read from the clock. */
  lastmod: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
}

export function buildSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${entry.lastmod}</lastmod>`,
      ];
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Trims to a length without cutting a word in half. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
