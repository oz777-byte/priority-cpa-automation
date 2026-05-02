import Link from 'next/link';
import {
  Inbox,
  FileEdit,
  Download,
  Activity,
  Building2,
  ArrowLeft,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function CompanyOverviewPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const [pending, drafts, exported, batches] = await Promise.all([
    admin.from('invoices_inbox').select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .in('status', ['received', 'processing', 'classified', 'queued']),
    admin.from('journal_entries').select('*', { count: 'exact', head: true })
      .eq('company_id', company.id).neq('status', 'exported'),
    admin.from('journal_entries').select('*', { count: 'exact', head: true })
      .eq('company_id', company.id).eq('status', 'exported'),
    admin.from('movein_batches').select('*', { count: 'exact', head: true })
      .eq('company_id', company.id),
  ]);

  const settings = (company.settings ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{company.name}</h1>
          <p className="text-sm text-ink-600 mt-0.5">סקירה ופעולות מהירות</p>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI icon={Inbox} tone="blue" label="חשבוניות בתור" value={pending.count ?? 0}
             href={`/dashboard/c/${company.id}/invoices`} />
        <KPI icon={FileEdit} tone="amber" label="JE לעריכה" value={drafts.count ?? 0}
             href={`/dashboard/c/${company.id}/journal-entries`} />
        <KPI icon={Activity} tone="emerald" label="JE שיוצאו" value={exported.count ?? 0}
             href={`/dashboard/c/${company.id}/journal-entries`} />
        <KPI icon={Download} tone="purple" label="קבצי MOVEIN" value={batches.count ?? 0}
             href={`/dashboard/c/${company.id}/journal-entries`} />
      </div>

      {/* Workflow next-step prompt */}
      <NextStepCard
        companyId={company.id}
        pending={pending.count ?? 0}
        drafts={drafts.count ?? 0}
      />

      {/* Company facts */}
      <section className="bg-ink-50/60 border border-ink-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Building2 size={14} />
          פרטי החברה
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Fact label="ע.מ" value={company.tax_id} dir="ltr" />
          <Fact label="גרסת פריוריטי" value={company.priority_version ?? '—'} dir="ltr" />
          <Fact label="חשבון הוצאה" value={settings.expense_account ?? '—'} dir="ltr" />
          <Fact label="חשבון מע&quot;מ" value={settings.vat_input_account ?? '—'} dir="ltr" />
        </dl>
      </section>
    </div>
  );
}

function KPI({
  icon: Icon, tone, label, value, href,
}: {
  icon: typeof Inbox;
  tone: 'blue' | 'amber' | 'emerald' | 'purple';
  label: string;
  value: number;
  href: string;
}) {
  const palette = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
  }[tone];
  return (
    <Link href={href} className="bg-white border border-ink-200 rounded-xl p-4 flex items-center gap-3 hover:border-ink-400 transition">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${palette}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink-900 tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-ink-600">{label}</div>
      </div>
    </Link>
  );
}

function NextStepCard({
  companyId, pending, drafts,
}: { companyId: string; pending: number; drafts: number }) {
  let title: string;
  let description: string;
  let action: string;
  let href: string;

  if (pending === 0 && drafts === 0) {
    title = 'אין חשבוניות בתור';
    description = 'כדי להתחיל, טען חשבוניות לדוגמה דרך עמוד הניהול של החברות, או המתן להעלאה אוטומטית (פיצ\'ר עתידי).';
    action = 'לעמוד החברות';
    href = '/dashboard/companies';
  } else if (drafts > 0) {
    title = `${drafts} פקודות יומן ממתינות לעריכה`;
    description = 'פתח את עורך ה-JE כדי לבדוק שורות, לערוך לפי הצורך, ולהפיק MOVEIN.DAT.';
    action = 'עבור לעורך פקודות יומן';
    href = `/dashboard/c/${companyId}/journal-entries`;
  } else {
    title = `${pending} חשבוניות חדשות`;
    description = 'יש חשבוניות שחיכה להן עיבוד. ה-JE-ים ייוצרו אוטומטית בכניסה הבאה לעורך.';
    action = 'עבור לעורך';
    href = `/dashboard/c/${companyId}/journal-entries`;
  }

  return (
    <div className="bg-brand-radial text-white rounded-xl p-6 flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold mb-1">{title}</div>
        <div className="text-sm text-white/70 max-w-xl">{description}</div>
      </div>
      <Link
        href={href}
        className="flex-shrink-0 px-5 py-2.5 bg-brand-500 text-brand-950 rounded-lg font-semibold text-sm hover:bg-brand-400 transition flex items-center gap-2"
      >
        {action}
        <ArrowLeft size={14} />
      </Link>
    </div>
  );
}

function Fact({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <div>
      <dt className="text-xs text-ink-600 mb-0.5">{label}</dt>
      <dd className="text-ink-900 font-medium" dir={dir}>{value}</dd>
    </div>
  );
}
