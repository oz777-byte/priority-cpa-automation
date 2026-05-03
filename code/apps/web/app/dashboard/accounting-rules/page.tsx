'use client';

import { useMemo, useState } from 'react';
import {
  Brain,
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
  Target,
  Layers,
  TrendingUp,
} from 'lucide-react';
import {
  RULES,
  CATEGORY_LABELS,
  type AccountingRule,
  type RuleStatus,
  type RuleCategory,
  type ExampleSpec,
} from './rules-data';
import { RuleNoteForm } from './note-form';

type FilterKey = 'all' | RuleStatus;

const CATEGORY_META: Record<
  RuleCategory,
  { label: string; emoji: string; tone: string; description: string }
> = {
  supplier: {
    label: CATEGORY_LABELS.supplier,
    emoji: '🧾',
    tone: 'from-blue-500/10 to-blue-500/5 border-blue-200',
    description: 'חשבוניות נכנסות מספקים — 17 תרחישים מסוגי החשבונית הנפוצים',
  },
  customer: {
    label: CATEGORY_LABELS.customer,
    emoji: '💼',
    tone: 'from-emerald-500/10 to-emerald-500/5 border-emerald-200',
    description: 'חשבוניות יוצאות ללקוחות — מסחרי, מזומן, ייצוא, חוב אבוד',
  },
  bank: {
    label: CATEGORY_LABELS.bank,
    emoji: '🏦',
    tone: 'from-purple-500/10 to-purple-500/5 border-purple-200',
    description: 'תנועות בנק ומזומן — עמלות, ריביות, העברות, צ\'קים שחזרו',
  },
  payroll: {
    label: CATEGORY_LABELS.payroll,
    emoji: '👥',
    tone: 'from-pink-500/10 to-pink-500/5 border-pink-200',
    description: 'תלושי שכר חודשיים — ברוטו, ניכויים, הפרשות מעביד, נטו',
  },
  assets: {
    label: CATEGORY_LABELS.assets,
    emoji: '🚚',
    tone: 'from-amber-500/10 to-amber-500/5 border-amber-200',
    description: 'נכסי קבע — קפיטליזציה, פחת חודשי קו ישר, מכירה / הסרה',
  },
  inventory: {
    label: CATEGORY_LABELS.inventory,
    emoji: '📦',
    tone: 'from-cyan-500/10 to-cyan-500/5 border-cyan-200',
    description: 'ניהול מלאי לעסקי מסחר — רכישות, COGS, ספירת מלאי',
  },
  period: {
    label: CATEGORY_LABELS.period,
    emoji: '📅',
    tone: 'from-indigo-500/10 to-indigo-500/5 border-indigo-200',
    description: 'התאמות סוף חודש ודיווחים רגולטוריים — PCN874, accrual, FX',
  },
  'year-end': {
    label: CATEGORY_LABELS['year-end'],
    emoji: '🗓️',
    tone: 'from-rose-500/10 to-rose-500/5 border-rose-200',
    description: 'סגירת שנת מס — סגירת הכנסות, הוצאות, מע"מ והעברת רווחים',
  },
};

const CATEGORY_ORDER: RuleCategory[] = [
  'supplier',
  'customer',
  'bank',
  'payroll',
  'assets',
  'period',
  'inventory',
  'year-end',
];

