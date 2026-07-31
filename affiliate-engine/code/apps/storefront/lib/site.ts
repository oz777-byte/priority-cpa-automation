/**
 * Site configuration, read from the environment at build time.
 *
 * `dataMode` is the important one. Until the affiliate API is connected the
 * catalog is fixture data, and a storefront that presents sample listings as
 * real ones would be misleading a shopper — so preview mode marks the site
 * clearly, blocks indexing, and refuses to render outbound buy links. Flipping
 * to `live` is a single environment variable once real data flows.
 */

export type DataMode = 'preview' | 'live';

export const dataMode: DataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === 'live' ? 'live' : 'preview';

export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? 'OS Tech Ventures',
  tagline: 'אביזרים נבחרים לאייפון ולסמסונג',
  baseUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com').replace(/\/$/, ''),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '',
  disclosureHe:
    'גילוי נאות: האתר מכיל קישורי שותפים. רכישה דרכם עשויה לזכות אותנו בעמלה, ללא עלות נוספת עבורכם. ' +
    'הבחירה במוצרים מבוססת על כללי סינון קבועים — דירוג המוכר, היקף הזמנות ותוכנית Choice — ואינה מושפעת מגובה העמלה.',
} as const;

export const isPreview = dataMode === 'preview';

/** Minimum products before a page is worth indexing; thin pages drag a domain down. */
export const MIN_PRODUCTS_TO_INDEX = 6;
