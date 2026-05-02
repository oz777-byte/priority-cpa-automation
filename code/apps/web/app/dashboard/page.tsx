import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  Inbox,
  FileEdit,
  Download,
  ArrowLeft,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listCompaniesForUser, type CompanyRow } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureUserFirm } from '@/lib/bootstrap';
import { selectCompanyAction } from './companies/actions';

export const dynamic = 'force-dynamic';

interface CompanyStats {
  pendingInvoices: number;
  draftJEs: number;
  blockedJEs: number;
  warningJEs: number;
  pendingBatches: number;
  exportedTotal: number;
  lastActivity: string | null;
}

interface CompanyWithStats {
  company: CompanyRow;
  stats: CompanyStats;
}

interface ActivityRow {
  id: string;
  ts: string;
  action: string;
  entity_type: string;
  entity_id: string;
  company_id: string | null;
  user_id: string | null;
  payload: Record<string, unknown>;
}

async function getCompanyStats(companyId: string): Promise<CompanyStats> {
  const admin = getAdminClient();
  const [
    pendingInvoices,
    draftJEs,
    blockedJEs,
    warningJEs,
    pendingBatches,
    exportedTotal,
    lastJe,
  ] = await Promise.all([
    admin
      .from('invoices_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['received', 'processing', 'classified', 'queued']),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['draft', 'validated', 'approved']),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('scenario', 'MISSING_ALLOCATION')
      .neq('status', 'exported'),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('status', 'exported')
      .not('validation_results', 'is', null),
    admin
      .from('movein_batches')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('priority_load_status', 'pending'),
    admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'exported'),
    admin
      .from('journal_entries')
      .select('updated_at')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pendingInvoices: pendingInvoices.count ?? 0,
    draftJEs: draftJEs.count ?? 0,
    blockedJEs: blockedJEs.count ?? 0,
    warningJEs: warningJEs.count ?? 0,
    pendingBatches: pendingBatches.count ?? 0,
    exportedTotal: exportedTotal.count ?? 0,
    lastActivity: (lastJe.data?.updated_at as string | null) ?? null,
  };
}

async function getRecentActivity(firmId: string): Promise<ActivityRow[]> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('audit_log')
    .select('id, ts, action, entity_type, entity_id, company_id, user_id, payload')
    .eq('firm_id', firmId)
    .order('ts', { ascending: false })
    .limit(12);
  return (data ?? []) as ActivityRow[];
}

async function selectAndGo(formData: FormData): Promise<void> {
  'use server';
  const id = formData.get('companyId');
  if (typeof id !== 'string') return;
  await selectCompanyAction(id);
  redirect(`/dashboard/c/${id}`);
}

