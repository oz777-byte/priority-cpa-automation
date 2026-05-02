import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  getCurrentCompany,
  listCompaniesForUser,
} from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const me = await requireUser();
  const companies = await listCompaniesForUser(me.id, me.email);
  const company = await getCurrentCompany(me.id, me.email);

  // First-run state — no companies
  if (companies.length === 0) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-ink-200 rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-ink-900">ברוך הבא ל-Priority CPA</h1>
        <p className="text-ink-600">
          כדי להתחיל לעבוד, צריך להוסיף את החברה הראשונה שאתה מטפל בה.
        </p>
        <Link
          href="/dashboard/companies"
          className="inline-block px-5 py-2.5 bg-accent-600 text-white rounded-lg"
        >
          הוסף חברה ראשונה
        </Link>
      </div>
    );
  }

  // Counts for current company
  const admin = getAdminClient();
  const companyId = company?.id ?? companies[0]?.id ?? '';
  const [
    pending,
    approved,
    batches,
  ] = await Promise.all([
    admin
      .from('invoices_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['received', 'processing', 'classified', 'queued']),
    admin
      .from('invoices_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'approved'),
    admin
      .from('movein_batches')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">
          {company?.name ?? 'בחר חברה'}
        </h1>
        <p className="text-ink-600 mt-1 text-sm">
          סקירה של החברה הנבחרת. החלף חברה דרך התפריט בראש הדף.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="חשבוניות בתור" value={pending.count ?? 0} hint="ממתינות לאישור" />
        <Card title="ממתינות לייצוא" value={approved.count ?? 0} hint="אושרו, טרם הופקו" />
        <Card title="קבצי MOVEIN" value={batches.count ?? 0} hint="הופקו עד כה" />
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">צעד הבא</h2>
        <p className="text-sm text-ink-600">
          {pending.count && pending.count > 0
            ? `יש לך ${pending.count} חשבוניות שממתינות לאישור.`
            : 'אין חשבוניות בתור. עבור ל"חברות" כדי לטעון חשבוניות לדוגמה, או המתן להעלאה אוטומטית.'}
        </p>
        <Link
          href="/dashboard/invoices"
          className="inline-block px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
        >
          לחשבוניות
        </Link>
      </div>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5">
      <div className="text-sm text-ink-600">{title}</div>
      <div className="mt-2 text-3xl font-bold text-ink-900">{value}</div>
      <div className="mt-1 text-xs text-ink-400">{hint}</div>
    </div>
  );
}
