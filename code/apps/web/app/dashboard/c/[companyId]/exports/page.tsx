import { History, Download } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface BatchRow {
  id: string;
  batch_number: string | null;
  exported_at: string | null;
  priority_load_status: string;
  scenario_breakdown: Record<string, unknown> | null;
}

export default async function ExportsHistoryPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const admin = getAdminClient();
  const { data: batches } = await admin
    .from('movein_batches')
    .select('id, batch_number, exported_at, priority_load_status, scenario_breakdown')
    .eq('company_id', company.id)
    .order('exported_at', { ascending: false })
    .limit(100);

  const rows = (batches ?? []) as BatchRow[];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <History size={18} className="text-brand-500" />
          היסטוריית ייצוא
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          כל קובצי MOVEIN.DAT שהופקו עבור {company.name}, בסדר כרונולוגי הפוך.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-8 text-center">
          <Download size={24} className="mx-auto text-ink-400 mb-2" />
          <div className="text-sm text-ink-600">לא הופקו קבצים עדיין.</div>
        </div>
      ) : (
        <div className="border border-ink-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 border-b border-ink-200">
              <tr>
                <th className="text-right p-3 font-medium">מס׳ אצווה</th>
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">רשומות</th>
                <th className="text-right p-3 font-medium">סטטוס בפריוריטי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const recordCount =
                  ((b.scenario_breakdown as { records?: number } | null)?.records) ?? 0;
                return (
                  <tr key={b.id} className="border-b border-ink-100 last:border-0">
                    <td className="p-3 font-mono text-ink-900" dir="ltr">
                      {b.batch_number ?? b.id.slice(0, 8)}
                    </td>
                    <td className="p-3 text-ink-700" dir="ltr">
                      {b.exported_at?.slice(0, 16).replace('T', ' ') ?? '—'}
                    </td>
                    <td className="p-3 text-ink-900 tabular-nums">{recordCount}</td>
                    <td className="p-3">
                      <StatusPill status={b.priority_load_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-ink-400">
        כל אצווה נשמרת ב-audit log עם כל ה-JE-ים שנכללו בה. הקובץ עצמו לא נשמר —
        אם צריך להוריד שוב, אפשר להפיק אצווה חדשה מ-JE-ים שלא יוצאו.
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'ממתין' },
    loaded: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'נטען' },
    transferred_to_journal: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'הועבר ליומן' },
    error: { bg: 'bg-red-100', text: 'text-red-800', label: 'שגיאה' },
  };
  const c = config[status] ?? config.pending!;
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
