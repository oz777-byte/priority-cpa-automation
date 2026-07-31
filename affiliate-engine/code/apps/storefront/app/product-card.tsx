import type { CatalogProduct, CategoryBrandPage } from '@affiliate/catalog';
import { hebrewTitleForPage } from '@affiliate/catalog';
import { isPreview } from '../lib/site';
import { subIdFor } from '../lib/catalog';

/**
 * Marketplace image CDNs rewrite and expire URLs, and hotlinking them leaves
 * broken pictures across a catalog nobody is watching. Until images are
 * proxied and cached, a category glyph stands in — the honest placeholder.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  cases: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <circle cx="15" cy="7" r="1.4" />
    </>
  ),
  'screen-protectors': <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />,
  chargers: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  cables: <path d="M5 7a4 4 0 0 1 8 0v10a4 4 0 0 0 6 3M9 3v4M13 3v4" />,
  'power-banks': (
    <>
      <rect x="3.5" y="7" width="15" height="10" rx="2.5" />
      <path d="M20.5 11v2" />
    </>
  ),
  audio: <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-4H6a2 2 0 0 0-2 2zm16 0a2 2 0 0 1-2 2h-1v-4h1a2 2 0 0 1 2 2z" />,
  mounts: (
    <>
      <rect x="7.5" y="2.5" width="9" height="14" rx="2" />
      <path d="M12 16.5V22M8 22h8" />
    </>
  ),
  camera: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M3 8.5h3l1.5-2.5h9L18 8.5h3v10H3z" />
    </>
  ),
};

export function ProductCard({
  product,
  page,
  position,
}: {
  product: CatalogProduct;
  page: CategoryBrandPage;
  position: number;
}) {
  const categorySlug = page.category.slug;
  const pageSlug = page.slug;
  const titleHe = hebrewTitleForPage(product, page);
  const price = product.salePriceMinor !== null ? (product.salePriceMinor / 100).toFixed(2) : null;
  const was =
    product.originalPriceMinor !== null && product.originalPriceMinor > (product.salePriceMinor ?? 0)
      ? (product.originalPriceMinor / 100).toFixed(2)
      : null;

  const subId = subIdFor(pageSlug, position);

  return (
    <article className="product">
      <div className="thumb">
        {product.isChoice && <span className="choice">CHOICE</span>}
        {product.discountPercent !== null && product.discountPercent > 0 && (
          <span className="off">−{product.discountPercent}%</span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {GLYPHS[categorySlug] ?? GLYPHS.cases}
        </svg>
      </div>

      <div className="info">
        <h3 className="name">{titleHe}</h3>
        {/* The marketplace title stays visible so a shopper can match this
            card against the listing they land on. */}
        <p className="source-title" lang="en" dir="ltr">
          {product.title}
        </p>

        {price && (
          <p className="price">
            <span className="now">${price}</span>
            {was && <span className="was">${was}</span>}
          </p>
        )}

        <p className="seller">
          {product.shopName && <span>{product.shopName}</span>}
          {product.shopRating !== null && <span>{product.shopRating}%</span>}
          <span>{product.recentOrders.toLocaleString('en-US')} הזמנות</span>
        </p>

        {isPreview ? (
          <>
            <p className="subid">
              SubID → <b>{subId}</b>
            </p>
            <p className="cta-disabled">הקישור ייפתח כשחשבון השותפים יחובר</p>
          </>
        ) : (
          <a
            className="cta"
            href={product.promotionLink ?? product.detailUrl}
            rel="nofollow sponsored noopener"
            target="_blank"
            data-subid={subId}
          >
            לצפייה במרקטפלייס
          </a>
        )}
      </div>
    </article>
  );
}
