import Link from 'next/link';
import {
  Building2,
  Inbox,
  FileEdit,
  Download,
  Check,
  type LucideIcon,
} from 'lucide-react';

interface Step {
  num: number;
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  done: boolean;
  current: boolean;
}

export function WorkflowSteps({
  hasCompany,
  hasInvoices,
  hasJEs,
  hasBatch,
}: {
  hasCompany: boolean;
  hasInvoices: boolean;
  hasJEs: boolean;
  hasBatch: boolean;
}) {
  const steps: Step[] = [
    {
      num: 1,
      icon: Building2,
      title: 'הגדר חברה',
      description: 'הוסף את החברה שאתה מטפל בה (שם, ע.מ, חשבונות חשבונאיים).',
      href: '/dashboard/companies',
      done: hasCompany,
      current: !hasCompany,
    },
    {
      num: 2,
      icon: Inbox,
      title: 'קבל חשבוניות',
      description: 'טען חשבוניות לדוגמה כדי לראות איך המערכת עובדת.',
      href: '/dashboard/companies',
      done: hasInvoices,
      current: hasCompany && !hasInvoices,
    },
    {
      num: 3,
      icon: FileEdit,
      title: 'ערוך פקודות יומן',
      description: 'בדוק את שורות ה-JE שנוצרו אוטומטית, ערוך לפי הצורך.',
      href: '/dashboard/journal-entries',
      done: hasJEs && hasBatch,
      current: hasInvoices && !hasBatch,
    },
    {
      num: 4,
      icon: Download,
      title: 'הפק קובץ לפריוריטי',
      description: 'הורד MOVEIN.DAT וטען לפריוריטי בלחיצה.',
      href: '/dashboard/journal-entries',
      done: hasBatch,
      current: false,
    },
  ];

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-ink-900 mb-1">איך זה עובד</h2>
      <p className="text-sm text-ink-600 mb-5">
        4 שלבים מקבלת החשבונית ועד הזנה לפריוריטי. כל שלב מתועד אוטומטית
        ב-audit log.
      </p>

      <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((s) => (
          <li key={s.num}>
            <Link
              href={s.href}
              className={`block h-full p-4 rounded-lg border transition ${
                s.current
                  ? 'border-accent-500 bg-accent-500/5 ring-2 ring-accent-500/20'
                  : s.done
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-ink-200 hover:border-ink-400 bg-ink-50/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    s.done
                      ? 'bg-green-600 text-white'
                      : s.current
                        ? 'bg-accent-600 text-white'
                        : 'bg-ink-200 text-ink-600'
                  }`}
                >
                  {s.done ? <Check size={14} /> : s.num}
                </div>
                <s.icon
                  size={16}
                  className={s.done ? 'text-green-600' : s.current ? 'text-accent-600' : 'text-ink-400'}
                />
              </div>
              <div className="font-semibold text-ink-900 text-sm mb-1">{s.title}</div>
              <div className="text-xs text-ink-600 leading-snug">{s.description}</div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
