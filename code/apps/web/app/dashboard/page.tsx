import Link from 'next/link';
import {
  Inbox,
  FileEdit,
  Download,
  Building2,
  ArrowLeft,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import {
  getCurrentCompany,
  listCompaniesForUser,
} from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { WorkflowSteps } from '@/components/workflow-steps';

export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const me = await requireUser();
  const companies = await listCompaniesForUser(me.id, me.email);
  const company = await getCurrentCompany(me.id, me.email);

  // First-run state — no companies
  if (companies.length === 0) {
    return <FirstRun />;
  }

  // Counts for current company
  const admin = getAdminClient();
  const companyId = company?.id ?? companies[0]?.id ?? '';
  const [pending, drafts, batches] = await Promise.all([
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
      .from('movein_batches')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  const hasInvoices = (pending.count ?? 0) > 0 || (drafts.count ?? 0) > 0;
  const hasJEs = (drafts.count ?? 0) > 0;
  const hasBatch = (batches.count ?? 0) > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">
          {company?.name ?? 'בחר חברה'}
        </h1>
        <p className="text-ink-600 mt-1 text-sm">
          סקירה של החברה הנבחרת. החלף חברה דרך התפריט בראש הדף.
        </p>
      </header>

      <WorkflowSteps
        hasCompany={true}
        hasInvoices={hasInvoices}
        hasJEs={hasJEs}
        hasBatch={hasBatch}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI
          icon={Inbox}
          tone="blue"
          title="חשבוניות בתור"
          value={pending.count ?? 0}
          hint="ממתינות לעיבוד"
          href="/dashboard/invoices"
        />
        <KPI
          icon={FileEdit}
          tone="amber"
          title="פקודות יומן בעריכה"
          value={drafts.count ?? 0}
          hint="ניתנות לעריכה לפני ייצוא"
          href="/dashboard/journal-entries"
        />
        <KPI
          icon={Download}
          tone="green"
          title="קבצי MOVEIN שהופקו"
          value={batches.count ?? 0}
          hint="לכל הזמן"
          href="/dashboard/journal-entries"
        />
      </div>
    </div>
  );
}

function FirstRun() {
  return (
    <div className="max-w-3xl mx-auto bg-white border border-ink-200 rounded-2xl overflow-hidden">
      <div className="bg-brand-radial text-white p-10 text-center">
        <Building2 size={40} className="mx-auto mb-3 text-brand-glow" />
        <h1 className="text-3xl font-bold mb-2">ברוך הבא!</h1>
        <p className="text-white/70 leading-relaxed max-w-xl mx-auto">
          המערכת מוכנה לעבודה. הצעד הראשון: להוסיף את החברה הראשונה שאתה
          מטפל בה — שם, מס׳ עוסק, וחשבונות חשבונאיים בסיסיים.
        </p>
      </div>
      <div className="p-6 text-center">
        <Link
          href="/dashboard/companies"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent-600 text-white rounded-lg font-semibold hover:bg-accent-500 transition"
        >
          הוסף חברה ראשונה
          <ArrowLeft size={16} />
        </Link>
        <p className="mt-4 text-xs text-ink-400">
          בעתיד, אחרי הוספת חברה — תוכל להעלות חשבוניות, לראות פקודות יומן
          אוטומטיות, ולהפיק קובץ לפריוריטי.
        </p>
      </div>
    </div>
  );
}

function KPI({
  icon: Icon,
  tone,
  title,
  value,
  hint,
  href,
}: {
  icon: typeof Inbox;
  tone: 'blue' | 'amber' | 'green';
  title: string;
  value: number;
  hint: string;
  href: string;
}) {
  const palette = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <Link
      href={href}
      className="bg-white border border-ink-200 rounded-xl p-5 hover:border-ink-400 transition group"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-ink-600">{title}</div>
          <div className="mt-2 text-3xl font-bold text-ink-900 tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-ink-400">{hint}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${palette}`}>
          <Icon size={18} />
        </div>
      </div>
    </Link>
  );
}
