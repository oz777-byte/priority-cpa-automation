import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Hand,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { RULES, type AccountingRule, type RuleStatus, type ExampleSpec } from './rules-data';

export const dynamic = 'force-dynamic';

export default function AccountingRulesPage() {
  const groups = {
    auto: RULES.filter((r) => r.status === 'auto'),
    autoWithWarning: RULES.filter((r) => r.status === 'auto-with-warning'),
    manual: RULES.filter((r) => r.status === 'manual'),
    comingSoon: RULES.filter((r) => r.status === 'coming-soon'),
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        icon={BookOpen}
        title="חוקי הנהלת החשבונות במערכת"
        description="ספריית כל התרחישים שהמערכת מטפלת בהם אוטומטית. לכל תרחיש: מתי הוא מופעל, איזה JE נבנה, ודוגמה מספרית. השפה החשבונאית שלמערכת — שקופה ופתוחה."
      />

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Counter
          icon={CheckCircle2}
          tone="emerald"
          label="אוטומטי מלא"
          value={groups.auto.length}
        />
        <Counter
          icon={AlertTriangle}
          tone="amber"
          label="אוטומטי עם אזהרה"
          value={groups.autoWithWarning.length}
        />
        <Counter icon={Hand} tone="blue" label="ידני" value={groups.manual.length} />
        <Counter
          icon={Sparkles}
          tone="purple"
          label="בקרוב"
          value={groups.comingSoon.length}
        />
      </div>

      {/* Universal rules note */}
      <div className="bg-brand-radial text-white rounded-xl p-5 mb-8">
        <div className="font-semibold mb-1">שתי שכבות של לוגיקה</div>
        <div className="text-sm text-white/70 leading-relaxed">
          <strong className="text-white">אוניברסלי</strong> (זהה לכל החברות): שיעור
          מע"מ, רף הקצאה, ניכוי מעורב — קבועים בחוק המס הישראלי.
          <strong className="text-white mr-3">פר-חברה</strong>: חשבונות, מרכזי
          עלות, חשבונות בנק, מאסטר ספקים, כללי מיפוי. כל זה מוגדר בנפרד לכל
          לקוח.
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-4">
        {RULES.map((rule) => (
          <RuleCard key={rule.code} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function Counter({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof BookOpen;
  tone: 'emerald' | 'amber' | 'blue' | 'purple';
  label: string;
  value: number;
}) {
  const palette = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
  }[tone];
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${palette}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink-900 tabular-nums">{value}</div>
        <div className="text-xs text-ink-600">{label}</div>
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: AccountingRule }) {
  return (
    <article className="bg-white border border-ink-200 rounded-xl overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-ink-100 flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
          <rule.icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-ink-900">{rule.title}</h3>
            <code className="text-[10px] font-mono px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded" dir="ltr">
              {rule.code}
            </code>
            <StatusBadge status={rule.status} />
          </div>
          <p className="text-sm text-ink-700">{rule.oneLiner}</p>
        </div>
      </header>

      {/* Body */}
      <div className="p-5 space-y-5 text-sm">
        <p className="text-ink-700 leading-relaxed">{rule.description}</p>

        <Section title="מתי המערכת מפעילה את התרחיש">
          <ul className="space-y-1 text-ink-700">
            {rule.triggers.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-brand-500 mt-0.5">▪</span>
                <span dir="auto">{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="מבנה פקודת היומן שתיווצר">
          <p className="text-ink-700">{rule.jeStructure}</p>
        </Section>

        <Section title="דוגמה מספרית" highlight>
          <Example example={rule.example} />
        </Section>

        <Section title="חוקים שמופעלים">
          <ul className="space-y-1 text-ink-700">
            {rule.rules.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Section>

        {rule.perCompanyOverrides && rule.perCompanyOverrides.length > 0 && (
          <Section title="ניתן לשינוי פר-חברה">
            <ul className="space-y-1 text-ink-700">
              {rule.perCompanyOverrides.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">⚙</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </article>
  );
}

function Section({
  title,
  highlight,
  children,
}: {
  title: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={highlight ? 'bg-ink-50/60 border border-ink-100 rounded-lg p-4' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Example({ example }: { example: ExampleSpec }) {
  return (
    <div className="space-y-3">
      <div className="text-ink-700 text-sm">{example.description}</div>

      {/* Invoice details */}
      <div className="bg-white border border-ink-200 rounded-md p-3 text-xs">
        <div className="text-[10px] text-ink-500 uppercase tracking-wider mb-1">החשבונית</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {example.invoice.number && (
            <KV label='מס׳' value={example.invoice.number} ltr />
          )}
          {example.invoice.supplier && (
            <KV label='ספק' value={example.invoice.supplier} />
          )}
          <KV label='סכום ביניים' value={`${example.invoice.subtotal.toFixed(2)} ₪`} />
          <KV label='סך הכול' value={`${example.invoice.total.toFixed(2)} ₪`} />
          {example.invoice.extras &&
            Object.entries(example.invoice.extras).map(([k, v]) => (
              <KV key={k} label={k} value={String(v)} />
            ))}
        </div>
      </div>

      {/* JE table */}
      <div className="bg-white border border-ink-200 rounded-md overflow-hidden">
        <div className="text-[10px] text-ink-500 uppercase tracking-wider px-3 pt-2 mb-1">
          פקודת היומן שתיווצר
        </div>
        <table className="w-full text-xs">
          <thead className="text-ink-500">
            <tr className="border-b border-ink-100">
              <th className="text-right px-3 py-1.5 font-medium">חשבון</th>
              <th className="text-right px-3 py-1.5 font-medium">חובה</th>
              <th className="text-right px-3 py-1.5 font-medium">זכות</th>
              <th className="text-right px-3 py-1.5 font-medium">תיאור</th>
            </tr>
          </thead>
          <tbody>
            {example.je.map((line, i) => (
              <tr key={i} className="border-b border-ink-100 last:border-0">
                <td className="px-3 py-1.5 font-mono text-ink-900" dir="ltr">{line.account}</td>
                <td className="px-3 py-1.5 tabular-nums">
                  {line.side === 'DR' ? line.amount : '—'}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {line.side === 'CR' ? line.amount : '—'}
                </td>
                <td className="px-3 py-1.5 text-ink-600">{line.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {example.notes && example.notes.length > 0 && (
        <ul className="text-xs text-ink-600 space-y-1">
          {example.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-ink-400">›</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KV({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-500">{label}:</span>
      <span className="text-ink-900 font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: RuleStatus }) {
  const map: Record<RuleStatus, { bg: string; text: string; label: string }> = {
    auto: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'אוטומטי' },
    'auto-with-warning': {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      label: 'אוטומטי + אזהרה',
    },
    manual: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'ידני' },
    'coming-soon': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'בקרוב' },
  };
  const c = map[status];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
