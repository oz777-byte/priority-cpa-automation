import { History, Download } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { ExportsTable, type BatchListRow, type LoadStatus, type ExportFormat } from './exports-table';

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

  const rows: BatchListRow[] = ((batches ?? []) as BatchRow[]).map((b) => {
    const breakdown = (b.scenario_breakdown ?? {}) as {
      records?: number;
      format?: string;
    };
    return {
      id: b.id,
      batchNumber: b.batch_number ?? b.id.slice(0, 8),
      exportedAt: b.exported_at ?? '',
      recordCount: breakdown.records ?? 0,
      format: (breakdown.format === 'flexible' ? 'flexible' : '180') as ExportFormat,
      loadStatus: (b.priority_load_status as LoadStatus) ?? 'pending',
    };
  });

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

      <ExportsTable
        rows={rows}
        companyId={company.id}
        empty={
          <div className="text-center py-4 space-y-2">
            <Download size={20} className="mx-auto text-ink-300" />
            <div className="text-sm text-ink-600">לא הופקו קבצים עדיין.</div>
          </div>
        }
      />

      <div className="text-xs text-ink-400 leading-relaxed">
        ההורדה מפיקה מחדש את הקובץ מה-JE-ים השמורים — הקבצים עצמם לא נשמרים על
        השרת. כל פעולה נרשמת ב-audit log.
      </div>
    </div>
  );
}
