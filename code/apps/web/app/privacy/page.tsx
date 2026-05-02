import Link from 'next/link';

export const metadata = {
  title: 'מדיניות פרטיות · Priority CPA Automation',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-200 px-6 py-4">
        <Link href="/" className="text-sm text-accent-600 hover:underline">
          ← חזרה לעמוד הבית
        </Link>
      </header>
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-sm prose-slate" dir="rtl">
        <h1>מדיניות פרטיות</h1>
        <p className="text-ink-600">עדכון אחרון: מאי 2026</p>

        <p>
          מסמך זה מתאר כיצד <strong>O.S Tech Ventures</strong> (להלן
          &quot;החברה&quot;), המפעילה את שירות <strong>Priority CPA Automation</strong>
          (להלן &quot;השירות&quot;), אוספת, משתמשת ומגנה על מידע אישי וכספי של
          משתמשים והלקוחות שלהם.
        </p>

        <h2>1. סוגי המידע שאנחנו אוספים</h2>
        <ul>
          <li><strong>מידע על המשתמש</strong>: כתובת אימייל, שם, סיסמה מוצפנת.</li>
          <li>
            <strong>מידע עסקי של הלקוחות</strong>: שם החברה, מספר עוסק, חשבונות
            חשבונאיים, חשבוניות ספק, פקודות יומן.
          </li>
          <li>
            <strong>נתוני שימוש</strong>: זמני התחברות, פעולות שבוצעו במערכת,
            כתובות IP.
          </li>
        </ul>

        <h2>2. שימוש במידע</h2>
        <p>אנחנו משתמשים במידע אך ורק לשם:</p>
        <ul>
          <li>אספקת השירות עצמו (אוטומציית הזנת חשבוניות לפריוריטי).</li>
          <li>תיעוד פעולות לצרכי audit log כפי שדורש חוק רשות המסים בישראל.</li>
          <li>תמיכה טכנית.</li>
          <li>שיפור ביצועי השירות.</li>
        </ul>
        <p>
          <strong>אנחנו לא מוכרים, לא משכירים ולא מעבירים</strong> מידע לצדדים
          שלישיים שלא קשורים ישירות לאספקת השירות.
        </p>

        <h2>3. אחסון ואבטחה</h2>
        <ul>
          <li>
            הנתונים מאוחסנים אצל ספק תשתית מאובטח (Supabase, אזור Frankfurt /
            Singapore — כתלוי בהגדרת הפרויקט).
          </li>
          <li>הצפנה בעת אחסון (AES-256) והעברה (TLS 1.3).</li>
          <li>
            הפרדה לוגית מלאה בין משתמשים באמצעות{' '}
            <code>Row-Level Security</code> ב-Postgres.
          </li>
          <li>
            <strong>audit log שאינו ניתן לשינוי</strong>: trigger ב-DB חוסם
            UPDATE / DELETE על טבלת ה-audit, גם למנהלי המערכת.
          </li>
          <li>סיסמאות מוצפנות באמצעות bcrypt על ידי Supabase Auth.</li>
        </ul>

        <h2>4. שמירת מידע</h2>
        <p>
          כפי שדורש חוק רשות המסים הישראלי, נתונים חשבונאיים נשמרים לתקופה של{' '}
          <strong>7 שנים</strong> לכל הפחות מסיום שנת המס. ניתן לבקש מחיקה של
          חשבונות משתמשים ונתונים אישיים שאינם נדרשים לרגולציה — הבקשה תיענה
          בתוך 30 יום.
        </p>

        <h2>5. זכויות המשתמש</h2>
        <p>על פי חוק הגנת הפרטיות, התשמ"א-1981, לכל משתמש זכות:</p>
        <ul>
          <li>לעיין במידע שאנו מחזיקים עליו.</li>
          <li>לבקש תיקון של מידע שגוי.</li>
          <li>לבקש מחיקה (כפוף למגבלות הרגולטוריות לעיל).</li>
          <li>להעביר את המידע שלו לספק שירות אחר.</li>
        </ul>

        <h2>6. צדדים שלישיים</h2>
        <p>השירות עושה שימוש בספקים הבאים:</p>
        <ul>
          <li><strong>Supabase</strong> — אחסון נתונים ואימות.</li>
          <li><strong>Vercel</strong> — אירוח האפליקציה.</li>
          <li>
            <strong>Azure Document Intelligence</strong> — חילוץ נתונים מחשבוניות
            (כשהפיצ'ר מופעל).
          </li>
        </ul>
        <p>כל ספק חתום על הסכמי DPA / GDPR.</p>

        <h2>7. עוגיות (Cookies)</h2>
        <p>
          אנחנו משתמשים ב-cookies רק לשמירת הזהות (session) של המשתמש המחובר
          ולשמירה של החברה הנבחרת. אין cookies של מעקב או פרסום.
        </p>

        <h2>8. שינויים במדיניות</h2>
        <p>
          המדיניות עשויה להתעדכן. עדכונים מהותיים יישלחו במייל למשתמשים פעילים
          לפחות 30 יום מראש.
        </p>

        <h2>9. יצירת קשר</h2>
        <p>
          לשאלות בנושא פרטיות או בקשות בנוגע לזכויותיך, ניתן לפנות לאימייל:{' '}
          <a href="mailto:oz@oz-nihul.com" className="text-accent-600">
            oz@oz-nihul.com
          </a>
        </p>
      </article>
    </main>
  );
}
