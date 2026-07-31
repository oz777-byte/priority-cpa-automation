import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { breadcrumbJsonLd, itemListJsonLd } from '@affiliate/catalog';
import { getPage, publishablePages } from '../../../lib/catalog';
import { MIN_PRODUCTS_TO_INDEX, isPreview, site } from '../../../lib/site';
import { ProductCard } from '../../product-card';

type Params = { category: string; target: string };

/**
 * Only pages that actually have products are emitted. An empty category page is
 * not worth publishing in any mode, and a build that silently produced dozens
 * of them would be indistinguishable from a working one.
 */
export async function generateStaticParams(): Promise<Params[]> {
  const pages = await publishablePages();
  return pages.map((entry) => ({
    category: entry.page.category.slug,
    target: entry.page.model?.slug ?? entry.page.brand.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category, target } = await params;
  const entry = await getPage(category, target);
  if (!entry) return {};

  const cheapest = entry.products
    .map((product) => product.salePriceMinor)
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b)[0];

  const priceHint = cheapest !== undefined ? ` החל מ-$${(cheapest / 100).toFixed(2)}` : '';
  const indexable = !isPreview && entry.products.length >= MIN_PRODUCTS_TO_INDEX;

  return {
    title: `${entry.page.titleHe} — ${entry.products.length} מוצרים נבחרים`,
    description: `${entry.page.category.blurbHe} מוצרי Choice מחנויות מדורגות${priceHint}.`,
    alternates: { canonical: `${site.baseUrl}/${category}/${target}` },
    // A thin page is emitted noindex rather than published as filler: pages
    // with almost nothing on them drag down how the whole domain is assessed.
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { category, target } = await params;
  const entry = await getPage(category, target);
  if (!entry || entry.products.length === 0) notFound();

  const url = `${site.baseUrl}/${category}/${target}`;
  const thin = entry.products.length < MIN_PRODUCTS_TO_INDEX;

  const structured = [
    breadcrumbJsonLd([
      { name: 'ראשי', url: `${site.baseUrl}/` },
      { name: entry.page.category.nameHe, url: `${site.baseUrl}/${category}/${entry.page.brand.slug}` },
      { name: entry.page.titleHe, url },
    ]),
    itemListJsonLd(
      entry.products,
      { baseUrl: site.baseUrl, siteName: site.name, disclosureHe: site.disclosureHe },
      url,
    ),
  ];

  return (
    <>
      <nav className="crumbs" aria-label="מיקום">
        <Link href="/">ראשי</Link>
        {' / '}
        <Link href={`/${category}/${entry.page.brand.slug}`}>{entry.page.category.nameHe}</Link>
        {' / '}
        <span>{entry.page.titleHe}</span>
      </nav>

      <h1>{entry.page.titleHe}</h1>
      <p className="lede">{entry.page.category.blurbHe}</p>
      <p className="meta-line">
        <span>{entry.products.length} מוצרים</span>
        <span>Choice בלבד</span>
        <span>דירוג מוכר 95%+</span>
      </p>

      {thin && !isPreview && (
        <p className="notice">
          העמוד עדיין דל במוצרים ולכן אינו נכלל באינדוקס. הוא ייפתח אוטומטית כשהסנכרון
          ימצא לפחות {MIN_PRODUCTS_TO_INDEX} מוצרים שעומדים בכללי הסינון.
        </p>
      )}

      <div className="grid">
        {entry.products.map((product, index) => (
          <ProductCard
            key={product.productId}
            product={product}
            pageSlug={entry.page.slug}
            categorySlug={category}
            position={index + 1}
          />
        ))}
      </div>

      <section className="prose">
        <h2>איך נבחרו המוצרים בעמוד הזה</h2>
        <p>
          הרשימה נבנית אוטומטית ומסוננת לפי כללים קבועים, לא לפי בחירה ידנית: רק מוצרים
          בתוכנית Choice, רק מחנויות בדירוג 95% ומעלה עם מעל 300 הזמנות אחרונות, ורק בטווח
          מחירים שבו האביזר נבדק כמשתלם. הסדר נקבע לפי שילוב של ביקוש בפועל ואיכות המוכר.
        </p>
        <p>
          איננו מוכרים את המוצרים ואיננו צד לעסקה. הרכישה, המשלוח, האחריות וההחזרות הם מול
          המוכר במרקטפלייס.
        </p>
      </section>

      {structured.map((json, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
        />
      ))}
    </>
  );
}
