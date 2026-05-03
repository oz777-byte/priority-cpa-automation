'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Hand,
  Sparkles,
  Search,
  ChevronDown,
  Zap,
  FileCode2,
  Settings2,
  Lightbulb,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import {
  RULES,
  CATEGORY_LABELS,
  type AccountingRule,
  type RuleStatus,
  type RuleCategory,
  type ExampleSpec,
} from './rules-data';

type FilterKey = 'all' | RuleStatus;

export default function AccountingRulesPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openCode, setOpenCode] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: RULES.length,
      auto: RULES.filter((r) => r.status === 'auto').length,
      'auto-with-warning': RULES.filter((r) => r.status === 'auto-with-warning').length,
      manual: RULES.filter((r) => r.status === 'manual').length,
      'coming-soon': RULES.filter((r) => r.status === 'coming-soon').length,
    }),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RULES.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.oneLiner.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        icon={BookOpen}
        title="ניהול חוקי הנהלת חשבונות"
        description="כל אוטומציה במערכת היא חוק חשבונאי שבונה JE לסוג מסוים של חשבונית. לחץ על שורה לראות פירוט מלא: מתי היא מופעלת, איזה JE נבנה, דוגמה מספרית, וניתן לשינוי פר-חברה."
      />

      {/* Toolbar: search + filters */}
      <div className="bg-white border border-ink-200 rounded-xl p-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם, קוד או תיאור..."
              className="w-full pr-9 pl-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="הכול"
              count={counts.all}
            />
            <FilterChip
              active={filter === 'auto'}
              onClick={() => setFilter('auto')}
              label="אוטומטי"
              count={counts.auto}
              tone="emerald"
              icon={CheckCircle2}
            />
            <FilterChip
              active={filter === 'auto-with-warning'}
              onClick={() => setFilter('auto-with-warning')}
              label="אזהרה"
              count={counts['auto-with-warning']}
              tone="amber"
              icon={AlertTriangle}
            />
            {counts.manual > 0 && (
              <FilterChip
                active={filter === 'manual'}
                onClick={() => setFilter('manual')}
                label="ידני"
                count={counts.manual}
                tone="blue"
                icon={Hand}
              />
            )}
            <FilterChip
              active={filter === 'coming-soon'}
              onClick={() => setFilter('coming-soon')}
              label="בקרוב"
              count={counts['coming-soon']}
              tone="purple"
              icon={Sparkles}
            />
          </div>
        </div>
      </div>

      {/* Compact info banners */}
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <InfoBanner
          icon={Settings2}
          title="שתי שכבות"
          body={
            <>
              <strong>אוניברסלי</strong> (קבוע בחוק): מע"מ, רף הקצאה, ניכוי מעורב.{' '}
              <strong>פר-חברה</strong>: חשבונות, מרכזי עלות, מאסטר ספקים.
            </>
          }
        />
        <InfoBanner
          icon={FileCode2}
          title="פורמט ייצוא MOVEIN"
          body={
            <>
              <strong>180</strong> סטנדרטי, <strong>FLEXIBLE</strong> אוטומטי כשנדרש
              מרכז עלות, הקצאה ארוכה, או יותר מ-4 שורות.
            </>
          }
        />
      </div>

      {/* Rules grouped by category */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-ink-500 text-sm">
          לא נמצאו חוקים תואמים את החיפוש.
        </div>
      ) : (
        <div className="space-y-6">
          {groupByCategory(filtered).map(([category, rules]) => (
            <section key={category}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-700 mb-2 px-1 flex items-center gap-2">
                {CATEGORY_LABELS[category]}
                <span className="text-[10px] font-medium text-ink-400 tabular-nums">
                  {rules.length}
                </span>
              </h2>
              <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
                <ul className="divide-y divide-ink-100">
                  {rules.map((rule) => (
                    <RuleRow
                      key={rule.code}
                      rule={rule}
                      isOpen={openCode === rule.code}
                      onToggle={() =>
                        setOpenCode((prev) => (prev === rule.code ? null : rule.code))
                      }
                    />
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="text-xs text-ink-400 text-center mt-6">
        מציג {filtered.length} מתוך {RULES.length} חוקים
      </div>
    </div>
  );
}

const CATEGORY_ORDER: RuleCategory[] = [
  'supplier',
  'customer',
  'bank',
  'payroll',
  'assets',
  'inventory',
  'period',
  'year-end',
];

function groupByCategory(
  rules: AccountingRule[],
): Array<[RuleCategory, AccountingRule[]]> {
  const buckets = new Map<RuleCategory, AccountingRule[]>();
  for (const rule of rules) {
    const arr = buckets.get(rule.category) ?? [];
    arr.push(rule);
    buckets.set(rule.category, arr);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map(
    (c) => [c, buckets.get(c)!] as [RuleCategory, AccountingRule[]],
  );
}

/* ---------------- toolbar ---------------- */

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'emerald' | 'amber' | 'blue' | 'purple';
  icon?: typeof CheckCircle2;
}) {
  const activeClass = active
    ? tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : tone === 'blue'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : tone === 'purple'
            ? 'bg-purple-50 text-purple-800 border-purple-200'
            : 'bg-ink-900 text-white border-ink-900'
    : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition ${activeClass}`}
    >
      {Icon && <Icon size={13} />}
      <span>{label}</span>
      <span
        className={`text-[10px] tabular-nums ${
          active && !tone ? 'text-white/70' : 'text-ink-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function InfoBanner({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Settings2;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
        <Icon size={16} />
      </div>
      <div className="text-xs text-ink-700 leading-relaxed">
        <div className="font-semibold text-ink-900 text-sm mb-0.5">{title}</div>
        <div>{body}</div>
      </div>
    </div>
  );
}

/* ---------------- rule row ---------------- */

function RuleRow({
  rule,
  isOpen,
  onToggle,
}: {
  rule: AccountingRule;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tone = statusTone(rule.status);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50/60 transition text-right"
      >
        {/* Status accent bar */}
        <div className={`w-1 self-stretch rounded ${tone.barBg}`} />

        {/* Icon */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.iconBg} ${tone.iconText}`}
        >
          <rule.icon size={16} />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900 text-sm">{rule.title}</span>
            <code
              className="text-[10px] font-mono px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded"
              dir="ltr"
            >
              {rule.code}
            </code>
            <StatusBadge status={rule.status} />
          </div>
          <div className="text-xs text-ink-600 mt-0.5 truncate">{rule.oneLiner}</div>
        </div>

        {/* Chevron */}
        <ChevronDown
          size={16}
          className={`text-ink-400 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-5 pt-1 bg-ink-50/40 border-t border-ink-100">
          <RuleDetail rule={rule} />
        </div>
      )}
    </li>
  );
}

/* ---------------- expanded detail ---------------- */

function RuleDetail({ rule }: { rule: AccountingRule }) {
  return (
    <div className="space-y-4 pt-3">
      <p className="text-sm text-ink-700 leading-relaxed">{rule.description}</p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left column: trigger, structure, rules */}
        <div className="space-y-4">
          <DetailBlock icon={Zap} title="מתי האוטומציה רצה">
            <ul className="space-y-1 text-xs text-ink-700">
              {rule.triggers.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent-500 mt-0.5">▪</span>
                  <span dir="auto">{t}</span>
                </li>
              ))}
            </ul>
          </DetailBlock>

          <DetailBlock icon={FileCode2} title="מה האוטומציה בונה">
            <p className="text-xs text-ink-700 leading-relaxed">{rule.jeStructure}</p>
          </DetailBlock>

          <DetailBlock icon={Lightbulb} title="חוקים שמופעלים">
            <ul className="space-y-1 text-xs text-ink-700">
              {rule.rules.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-0.5">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </DetailBlock>

          {rule.perCompanyOverrides && rule.perCompanyOverrides.length > 0 && (
            <DetailBlock icon={Settings2} title="ניתן לשינוי פר-חברה">
              <ul className="space-y-1 text-xs text-ink-700">
                {rule.perCompanyOverrides.map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">⚙</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}
        </div>

        {/* Right column: example */}
        <div>
          <DetailBlock icon={BookOpen} title="דוגמה מספרית" tone="accent">
            <Example example={rule.example} />
          </DetailBlock>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  title,
  children,
  tone,
}: {
  icon: typeof Zap;
  title: string;
  children: React.ReactNode;
  tone?: 'accent';
}) {
  const wrapClass =
    tone === 'accent'
      ? 'bg-white border border-accent-200/60 rounded-lg p-3'
      : 'bg-white border border-ink-200 rounded-lg p-3';
  return (
    <div className={wrapClass}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
        <Icon size={12} />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Example({ example }: { example: ExampleSpec }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-ink-700">{example.description}</div>

      <div className="bg-ink-50 border border-ink-100 rounded p-2.5 text-xs">
        <div className="text-[10px] text-ink-500 uppercase tracking-wider mb-1">
          החשבונית
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {example.invoice.number && (
            <KV label="מס׳" value={example.invoice.number} ltr />
          )}
          {example.invoice.supplier && (
            <KV label="ספק" value={example.invoice.supplier} />
          )}
          <KV label="ביניים" value={`${example.invoice.subtotal.toFixed(2)} ₪`} />
          <KV label="סך הכול" value={`${example.invoice.total.toFixed(2)} ₪`} />
          {example.invoice.extras &&
            Object.entries(example.invoice.extras).map(([k, v]) => (
              <KV key={k} label={k} value={String(v)} />
            ))}
        </div>
      </div>

      <div className="border border-ink-100 rounded overflow-hidden">
        <div className="text-[10px] text-ink-500 uppercase tracking-wider px-2.5 py-1.5 bg-ink-50/60 border-b border-ink-100">
          פקודת היומן
        </div>
        <table className="w-full text-xs">
          <thead className="text-ink-500 bg-white">
            <tr className="border-b border-ink-100">
              <th className="text-right px-2.5 py-1 font-medium">חשבון</th>
              <th className="text-right px-2.5 py-1 font-medium">חובה</th>
              <th className="text-right px-2.5 py-1 font-medium">זכות</th>
              <th className="text-right px-2.5 py-1 font-medium">תיאור</th>
            </tr>
          </thead>
          <tbody>
            {example.je.map((line, i) => (
              <tr key={i} className="border-b border-ink-100 last:border-0">
                <td className="px-2.5 py-1 font-mono text-ink-900" dir="ltr">
                  {line.account}
                </td>
                <td className="px-2.5 py-1 tabular-nums">
                  {line.side === 'DR' ? line.amount : '—'}
                </td>
                <td className="px-2.5 py-1 tabular-nums">
                  {line.side === 'CR' ? line.amount : '—'}
                </td>
                <td className="px-2.5 py-1 text-ink-600">{line.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {example.notes && example.notes.length > 0 && (
        <ul className="text-[11px] text-ink-600 space-y-0.5">
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
    <div className="flex items-baseline gap-1.5">
      <span className="text-ink-500">{label}:</span>
      <span className="text-ink-900 font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

/* ---------------- status helpers ---------------- */

function statusTone(status: RuleStatus): {
  barBg: string;
  iconBg: string;
  iconText: string;
} {
  switch (status) {
    case 'auto':
      return {
        barBg: 'bg-emerald-400',
        iconBg: 'bg-emerald-50',
        iconText: 'text-emerald-700',
      };
    case 'auto-with-warning':
      return {
        barBg: 'bg-amber-400',
        iconBg: 'bg-amber-50',
        iconText: 'text-amber-700',
      };
    case 'manual':
      return {
        barBg: 'bg-blue-400',
        iconBg: 'bg-blue-50',
        iconText: 'text-blue-700',
      };
    case 'coming-soon':
      return {
        barBg: 'bg-purple-300',
        iconBg: 'bg-purple-50',
        iconText: 'text-purple-700',
      };
  }
}

function StatusBadge({ status }: { status: RuleStatus }) {
  const map: Record<RuleStatus, { bg: string; text: string; label: string }> = {
    auto: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'אוטומטי' },
    'auto-with-warning': {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      label: 'אזהרה',
    },
    manual: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'ידני' },
    'coming-soon': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'בקרוב' },
  };
  const c = map[status];
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}
