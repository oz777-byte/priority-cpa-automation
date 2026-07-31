export type { CatalogProduct, NormalizeOptions } from './normalize';
export {
  DEFAULT_CHOICE_TAGS,
  NormalizeError,
  normalizeProduct,
  normalizeProducts,
} from './normalize';

export type { CurationResult, CurationRules, CurationVerdict, RejectReason } from './curate';
export {
  DEFAULT_CURATION_RULES,
  curateCatalog,
  curateProduct,
  dedupeProducts,
  listingValue,
  rankProducts,
  titleFingerprint,
} from './curate';

export type { HebrewTitleOptions } from './title';
export { composeHebrewTitle, hebrewTitleForPage } from './title';

export type { Brand, Category, CategoryBrandPage } from './taxonomy';
export { BRANDS, CATEGORIES, enumeratePages, findBrand, findCategory } from './taxonomy';

export type { JsonLd, PageMeta, SiteConfig, SitemapEntry } from './seo';
export {
  breadcrumbJsonLd,
  buildCategoryMeta,
  buildSitemap,
  itemListJsonLd,
  productJsonLd,
  shouldIndex,
  toLatinSlug,
} from './seo';
