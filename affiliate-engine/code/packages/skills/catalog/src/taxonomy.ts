/**
 * Storefront taxonomy: iPhone and Samsung accessories.
 *
 * Hebrew names are what a visitor reads; Latin slugs are what the URL and the
 * SubID carry. The two are kept separate on purpose — a SubID segment must
 * match `[a-z0-9-]`, so a Hebrew slug would make every click on the page
 * unattributable.
 *
 * `queryTerms` are the marketplace search keywords that populate the category.
 * They are English because the marketplace catalog is English, regardless of
 * what the storefront displays.
 */

export interface Brand {
  slug: string;
  nameHe: string;
  nameEn: string;
  /** Device models used to build long-tail landing pages. */
  models: Array<{ slug: string; nameHe: string; queryTerm: string }>;
}

export interface Category {
  slug: string;
  nameHe: string;
  nameEn: string;
  /** Short Hebrew description, used in meta descriptions and category intros. */
  blurbHe: string;
  queryTerms: string[];
  /** Applies to these brand slugs; empty means all. */
  brands: string[];
}

export const BRANDS: Brand[] = [
  {
    slug: 'iphone',
    nameHe: 'אייפון',
    nameEn: 'iPhone',
    models: [
      { slug: 'iphone-17-pro-max', nameHe: 'אייפון 17 Pro Max', queryTerm: 'iPhone 17 Pro Max' },
      { slug: 'iphone-17-pro', nameHe: 'אייפון 17 Pro', queryTerm: 'iPhone 17 Pro' },
      { slug: 'iphone-17', nameHe: 'אייפון 17', queryTerm: 'iPhone 17' },
      { slug: 'iphone-16-pro-max', nameHe: 'אייפון 16 Pro Max', queryTerm: 'iPhone 16 Pro Max' },
      { slug: 'iphone-16-pro', nameHe: 'אייפון 16 Pro', queryTerm: 'iPhone 16 Pro' },
      { slug: 'iphone-16', nameHe: 'אייפון 16', queryTerm: 'iPhone 16' },
      { slug: 'iphone-15-pro-max', nameHe: 'אייפון 15 Pro Max', queryTerm: 'iPhone 15 Pro Max' },
      { slug: 'iphone-15', nameHe: 'אייפון 15', queryTerm: 'iPhone 15' },
    ],
  },
  {
    slug: 'samsung',
    nameHe: 'סמסונג',
    nameEn: 'Samsung Galaxy',
    models: [
      { slug: 'galaxy-s25-ultra', nameHe: 'גלקסי S25 Ultra', queryTerm: 'Samsung Galaxy S25 Ultra' },
      { slug: 'galaxy-s25', nameHe: 'גלקסי S25', queryTerm: 'Samsung Galaxy S25' },
      { slug: 'galaxy-s24-ultra', nameHe: 'גלקסי S24 Ultra', queryTerm: 'Samsung Galaxy S24 Ultra' },
      { slug: 'galaxy-s24', nameHe: 'גלקסי S24', queryTerm: 'Samsung Galaxy S24' },
      { slug: 'galaxy-a55', nameHe: 'גלקסי A55', queryTerm: 'Samsung Galaxy A55' },
      { slug: 'galaxy-z-fold', nameHe: 'גלקסי Z Fold', queryTerm: 'Samsung Galaxy Z Fold' },
    ],
  },
];

