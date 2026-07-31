import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORIES } from '@affiliate/catalog';
import { isPreview, site } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
  description:
    'אביזרים לאייפון ולסמסונג מתוך תוכנית Choice, מחנויות עם דירוג גבוה והיקף הזמנות מוכח.',
  // Preview builds are never indexed: the catalog is sample data, and letting
  // it into search results would put fabricated listings in front of shoppers.
  robots: isPreview ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: site.name,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {isPreview && (
          <div className="preview-bar">
            <div className="shell">
              <b>תצוגה מקדימה</b>
              <span>
                הקטלוג הוא נתוני דוגמה עד לחיבור חשבון השותפים. המחירים אינם אמיתיים,
                הקישורים אינם פעילים, והאתר חסום לאינדוקס.
              </span>
            </div>
          </div>
        )}

        <header className="site-head">
          <div className="shell">
            <Link href="/" className="brand">
              <span className="mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f26419"
                  strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                  <path d="M12 17.5h.01" />
                </svg>
              </span>
              <span>
                <b>{site.name}</b>
                <span>Choice Accessories</span>
              </span>
            </Link>

            <nav className="nav" aria-label="קטגוריות">
              {CATEGORIES.slice(0, 5).map((category) => (
                <Link key={category.slug} href={`/${category.slug}/iphone`}>
                  {category.nameHe}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <div className="shell">{children}</div>
        </main>

        <footer className="site-foot">
          <div className="shell">
            <div className="foot-links">
              <Link href="/">ראשי</Link>
              <Link href="/disclosure">גילוי נאות</Link>
              <Link href="/privacy">מדיניות פרטיות</Link>
              <Link href="/terms">תנאי שימוש</Link>
            </div>
            <p className="disclosure">{site.disclosureHe}</p>
            <p className="disclosure">
              © {site.name}. איננו מוכרים מוצרים ואיננו צד לעסקה — הרכישה מתבצעת מול
              המוכר במרקטפלייס, ואחריות, משלוח והחזרות הם באחריותו.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
