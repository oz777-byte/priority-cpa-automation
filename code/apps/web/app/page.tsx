import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-ink-900">
          רואי החשבון לא מקלידים יותר
        </h1>
        <p className="text-lg text-ink-600 leading-relaxed">
          המערכת קולטת חשבוניות ספק, מציעה פקודות יומן מדויקות, ומפיקה קובץ
          לטעינה אוטומטית בפריוריטי.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/login"
            className="px-6 py-3 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-500 transition"
          >
            כניסה למערכת
          </Link>
        </div>
        <div className="pt-8 text-sm text-ink-400">
          Priority CPA Automation · גרסה 0.1.0
        </div>
      </div>
    </main>
  );
}