export const CATEGORIES: Category[] = [
  {
    slug: 'cases',
    nameHe: 'כיסויים',
    nameEn: 'Cases',
    blurbHe: 'כיסויים קשיחים, שקופים ומגנטיים — עמידות בנפילה והגנה על מצלמות.',
    queryTerms: ['case', 'shockproof case', 'clear case', 'magnetic case'],
    brands: [],
  },
  {
    slug: 'screen-protectors',
    nameHe: 'מגני מסך',
    nameEn: 'Screen Protectors',
    blurbHe: 'זכוכית מחוסמת, ציפוי אנטי-בוהק ומגני פרטיות — כולל מארזי רב-יחידות.',
    queryTerms: ['tempered glass screen protector', 'privacy screen protector'],
    brands: [],
  },
  {
    slug: 'chargers',
    nameHe: 'מטענים',
    nameEn: 'Chargers',
    blurbHe: 'מטעני GaN מהירים, PD ומטענים אלחוטיים מגנטיים.',
    queryTerms: ['GaN charger USB C PD', 'wireless charger magnetic', 'fast charger adapter'],
    brands: [],
  },
  {
    slug: 'cables',
    nameHe: 'כבלים',
    nameEn: 'Cables',
    blurbHe: 'כבלי USB-C, Lightning וכבלים מקולעים עם תמיכה בטעינה מהירה.',
    queryTerms: ['USB C cable fast charging', 'lightning cable braided'],
    brands: [],
  },
  {
    slug: 'power-banks',
    nameHe: 'סוללות ניידות',
    nameEn: 'Power Banks',
    blurbHe: 'סוללות ניידות מגנטיות וקומפקטיות לטעינה מלאה בדרכים.',
    queryTerms: ['power bank magnetic', 'power bank 20000mah slim'],
    brands: [],
  },
  {
    slug: 'audio',
    nameHe: 'אוזניות ושמע',
    nameEn: 'Audio',
    blurbHe: 'אוזניות TWS, מתאמי שמע ואביזרים נלווים.',
    queryTerms: ['TWS earbuds', 'bluetooth earphones ANC'],
    brands: [],
  },
  {
    slug: 'mounts',
    nameHe: 'מעמדים ומחזיקים',
    nameEn: 'Mounts',
    blurbHe: 'מחזיקי רכב מגנטיים, מעמדים שולחניים וחצובות.',
    queryTerms: ['magnetic car mount phone holder', 'phone stand desk'],
    brands: [],
  },
  {
    slug: 'camera',
    nameHe: 'צילום ומצלמה',
    nameEn: 'Camera',
    blurbHe: 'מגני עדשות, עדשות נשלפות ותאורה לצילום נייד.',
    queryTerms: ['camera lens protector', 'phone lens kit'],
    brands: ['iphone', 'samsung'],
  },
];

export function findCategory(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function findBrand(slug: string): Brand | undefined {
  return BRANDS.find((brand) => brand.slug === slug);
}

export interface CategoryBrandPage {
  /** Asset slug, and therefore the first SubID segment. */
  slug: string;
  titleHe: string;
  category: Category;
  brand: Brand;
  model?: { slug: string; nameHe: string; queryTerm: string };
  queryTerms: string[];
}

/**
 * Every page the storefront can generate from the taxonomy.
 *
 * This is where the economics of the model live: the same pipeline that fills
 * one page fills several hundred, which is the only way a few cents of
 * commission per order adds up to anything.
 */
export function enumeratePages(options: { includeModels?: boolean } = {}): CategoryBrandPage[] {
  const pages: CategoryBrandPage[] = [];

  for (const category of CATEGORIES) {
    for (const brand of BRANDS) {
      if (category.brands.length > 0 && !category.brands.includes(brand.slug)) continue;

      pages.push({
        slug: `${category.slug}-${brand.slug}`,
        titleHe: `${category.nameHe} ל${brand.nameHe}`,
        category,
        brand,
        queryTerms: category.queryTerms.map((term) => `${brand.nameEn} ${term}`),
      });

      if (options.includeModels === false) continue;

      for (const model of brand.models) {
        pages.push({
          slug: `${category.slug}-${model.slug}`,
          titleHe: `${category.nameHe} ל${model.nameHe}`,
          category,
          brand,
          model,
          queryTerms: category.queryTerms.map((term) => `${model.queryTerm} ${term}`),
        });
      }
    }
  }

  return pages;
}