export default function AccountingRulesPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | null>(null);
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

  const activeCount = counts.auto + counts['auto-with-warning'];
  const coveragePercent = Math.round((activeCount / counts.all) * 100);

  const categoryCounts = useMemo(() => {
    const map: Record<string, { total: number; active: number }> = {};
    for (const r of RULES) {
      const k = r.category;
      if (!map[k]) map[k] = { total: 0, active: 0 };
      map[k].total += 1;
      if (r.status === 'auto' || r.status === 'auto-with-warning') {
        map[k].active += 1;
      }
    }
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RULES.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.oneLiner.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [query, filter, categoryFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* HERO — System brain dashboard */}
      <section className="relative overflow-hidden bg-gradient-to-br from-accent-600 via-brand-600 to-brand-700 rounded-2xl p-8 text-white shadow-xl">
        <div className="absolute top-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
              <Brain size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">המוח החשבונאי של המערכת</h1>
              <p className="text-white/80 text-sm mt-1.5 leading-relaxed max-w-2xl">
                כל אוטומציה חשבונאית במערכת היא חוק שבונה פקודת יומן (JE) לסוג ספציפי של חשבונית, תנועה או תרחיש.
                {' '}המוח מזהה את התרחיש אוטומטית מתוך הנתונים, בונה את ה-JE לפי חוקי המס והחשבונאות הישראליים, ומאפשר לרו"ח לאשר או לחרוג.
              </p>
            </div>
          </div>

          {/* Big metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <HeroStat
              icon={Target}
              label="חוקים בסך הכול"
              value={counts.all.toString()}
              hint="ליבת המוח"
            />
            <HeroStat
              icon={CheckCircle2}
              label="פעילים בייצור"
              value={activeCount.toString()}
              hint={`${coveragePercent}% כיסוי`}
              accent="emerald"
            />
            <HeroStat
              icon={Layers}
              label="קטגוריות"
              value="8"
              hint="מסחר · שירות · משכורות"
            />
            <HeroStat
              icon={TrendingUp}
              label="בקרוב"
              value={counts['coming-soon'].toString()}
              hint="ב-roadmap"
              accent="amber"
            />
          </div>
        </div>
      </section>

      {/* Coverage breakdown by status */}
      <section className="bg-white border border-ink-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-ink-900 flex items-center gap-2">
            <Sparkles size={14} className="text-accent-500" />
            מצב כיסוי
          </h2>
          <span className="text-xs text-ink-500 tabular-nums">{counts.all} חוקים סה״כ</span>
        </div>
        <div className="h-3 bg-ink-100 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${(counts.auto / counts.all) * 100}%` }}
            title={`אוטומטי: ${counts.auto}`}
          />
          <div
            className="bg-amber-500 h-full transition-all"
            style={{ width: `${(counts['auto-with-warning'] / counts.all) * 100}%` }}
            title={`עם אזהרות: ${counts['auto-with-warning']}`}
          />
          <div
            className="bg-purple-300 h-full transition-all"
            style={{ width: `${(counts['coming-soon'] / counts.all) * 100}%` }}
            title={`בקרוב: ${counts['coming-soon']}`}
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-ink-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            אוטומטי <strong className="tabular-nums">{counts.auto}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            אוטומטי עם אזהרות <strong className="tabular-nums">{counts['auto-with-warning']}</strong>
          </span>
          {counts.manual > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              ידני <strong className="tabular-nums">{counts.manual}</strong>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-300"></span>
            בקרוב <strong className="tabular-nums">{counts['coming-soon']}</strong>
          </span>
        </div>
      </section>

      {/* Category overview cards */}
      <section>
        <h2 className="text-sm font-bold text-ink-900 mb-3 flex items-center gap-2">
          <Layers size={14} className="text-accent-500" />
          קטגוריות
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORY_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat];
            const stats = categoryCounts[cat] ?? { total: 0, active: 0 };
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(isActive ? null : cat)}
                className={`relative bg-gradient-to-br ${meta.tone} border rounded-xl p-3 text-right transition-all hover:scale-[1.02] hover:shadow-md ${
                  isActive ? 'ring-2 ring-accent-500 shadow-md' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div className="text-left">
                    <div className="text-xl font-bold text-ink-900 tabular-nums leading-none">
                      {stats.total}
                    </div>
                    <div className="text-[10px] text-ink-500 mt-0.5">
                      {stats.active} פעילים
                    </div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-ink-900 leading-tight">
                  {meta.label}
                </div>
                <div className="text-[11px] text-ink-600 mt-1 leading-relaxed line-clamp-2">
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>
        {categoryFilter && (
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className="mt-3 text-xs text-accent-600 hover:underline flex items-center gap-1"
          >
            ✕ נקה סינון קטגוריה ({CATEGORY_META[categoryFilter].label})
          </button>
        )}
      </section>

      {/* Toolbar: search + filters */}
      <section className="bg-white border border-ink-200 rounded-xl p-3 sticky top-2 z-20 shadow-sm">
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
              placeholder="חיפוש לפי שם / קוד / תיאור / תרחיש..."
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
      </section>

      {/* Compact info banners */}
      {!query && !categoryFilter && filter === 'all' && (
        <section className="grid sm:grid-cols-2 gap-3">
          <InfoBanner
            icon={Settings2}
            title="שתי שכבות"
            body={
              <>
                <strong>אוניברסלי</strong> (חוק): מע"מ, רף הקצאה, ניכוי מעורב, חוק 6 חודשים.
                {' '}
                <strong>פר-חברה</strong>: חשבונות, מרכזי עלות, סוג עוסק.
              </>
            }
          />
          <InfoBanner
            icon={FileCode2}
            title="פורמט ייצוא MOVEIN"
            body={
              <>
                <strong>180</strong> סטנדרטי (CP1255), <strong>FLEXIBLE</strong> אוטומטי כשנדרש מרכז עלות, הקצאה ארוכה, או יותר מ-4 שורות.
              </>
            }
          />
        </section>
      )}

      {/* Rules grouped by category */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-ink-500 text-sm">
          לא נמצאו חוקים תואמים את החיפוש.
        </div>
      ) : (
        <div className="space-y-6">
          {groupByCategory(filtered).map(([category, rules]) => {
            const meta = CATEGORY_META[category];
            return (
              <section key={category}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                    <span className="text-lg">{meta.emoji}</span>
                    {meta.label}
                    <span className="text-[10px] font-medium text-ink-500 tabular-nums bg-ink-100 px-1.5 py-0.5 rounded">
                      {rules.length}
                    </span>
                  </h2>
                </div>
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
            );
          })}
        </div>
      )}

      <div className="text-xs text-ink-400 text-center mt-6 pb-8">
        מציג {filtered.length} מתוך {RULES.length} חוקים
      </div>
    </div>
  );
}

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

function HeroStat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint: string;
  accent?: 'emerald' | 'amber';
}) {
  const accentRing =
    accent === 'emerald'
      ? 'ring-emerald-300/40'
      : accent === 'amber'
        ? 'ring-amber-300/40'
        : 'ring-white/20';
  return (
    <div className={`bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 ring-1 ${accentRing}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70 mb-2">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-white/70 mt-1">{hint}</div>
    </div>
  );
}

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
        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50/60 transition text-right ${
          isOpen ? 'bg-accent-50/40' : ''
        }`}
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
            <span
              className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 bg-accent-50 text-accent-700 border border-accent-100 rounded"
              dir="ltr"
            >
              #{rule.id}
            </span>
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
          <DetailBlock icon={Brain} title="דוגמה מספרית" tone="accent">
            <Example example={rule.example} />
          </DetailBlock>
        </div>
      </div>

      {/* Improvement note submission */}
      <div className="pt-2 border-t border-ink-100">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="text-[11px] text-ink-500 leading-relaxed">
            רואה משהו שאפשר לשפר בחוק זה? שלח הערה — היא תגיע לעוז ותטופל אישית.
          </div>
          <RuleNoteForm
            ruleId={rule.id}
            ruleCode={rule.code}
            ruleTitle={rule.title}
          />
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
