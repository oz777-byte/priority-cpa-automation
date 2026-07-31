export type { CatalogProduct, NormalizeOptions } from './normalize.ts';
export {
  DEFAULT_CHOICE_TAGS,
  NormalizeError,
  normalizeProduct,
  normalizeProducts,
} from './normalize.ts';

export type { CurationResult, CurationRules, CurationVerdict, RejectReason } from './curate.ts';
export {
  DEFAULT_CURATION_RULES,
  curateCatalog,
  curateProduct,
  dedupeProducts,
  listingValue,
  rankProducts,
  titleFingerprint,
} from './curate.ts';

export type { HebrewTitleOptions } from './title.ts';
export { composeHebrewTitle, hebrewTitleForPage } from './title.ts';

export type { Brand, Category, CategoryBrandPage } from './taxonomy.ts';
export { BRANDS, CATEGORIES, enumeratePages, findBrand, findCategory } from './taxonomy.ts';

export type { JsonLd, PageMeta, SiteConfig, SitemapEntry } from './seo.ts';
export {
  breadcrumbJsonLd,
  buildCategoryMeta,
  buildSitemap,
  itemListJsonLd,
  productJsonLd,
  shouldIndex,
  toLatinSlug,
} from './seo.ts';
