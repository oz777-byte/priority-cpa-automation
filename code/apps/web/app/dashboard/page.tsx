import Link from 'next/link';

export default function DashboardHomePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">ברוך הבא</h1>
        <p className="text-ink-600 mt-1">
          זה ה-MVP של מערכת ה-Priority CPA. כרגע זמינות שתי חשבוניות לדוגמה
          מה-POC של טארי.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="חשבוניות לטיפול" value="2" hint="מה-POC" />
        <Card title="חשבונות פעילים" value="1" hint="טארי" />
        <Card title="קבצי MOVEIN" value="0" hint="הופקו עד כה" />
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">צעד הבא</h2>
        <p className="text-sm text-ink-600">
          לחץ על &quot;חשבוניות&quot; בתפריט העליון. תראה את שתי החשבוניות
          מה-POC, תוכל לבדוק את ה-validation, ולהוריד קובץ MOVEIN.DAT אמיתי.
        </p>
        <Link
          href="/dashboard/invoices"
          className="inline-block px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500 transition"
        >
          לחשבוניות
        </Link>
      </div>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5">
      <div className="text-sm text-ink-600">{title}</div>
      <div className="mt-2 text-3xl font-bold text-ink-900">{value}</div>
      <div className="mt-1 text-xs text-ink-400">{hint}</div>
    </div>
  );
}