export default async function DashboardHomePage() {
  const me = await requireUser();
  const firmId = await ensureUserFirm(me.id, me.email);
  const companies = await listCompaniesForUser(me.id, me.email);

  if (companies.length === 0) {
    return <FirstRun />;
  }

  const [statsList, activity] = await Promise.all([
    Promise.all(
      companies.map(async (c) => ({
        company: c,
        stats: await getCompanyStats(c.id),
      })),
    ),
    getRecentActivity(firmId),
  ]);

  const totals = statsList.reduce(
    (acc, item) => ({
      pendingInvoices: acc.pendingInvoices + item.stats.pendingInvoices,
      draftJEs: acc.draftJEs + item.stats.draftJEs,
      blockedJEs: acc.blockedJEs + item.stats.blockedJEs,
      warningJEs: acc.warningJEs + item.stats.warningJEs,
      pendingBatches: acc.pendingBatches + item.stats.pendingBatches,
      exportedTotal: acc.exportedTotal + item.stats.exportedTotal,
    }),
    {
      pendingInvoices: 0,
      draftJEs: 0,
      blockedJEs: 0,
      warningJEs: 0,
      pendingBatches: 0,
      exportedTotal: 0,
    },
  );

  // Companies sorted by recent activity, most-active first
  const sortedCompanies = [...statsList].sort((a, b) => {
    const av = a.stats.lastActivity ?? '';
    const bv = b.stats.lastActivity ?? '';
    return bv.localeCompare(av);
  });

  const totalQueueCount =
    totals.pendingInvoices +
    totals.draftJEs +
    totals.blockedJEs +
    totals.pendingBatches;

  return (
    <div className="max-w-6xl mx-auto space-y-7">
      <Header
        firstName={firstNameFrom(me.email)}
        companyCount={companies.length}
        queueCount={totalQueueCount}
        exportedTotal={totals.exportedTotal}
      />

      {/* Action queue */}
      <section>
        <SectionLabel
          title="מחכה לטיפול"
          subtitle="פעולות שנדרשת בהן החלטה או אישור"
        />
        <div className="bg-white border border-ink-200 rounded-xl divide-y divide-ink-100 overflow-hidden">
          {totals.blockedJEs > 0 && (
            <ActionRow
              tone="critical"
              icon={AlertCircle}
              title={`${totals.blockedJEs} פקודות יומן חסומות לייצוא`}
              hint='חסר מספר הקצאה (חוק 2024+) — חובה להוסיף לפני ייצוא'
              cta={firstCompanyWith(sortedCompanies, (s) => s.blockedJEs > 0, 'journal-entries')}
              ctaLabel="טפל עכשיו"
            />
          )}
          {totals.warningJEs > 0 && (
            <ActionRow
              tone="warning"
              icon={AlertTriangle}
              title={`${totals.warningJEs} פקודות יומן עם אזהרות`}
              hint='בדוק את האזהרות בעורך לפני אישור'
              cta={firstCompanyWith(sortedCompanies, (s) => s.warningJEs > 0, 'journal-entries')}
              ctaLabel="לעיון"
            />
          )}
          {totals.pendingInvoices > 0 && (
            <ActionRow
              tone="info"
              icon={Inbox}
              title={`${totals.pendingInvoices} חשבוניות חדשות בתור`}
              hint='חשבוניות שהתקבלו וטרם הוסבו לפקודות יומן'
              cta={firstCompanyWith(sortedCompanies, (s) => s.pendingInvoices > 0, 'invoices')}
              ctaLabel="פתח רשימה"
            />
          )}
          {totals.draftJEs > 0 && (
            <ActionRow
              tone="info"
              icon={FileEdit}
              title={`${totals.draftJEs} פקודות יומן בטיוטה`}
              hint='מוכנות לסקירה וייצוא MOVEIN'
              cta={firstCompanyWith(sortedCompanies, (s) => s.draftJEs > 0, 'journal-entries')}
              ctaLabel="פתח עורך"
            />
          )}
          {totals.pendingBatches > 0 && (
            <ActionRow
              tone="info"
              icon={Download}
              title={`${totals.pendingBatches} אצוות בהמתנה לטעינה לפריוריטי`}
              hint='קבצי MOVEIN שיוצאו אך טרם סומנו כנטענו'
              cta={firstCompanyWith(sortedCompanies, (s) => s.pendingBatches > 0, 'exports')}
              ctaLabel="היסטוריית ייצוא"
            />
          )}
          {totalQueueCount === 0 && <AllClear />}
        </div>
      </section>

      {/* Two-column lower area */}
      <div className="grid lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2">
          <SectionLabel title="פעילות אחרונה" subtitle="12 פעולות אחרונות במשרד" />
          <ActivityFeed rows={activity} companies={companies} userEmail={me.email} userId={me.id} />
        </section>

        <section>
          <SectionLabel
            title="חברות"
            subtitle={`${companies.length} פעילות`}
            action={
              <Link
                href="/dashboard/companies"
                className="text-xs text-accent-600 hover:underline flex items-center gap-1"
              >
                <Plus size={12} />
                חברה חדשה
              </Link>
            }
          />
          <div className="space-y-2">
            {sortedCompanies.map(({ company, stats }) => (
              <CompanyTile
                key={company.id}
                company={company}
                stats={stats}
                selectAndGo={selectAndGo}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ===================== building blocks ===================== */

function Header({
  firstName,
  companyCount,
  queueCount,
  exportedTotal,
}: {
  firstName: string;
  companyCount: number;
  queueCount: number;
  exportedTotal: number;
}) {
  const greeting = greetingForHour(new Date().getHours());
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">
          {greeting}, <span className="capitalize">{firstName}</span>
        </h1>
        <p className="text-sm text-ink-600 mt-1 flex items-center gap-3 flex-wrap">
          <span>
            {queueCount > 0 ? (
              <>
                <strong className="text-ink-900 tabular-nums">{queueCount}</strong>{' '}
                פעולות מחכות לטיפול
              </>
            ) : (
              'אין פעולות פתוחות'
            )}
          </span>
          <span className="text-ink-300">·</span>
          <span>
            <strong className="text-ink-900 tabular-nums">{companyCount}</strong>{' '}
            {companyCount === 1 ? 'חברה' : 'חברות'}
          </span>
          <span className="text-ink-300">·</span>
          <span>
            <strong className="text-ink-900 tabular-nums">{exportedTotal}</strong> JE
            יוצאו עד היום
          </span>
        </p>
      </div>
      <div className="text-xs text-ink-400" dir="ltr">
        {new Intl.DateTimeFormat('he-IL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(new Date())}
      </div>
    </div>
  );
}

function SectionLabel({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function ActionRow({
  tone,
  icon: Icon,
  title,
  hint,
  cta,
  ctaLabel,
}: {
  tone: 'critical' | 'warning' | 'info';
  icon: LucideIcon;
  title: string;
  hint: string;
  cta: string;
  ctaLabel: string;
}) {
  const palette = {
    critical: { iconBg: 'bg-red-50', iconText: 'text-red-700', bar: 'bg-red-500' },
    warning: { iconBg: 'bg-amber-50', iconText: 'text-amber-700', bar: 'bg-amber-400' },
    info: { iconBg: 'bg-blue-50', iconText: 'text-blue-700', bar: 'bg-blue-400' },
  }[tone];
  return (
    <Link
      href={cta}
      className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50/60 transition group"
    >
      <div className={`w-1 self-stretch rounded ${palette.bar}`} />
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${palette.iconBg} ${palette.iconText}`}
      >
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-900">{title}</div>
        <div className="text-xs text-ink-600 mt-0.5">{hint}</div>
      </div>
      <div className="flex items-center gap-1 text-xs text-accent-600 group-hover:text-accent-500 font-medium flex-shrink-0">
        {ctaLabel}
        <ArrowLeft size={12} />
      </div>
    </Link>
  );
}

function AllClear() {
  return (
    <div className="px-4 py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
        <CheckCircle2 size={18} />
      </div>
      <div className="text-sm font-medium text-ink-900">הכול תחת שליטה</div>
      <div className="text-xs text-ink-600 mt-0.5">
        אין פעולות פתוחות. ממתינים לחשבוניות חדשות או ייבוא של תקופה חדשה.
      </div>
    </div>
  );
}

function ActivityFeed({
  rows,
  companies,
  userEmail,
  userId,
}: {
  rows: ActivityRow[];
  companies: CompanyRow[];
  userEmail: string;
  userId: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-ink-200 rounded-xl p-6 text-center">
        <Activity size={20} className="mx-auto text-ink-300 mb-2" />
        <div className="text-sm text-ink-600">אין עדיין פעילות לתצוגה</div>
      </div>
    );
  }
  const companyById = new Map(companies.map((c) => [c.id, c]));
  return (
    <ul className="bg-white border border-ink-200 rounded-xl divide-y divide-ink-100 overflow-hidden">
      {rows.map((r) => (
        <ActivityItem
          key={r.id}
          row={r}
          company={r.company_id ? companyById.get(r.company_id) ?? null : null}
          isMe={r.user_id === userId}
          myEmail={userEmail}
        />
      ))}
    </ul>
  );
}

function ActivityItem({
  row,
  company,
  isMe,
  myEmail,
}: {
  row: ActivityRow;
  company: CompanyRow | null;
  isMe: boolean;
  myEmail: string;
}) {
  const meta = describeAction(row);
  const actor = isMe
    ? 'אני'
    : (row.payload.changed_by as string | undefined) ??
      (row.payload.created_by as string | undefined) ??
      (row.payload.exported_by as string | undefined) ??
      myEmail;
  return (
    <li className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-ink-50/40">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${meta.iconBg} ${meta.iconText}`}
      >
        <meta.icon size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-ink-800">
          <span className="text-ink-500" dir="ltr">
            {actor}
          </span>{' '}
          {meta.text}
          {company && (
            <span className="text-ink-500"> · {company.name}</span>
          )}
        </div>
      </div>
      <time
        className="text-xs text-ink-400 tabular-nums flex-shrink-0"
        dir="ltr"
        title={row.ts}
      >
        {formatRelative(row.ts)}
      </time>
    </li>
  );
}

function CompanyTile({
  company,
  stats,
  selectAndGo,
}: {
  company: CompanyRow;
  stats: CompanyStats;
  selectAndGo: (formData: FormData) => Promise<void>;
}) {
  const total = stats.draftJEs + stats.pendingInvoices + stats.blockedJEs;
  return (
    <form
      action={selectAndGo}
      className="bg-white border border-ink-200 rounded-lg hover:border-accent-500/50 hover:shadow-sm transition group"
    >
      <input type="hidden" name="companyId" value={company.id} />
      <button
        type="submit"
        className="w-full px-3 py-2.5 flex items-center gap-2.5 text-right"
      >
        <div className="w-8 h-8 rounded-md bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
          <Building2 size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-900 truncate">
            {company.name}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-2">
            {stats.blockedJEs > 0 && (
              <span className="text-red-600 font-medium">
                {stats.blockedJEs} חסומות
              </span>
            )}
            {total > 0 ? (
              <span className="tabular-nums">{total} בתור</span>
            ) : (
              <span className="text-emerald-600">נקי</span>
            )}
          </div>
        </div>
        <ArrowUpRight
          size={14}
          className="text-ink-300 group-hover:text-accent-500 flex-shrink-0"
        />
      </button>
    </form>
  );
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
          לערוך אותן ולהפיק קובץ MOVEIN לפריוריטי.
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

/* ===================== helpers ===================== */

function firstCompanyWith(
  list: CompanyWithStats[],
  pred: (s: CompanyStats) => boolean,
  tab: 'invoices' | 'journal-entries' | 'exports',
): string {
  const found = list.find((x) => pred(x.stats));
  return found ? `/dashboard/c/${found.company.id}/${tab}` : '/dashboard/companies';
}

function greetingForHour(h: number): string {
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

function firstNameFrom(email: string): string {
  return email.split('@')[0]?.split(/[._-]/)[0] ?? '';
}

function describeAction(row: ActivityRow): {
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  text: string;
} {
  const action = row.action;
  const ref =
    (row.payload.number as string | undefined) ??
    (row.payload.batch_number as string | undefined) ??
    row.entity_id.slice(0, 8);

  if (action === 'invoice.create')
    return {
      icon: Inbox,
      iconBg: 'bg-blue-50',
      iconText: 'text-blue-700',
      text: `הזין חשבונית ${ref}`,
    };
  if (action === 'je.create')
    return {
      icon: FileEdit,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-700',
      text: 'יצר פקודת יומן אוטומטית',
    };
  if (action === 'batch.export')
    return {
      icon: Download,
      iconBg: 'bg-purple-50',
      iconText: 'text-purple-700',
      text: `ייצא אצווה ${ref} (${row.payload.record_count ?? '?'} רשומות)`,
    };
  if (action === 'company.settings.update')
    return {
      icon: Activity,
      iconBg: 'bg-ink-100',
      iconText: 'text-ink-700',
      text: 'עידכן הגדרות חברה',
    };
  if (action === 'company.create')
    return {
      icon: Building2,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-700',
      text: `הוסיף חברה`,
    };
  return {
    icon: Activity,
    iconBg: 'bg-ink-100',
    iconText: 'text-ink-700',
    text: action,
  };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'הרגע';
  if (minutes < 60) return `${minutes} ד'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ש'`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ימים`;
  return iso.slice(0, 10);
}

