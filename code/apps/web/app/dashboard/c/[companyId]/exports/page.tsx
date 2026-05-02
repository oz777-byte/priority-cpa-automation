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
          כל קובצי MOVEIN שהופקו עבור {company.name}, בסדר כרונולוגי הפוך.
          לחץ "הורד" כדי להפיק את הקובץ מחדש מאותם JE-ים.
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
                <th className="text-right p-3 font-medium">פורמט</th>
                <th className="text-right p-3 font-medium">סטטוס בפריוריטי</th>
                <th className="text-right p-3 font-medium">הורדה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const breakdown = (b.scenario_breakdown ?? {}) as {
                  records?: number;
                  format?: string;
                };
                const recordCount = breakdown.records ?? 0;
                const format = (breakdown.format ?? '180') as '180' | 'flexible';
                const downloadUrl = `/api/movein?companyId=${company.id}&batch=${b.id}`;
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
                      <FormatPill format={format} />
                    </td>
                    <td className="p-3">
                      <StatusPill status={b.priority_load_status} />
                    </td>
                    <td className="p-3">
                      <a
                        href={downloadUrl}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 text-white rounded-md text-xs font-medium hover:bg-accent-500"
                      >
                        <Download size={13} />
                        הורד
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-ink-400 leading-relaxed">
        ההורדה מפיקה מחדש את הקובץ מה-JE-ים השמורים — הקבצים עצמם לא נשמרים על
        השרת. כל פעולה נרשמת ב-audit log.
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

function FormatPill({ format }: { format: '180' | 'flexible' }) {
  const c =
    format === 'flexible'
      ? { bg: 'bg-purple-100', text: 'text-purple-800', label: 'FLEXIBLE' }
      : { bg: 'bg-ink-100', text: 'text-ink-700', label: '180' };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium font-mono ${c.bg} ${c.text}`}
      dir="ltr"
    >
      {c.label}
    </span>
  );
}
