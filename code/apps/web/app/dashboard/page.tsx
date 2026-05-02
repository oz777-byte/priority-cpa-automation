import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  Inbox,
  FileEdit,
  Download,
  ArrowLeft,
  Plus,
  Activity,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listCompaniesForUser, type CompanyRow } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectCompanyAction } from './companies/actions';

export const dynamic = 'force-dynamic';

interface CompanyStats {
  pending: number;
  drafts: number;
  exported: number;
  batches: number;
  lastActivity: string | null;
}

async function getCompanyStats(companyId: string): Promise<CompanyStats> {
  const admin = getAdminClient();
  const [pending, drafts, exported, batches, lastJe] = await Promise.all([
    admin
      .from('invoices_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['received', 'processing', 'classified', 'queued']),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('status', 'exported'),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'exported'),
    admin
      .from('movein_batches')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId),
    admin
      .from('journal_entries')
      .select('updated_at')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pending: pending.count ?? 0,
    drafts: drafts.count ?? 0,
    exported: exported.count ?? 0,
    batches: batches.count ?? 0,
    lastActivity: (lastJe.data?.updated_at as string | null) ?? null,
  };
}

async function selectAndGo(formData: FormData) {
  'use server';
  const id = formData.get('companyId');
  if (typeof id !== 'string') return;
  await selectCompanyAction(id);
  redirect(`/dashboard/c/${id}`);
}

export default async function DashboardHomePage() {
  const me = await requireUser();
  const companies = await listCompaniesForUser(me.id, me.email);

  if (companies.length === 0) {
    return <FirstRun />;
  }

  // Stats per company in parallel
  const statsList = await Promise.all(
    companies.map(async (c) => ({
      company: c,
      stats: await getCompanyStats(c.id),
    })),
  );

  // Aggregate across all companies
  const totals = statsList.reduce(
    (acc, item) => ({
      pending: acc.pending + item.stats.pending,
      drafts: acc.drafts + item.stats.drafts,
      exported: acc.exported + item.stats.exported,
      batches: acc.batches + item.stats.batches,
    }),
    { pending: 0, drafts: 0, exported: 0, batches: 0 },
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Header companyCount={companies.length} firstName={me.email.split('@')[0] ?? ''} />

      <section>
        <SectionTitle title="סיכום פעילות" subtitle="סך כל החברות שלך" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Stat icon={Inbox} tone="blue" label="חשבוניות ממתינות" value={totals.pending} />
          <Stat icon={FileEdit} tone="amber" label="פקודות יומן בעריכה" value={totals.drafts} />
          <Stat icon={Activity} tone="emerald" label="פקודות שיוצאו" value={totals.exported} />
          <Stat icon={Download} tone="purple" label="קבצי MOVEIN" value={totals.batches} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="החברות שלך" subtitle={`${companies.length} חברות פעילות`} />
          <Link
            href="/dashboard/companies"
            className="flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
          >
            <Plus size={14} />
            הוסף חברה
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {statsList.map(({ company, stats }) => (
            <CompanyCard
              key={company.id}
              company={company}
              stats={stats}
              selectAndGo={selectAndGo}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Header({ companyCount, firstName }: { companyCount: number; firstName: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">
        שלום, <span className="capitalize">{firstName}</span>
      </h1>
      <p className="text-ink-600 mt-1 text-sm">
        אתה מנהל {companyCount} {companyCount === 1 ? 'חברה' : 'חברות'}.
        בחר חברה לעבודה עליה, או הוסף חדשה.
      </p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      {subtitle && <p className="text-xs text-ink-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Inbox;
  tone: 'blue' | 'amber' | 'emerald' | 'purple';
  label: string;
  value: number;
}) {
  const palette = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
  }[tone];
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${palette}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink-900 tabular-nums leading-tight">
          {value}
        </div>
        <div className="text-xs text-ink-600">{label}</div>
      </div>
    </div>
  );
}

function CompanyCard({
  company,
  stats,
  selectAndGo,
}: {
  company: CompanyRow;
  stats: CompanyStats;
  selectAndGo: (formData: FormData) => void;
}) {
  const lastActivity = stats.lastActivity
    ? formatRelative(stats.lastActivity)
    : 'אין פעילות עדיין';
  const totalActive = stats.pending + stats.drafts;

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5 hover:border-accent-500/60 hover:shadow-sm transition group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink-900 truncate">{company.name}</div>
            <div className="text-xs text-ink-400" dir="ltr">ע.מ {company.tax_id}</div>
          </div>
        </div>
        <StatusBadge status={company.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <MiniStat label="חשבוניות" value={stats.pending} />
        <MiniStat label="JE לעריכה" value={stats.drafts} highlight={stats.drafts > 0} />
        <MiniStat label="קבצים" value={stats.batches} />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-ink-100">
        <div className="text-xs text-ink-400">פעילות אחרונה: {lastActivity}</div>
        <form action={selectAndGo}>
          <input type="hidden" name="companyId" value={company.id} />
          <button
            type="submit"
            className="flex items-center gap-1 text-sm text-accent-600 group-hover:text-accent-500 font-medium"
          >
            {totalActive > 0 ? `פתח (${totalActive} פעולות)` : 'פתח'}
            <ArrowLeft size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg py-2 ${highlight ? 'bg-amber-50' : 'bg-ink-50'}`}>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? 'text-amber-700' : 'text-ink-900'}`}>
        {value}
      </div>
      <div className="text-[10px] text-ink-600">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'פעיל' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'מושהה' },
    archived: { bg: 'bg-ink-100', text: 'text-ink-600', label: 'ארכיון' },
  };
  const c = config[status] ?? config.active!;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded ${c.bg} ${c.text} font-medium flex-shrink-0`}>
      {c.label}
    </span>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'הרגע';
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ימים`;
  return iso.slice(0, 10);
}

function FirstRun() {
  return (
    <div className="max-w-3xl mx-auto bg-white border border-ink-200 rounded-2xl overflow-hidden">
      <div className="bg-brand-radial text-white p-10 text-center">
        <Building2 size={40} className="mx-auto mb-3 text-brand-glow" />
        <h1 className="text-3xl font-bold mb-2">ברוך הבא</h1>
        <p className="text-white/70 leading-relaxed max-w-xl mx-auto">
          המערכת מוכנה לעבודה. הצעד הראשון: הוספת חברה (לקוח) ראשונה — שם,
          מס׳ עוסק, וחשבונות חשבונאיים בסיסיים.
        </p>
      </div>
      <div className="p-8 text-center space-y-4">
        <Link
          href="/dashboard/companies"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent-600 text-white rounded-lg font-semibold hover:bg-accent-500 transition"
        >
          הוסף חברה ראשונה
          <ArrowLeft size={16} />
        </Link>
        <p className="text-xs text-ink-400 max-w-md mx-auto">
          לאחר הוספת חברה, תוכל לטעון חשבוניות, לראות פקודות יומן אוטומטיות,
          לערוך אותן ולהפיק קובץ MOVEIN.DAT לפריוריטי.
        </p>
        <Link
          href="/dashboard/help"
          className="inline-block text-sm text-accent-600 hover:underline"
        >
          צפה במדריך הפעלה ⟵
        </Link>
      </div>
    </div>
  );
}
