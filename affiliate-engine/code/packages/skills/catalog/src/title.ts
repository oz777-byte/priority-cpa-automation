import type { CatalogProduct } from './normalize';
import type { CategoryBrandPage } from './taxonomy';

/**
 * Hebrew display titles, composed from a controlled template.
 *
 * Marketplace titles are English keyword soup written for marketplace search
 * ("Shockproof Clear Case for iPhone 16 17 Pro Max Camera Lens Protection").
 * Two obvious options are both wrong: showing them raw reads as a foreign
 * catalog on a Hebrew page, and machine-translating them produces the exact
 * pattern search engines treat as scraped spam.
 *
 * So the title is rebuilt rather than translated: the category noun, the
 * attributes we recognise, the device from the page, and the one spec that
 * matters. Anything unrecognised is dropped rather than guessed at. The
 * original stays on the product as a secondary line so a shopper can match it
 * against the marketplace listing.
 */

interface Attribute {
  /** Matched against the lowercased source title. */
  match: RegExp;
  he: string;
  /**
   * How much this attribute distinguishes one listing from its neighbours,
   * used to choose which few to keep. Separate from `order` on purpose:
   * "magnetic" tells a shopper far more than "slim", but it reads later in
   * the sentence — conflating the two picks the wrong attributes.
   */
  weight: number;
  /** Lower sorts earlier, so the chosen attributes read naturally in Hebrew. */
  order: number;
}

const ATTRIBUTES: Attribute[] = [
  { match: /\bmagnetic\b|\bmagsafe\b/, he: 'מגנטי', weight: 90, order: 20 },
  { match: /\btempered glass\b/, he: 'זכוכית מחוסמת', weight: 90, order: 10 },
  { match: /\bprivacy\b|\banti spy\b/, he: 'פרטיות', weight: 85, order: 12 },
  { match: /\bgan\b/, he: 'GaN', weight: 80, order: 14 },
  { match: /\banc\b|\bnoise cancelling\b/, he: 'ביטול רעשים', weight: 80, order: 24 },
  { match: /\bshockproof\b|\barmor\b/, he: 'נגד זעזועים', weight: 70, order: 30 },
  { match: /\bwireless\b/, he: 'אלחוטי', weight: 70, order: 20 },
  { match: /\bcar mount\b|\bvent\b|\bdashboard\b/, he: 'לרכב', weight: 65, order: 45 },
  { match: /\bbraided\b|\bnylon\b/, he: 'מקולע', weight: 60, order: 22 },
  { match: /\bfoldable\b/, he: 'מתקפל', weight: 55, order: 18 },
  { match: /\bclear\b|\btransparent\b/, he: 'שקוף', weight: 50, order: 10 },
  { match: /\bdesk\b/, he: 'שולחני', weight: 50, order: 18 },
  { match: /\bfast charging\b|\bfast charger\b/, he: 'טעינה מהירה', weight: 40, order: 40 },
  { match: /\bslim\b/, he: 'דק', weight: 30, order: 15 },
];

/**
 * Specs worth keeping verbatim — the numbers a buyer compares on.
 *
 * Where they sit in the sentence matters. A hardware rating describes the
 * product ("מטען 65W לאייפון"), so it belongs before the device; a quantity or
 * a length describes the package and reads naturally at the end.
 */
const INLINE_SPECS: RegExp[] = [/\b(\d{2,3}W)\b/i, /\b(\d{4,6}mAh)\b/i];
const TRAILING_SPECS: RegExp[] = [/\b(\d)\s?pack\b/i, /\b(\d(?:\.\d)?m)\b/];

/** Implied by a wattage rating, so it is dropped when one is present. */
const IMPLIED_BY_WATTAGE = 'טעינה מהירה';

export interface HebrewTitleOptions {
  /** Device name to append, e.g. "אייפון 16 Pro Max". */
  deviceHe?: string;
  /** Category noun in the singular, e.g. "כיסוי". */
  nounHe: string;
  maxAttributes?: number;
}

export function composeHebrewTitle(
  sourceTitle: string,
  options: HebrewTitleOptions,
): string {
  const source = sourceTitle.toLowerCase();

  const inlineSpecs = collectSpecs(sourceTitle, INLINE_SPECS);
  const trailingSpecs = collectSpecs(sourceTitle, TRAILING_SPECS);

  // A hardware rating already carries the claim, so it takes the slot an
  // adjective would otherwise fill rather than stacking on top of it.
  const attributeBudget = options.maxAttributes ?? (inlineSpecs.length > 0 ? 1 : 2);

  // Choose by how much each attribute distinguishes the listing, then put the
  // survivors back into reading order.
  const attributes = ATTRIBUTES.filter((attribute) => attribute.match.test(source))
    .filter((attribute) => !(inlineSpecs.length > 0 && attribute.he === IMPLIED_BY_WATTAGE))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, attributeBudget)
    .sort((a, b) => a.order - b.order)
    .map((attribute) => attribute.he);

  const parts = [options.nounHe, ...attributes, ...inlineSpecs.slice(0, 1)];
  if (options.deviceHe) parts.push(`ל${options.deviceHe}`);
  parts.push(...trailingSpecs.slice(0, 1));

  return parts.join(' ');
}

function collectSpecs(sourceTitle: string, patterns: RegExp[]): string[] {
  const specs: string[] = [];
  for (const pattern of patterns) {
    const found = sourceTitle.match(pattern);
    if (found?.[1]) {
      specs.push(/pack/i.test(found[0]) ? `${found[1]} יחידות` : found[1]);
    }
  }
  return specs;
}

/** Convenience wrapper that reads the noun and device off a taxonomy page. */
export function hebrewTitleForPage(
  product: CatalogProduct,
  page: CategoryBrandPage,
): string {
  return composeHebrewTitle(product.title, {
    nounHe: page.category.nounHe,
    deviceHe: page.model?.nameHe ?? page.brand.nameHe,
  });
}
