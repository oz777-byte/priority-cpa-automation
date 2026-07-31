import Link from 'next/link';
import { CATEGORIES } from '@affiliate/catalog';
import { publishablePages } from '../lib/catalog';
import { site } from '../lib/site';

export default async function HomePage() {
  const pages = await publishablePages();

  const byCategory = CATEGORIES.map((category) => {
    const entries = pages.filter((entry) => entry.page.category.slug === category.slug);
    const products = entries.reduce((sum, entry) => sum + entry.products.length, 0);
    return { category, entries, products };
  }).filter((group) => group.entries.length > 0);

  const totalProducts = pages.reduce((sum, entry) => sum + entry.products.length, 0);

  return (
    <>
      <h1>{site.tagline}</h1>
      <p className="lede">
        רק מוצרי Choice, רק מחנויות עם דירוג 95% ומעלה ומעל 300 הזמנות אחרונות. הקטלוג
        מתעדכן אוטומטית, והמוצרים מסודרים לפי מה שבאמת נקנה — לא לפי מי משלם יותר.
      </p>
      <p className="meta-line">
        <span>{pages.length} עמודים</span>
        <span>{totalProducts} מוצרים</span>
        <span>{byCategory.length} קטגוריות</span>
      </p>

      {byCategory.map(({ category, entries, products }) => (
        <section key={category.slug}>
          <h2>{category.nameHe}</h2>
          <p className="lede">{category.blurbHe}</p>
          <div className="cards" style={{ marginTop: 14 }}>
            {entries.slice(0, 8).map((entry) => (
              <Link
                key={entry.page.slug}
                className="card-link"
                href={`/${entry.page.category.slug}/${entry.page.model?.slug ?? entry.page.brand.slug}`}
              >
                <b>{entry.page.titleHe}</b>
                <span>{entry.page.brand.nameEn}</span>
                <em>{entry.products.length} מוצרים</em>
              </Link>
            ))}
          </div>
          {entries.length > 8 && (
            <p className="meta-line" style={{ marginTop: 10 }}>
              <span>ועוד {entries.length - 8} עמודים בקטגוריה — סה״כ {products} מוצרים</span>
            </p>
          )}
        </section>
      ))}
    </>
  );
}
