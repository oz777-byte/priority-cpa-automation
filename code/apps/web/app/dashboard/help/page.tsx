import Link from 'next/link';
import {
  HelpCircle,
  Building2,
  Inbox,
  FileEdit,
  Download,
  Shield,
  Users,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        icon={HelpCircle}
        title="מדריך הפעלה"
        description="הסבר על מהות המערכת, הזרימה היומית, ומה לעשות בכל שלב. אם משהו לא ברור — תפנה לתמיכה."
      />

      <div className="space-y-8">
        <Section
          icon={CheckCircle2}
          title="מה המערכת עושה?"
        >
          <p>
            <strong>Priority CPA Automation</strong> מבטלת את הצורך בהזנה ידנית של
            חשבוניות ספק לפריוריטי. במקום שהרו"ח יקליד כל חשבונית, המערכת:
          </p>
          <ol className="list-decimal pr-5 mt-3 space-y-1.5">
            <li>קולטת את החשבונית (מייל / Drive / העלאה ידנית).</li>
            <li>מחלצת אוטומטית את כל הנתונים (OCR בעברית).</li>
            <li>מתאימה לספק במאסטר על-פי ע.מ.</li>
            <li>בונה פקודת יומן מאוזנת לפי כללי החשבונאות הישראליים.</li>
            <li>מציגה לרו"ח לאישור — עם אפשרות עריכה.</li>
            <li>מפיקה קובץ MOVEIN.DAT לטעינה לפריוריטי בלחיצה.</li>
          </ol>
          <p className="mt-3">
            התוצאה: חשבונית שלקחה <strong>5 דקות</strong> עכשיו לוקחת{' '}
            <strong>30 שניות</strong>. ה-90% של הזמן הוא בפעולות אוטומטיות שלא דורשות
            מעורבות.
          </p>
        </Section>

        <Section icon={Building2} title="הזרימה היומית">
          <Step num={1} title="הוספת חברה (חד-פעמי לכל לקוח)">
            עבור ל"החברות שלי" → הוסף חברה. תזין שם, ע.מ, וחשבונות חשבונאיים
            ברירת מחדל (חשבון הוצאה, חשבון מע"מ תשומות). כל חברה היא לקוח של
            המשרד שלך.
          </Step>
          <Step num={2} title="קליטת חשבוניות">
            הוסף חשבונית ידנית מתוך ה-workspace של הלקוח (כפתור &quot;הוסף
            חשבונית&quot;). בקרוב יתווספו: גרירת PDF עם חילוץ נתונים אוטומטי,
            וקליטה אוטומטית ממייל / Drive.
          </Step>
          <Step num={3} title="עריכת פקודות יומן">
            לחץ על &quot;פקודות יומן&quot; בתפריט. תראה את כל ה-JE-ים שנוצרו אוטומטית.
            ערוך כל שורה (חשבון/סכום/פרטים) ישירות בטבלה — השינויים נשמרים
            אוטומטית ברגע שאתה לוחץ מחוץ לשדה.
          </Step>
          <Step num={4} title="ייצוא לפריוריטי">
            כשהכל מוכן — לחץ &quot;הפק MOVEIN.DAT&quot;. הקובץ יורד אוטומטית. טען אותו
            לפריוריטי דרך התפריט: <code>כספים → תחזוקת כספים → ממשקים להנה"ח →
            ממשק תנועות יומן → טעינה מתוכנות אחרות (פורמט MOVEIN.DAT)</code>.
          </Step>
        </Section>

        <Section icon={Shield} title="אבטחה ופרטיות">
          <ul className="list-disc pr-5 space-y-1.5">
            <li>
              <strong>multi-tenant מלא</strong>: כל משתמש רואה רק את החברות
              שהוא משויך אליהן. מאוכף ברמת DB באמצעות RLS (Row-Level Security).
            </li>
            <li>
              <strong>audit log לכל פעולת write</strong>: כל יצירה / עריכה /
              מחיקה נכתבת לטבלה append-only. trigger ב-DB חוסם
              UPDATE/DELETE — שמירה ל-7 שנים כפי שדורש חוק רשות המסים.
            </li>
            <li>
              <strong>סיסמאות חזקות</strong>: מינימום 12 תווים, עם אות גדולה,
              קטנה וספרה. ניתן להחליף בכל עת ב"הגדרות חשבון".
            </li>
            <li>
              <strong>הזמנת משתמשים בלבד</strong>: אין הרשמה ציבורית. מנהל
              המערכת יוצר חשבונות עם סיסמה זמנית.
            </li>
            <li>
              <strong>הגבלת מכסה</strong>: חשבון בסיסי תומך עד 5 משתמשים. ניתן
              להרחיב.
            </li>
          </ul>
        </Section>

        <Section icon={Users} title="ניהול משתמשים">
          <p>
            אם אתה <strong>מנהל מערכת</strong>, יש לך גישה לתפריט
            &quot;משתמשי המערכת&quot; (מהתפריט בפינה הימנית עליונה ⟵ תפריט המשתמש שלך).
            שם תוכל:
          </p>
          <ul className="list-disc pr-5 mt-2 space-y-1.5">
            <li>להזמין משתמשים חדשים — תקבל סיסמה זמנית להעברה ידנית.</li>
            <li>לקבוע תפקיד (משתמש רגיל / מנהל מערכת).</li>
            <li>למחוק משתמשים — כל הפעולות שלהם נשארות ב-audit log.</li>
          </ul>
        </Section>

        <Section icon={AlertCircle} title="בעיות נפוצות">
          <FAQ q='לחצתי "הפק MOVEIN.DAT" וקיבלתי "אין פקודות יומן לייצוא".'>
            ייתכן שכבר ייצאת אותן. בדוק בעמוד &quot;פקודות יומן&quot; — JE-ים שיוצאו
            מופיעים בתחתית בקטגוריה &quot;היסטוריה&quot;. כדי לייצא חדשות, צריך לטעון
            חשבוניות נוספות.
          </FAQ>
          <FAQ q="לא רואה את החברה שלי בתפריט החלפת חברה.">
            וודא שאתה מחובר עם המשתמש הנכון. כל משתמש רואה רק את החברות שהוא
            משויך אליהן. אם החברה צריכה להיות נגישה — פנה למנהל המערכת.
          </FAQ>
          <FAQ q="פקודת היומן שלי לא מאוזנת (חובה ≠ זכות).">
            המערכת תציג אזהרה בתחתית ה-JE. ייצוא של JE לא מאוזן ייחסם — חובה
            לתקן את הסכומים תחילה. ההפרש המותר: עד 0.05 ₪.
          </FAQ>
        </Section>

        <div className="bg-brand-radial text-white rounded-xl p-6 text-center">
          <p className="text-white/80 text-sm mb-3">
            לא מצאת תשובה? צריך עזרה ספציפית?
          </p>
          <a
            href="mailto:oz@oz-nihul.com"
            className="inline-block px-5 py-2 bg-brand-500 text-brand-950 rounded-lg font-semibold hover:bg-brand-400 transition"
          >
            פנה לתמיכה
          </a>
        </div>

        <div className="text-center text-sm text-ink-600 pt-4">
          <Link href="/dashboard" className="text-accent-600 hover:underline">
            ← חזרה ללוח הבקרה
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof HelpCircle;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
          <Icon size={18} />
        </div>
        <h2 className="text-lg font-semibold text-ink-900 pt-1.5">{title}</h2>
      </div>
      <div className="text-sm text-ink-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-3 last:mb-0">
      <div className="w-7 h-7 rounded-full bg-accent-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        {num}
      </div>
      <div>
        <div className="font-semibold text-ink-900 mb-1">{title}</div>
        <div className="text-sm text-ink-700">{children}</div>
      </div>
    </div>
  );
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="border-b border-ink-100 py-3 last:border-0">
      <summary className="font-medium text-ink-900 cursor-pointer hover:text-accent-600">
        {q}
      </summary>
      <div className="mt-2 text-sm text-ink-700 pr-2">{children}</div>
    </details>
  );
}
