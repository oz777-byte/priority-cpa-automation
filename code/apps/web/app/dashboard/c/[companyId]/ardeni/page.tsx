import { FileInput, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { ArdeniClient, JobDownload } from './ardeni-client';

export const dynamic = 'force-dynamic';

interface JobRow {
  id: string;
  original_filename: string | null;
  status: string;
  je_count: number | null;
  balance_ok: boolean | null;
  output_storage_path: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין',
  parsed: 'נותח',
  exported: 'יוצא',
  failed: 'נכשל',
};

export default async function ArdeniImportPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const admin = getAdminClient();
  const { data: jobs } = await admin
    .from('import_jobs')
    .select(
      'id, original_filename, status, je_count, balance_ok, output_storage_path, created_at',
    )
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (jobs ?? []) as JobRow[];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <FileInput size={18} className="text-brand-500" />
          ייבוא מבנה אחיד
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          המרת ייצוא מתוכנת הנהלת חשבונות אחרת (ארדני וכל תוכנה תואמת תקן) לקובץ
          MOVEIN של חשבשבת עבור {company.name}. העלה את הקובץ, אשר את התצוגה
          המקדימה, והורד את הקובץ לקליטה בחשבשבת ענן.
        </p>
      </div>

      <ArdeniClient companyId={company.id} />

      {/* History */}
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100">
          <h3 className="text-sm font-semibold text-ink-900">היסטוריית ייבוא</h3>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox size={24} className="mx-auto text-ink-300" />
            <p className="text-sm text-ink-600 mt-2">
              עוד לא בוצעו ייבואים עבור חברה זו.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 border-b border-ink-200">
              <tr>
                <th className="text-right p-3 font-medium">קובץ</th>
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">פקודות</th>
                <th className="text-right p-3 font-medium">סטטוס</th>
                <th className="text-right p-3 font-medium">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-b border-ink-100 last:border-0">
                  <td className="p-3 text-ink-800" dir="ltr">
                    {j.original_filename ?? '—'}
                  </td>
                  <td className="p-3 text-ink-600" dir="ltr">
                    {j.created_at.slice(0, 10)}
                  </td>
                  <td className="p-3 tabular-nums text-ink-900" dir="ltr">
                    {j.je_count ?? '—'}
                  </td>
                  <td className="p-3">
                    <StatusPill status={j.status} balanceOk={j.balance_ok} />
                  </td>
                  <td className="p-3">
                    {j.output_storage_path ? (
                      <JobDownload companyId={company.id} jobId={j.id} />
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  balanceOk,
}: {
  status: string;
  balanceOk: boolean | null;
}) {
  const label = STATUS_LABEL[status] ?? status;
  let tone = 'bg-blue-100 text-blue-800';
  if (status === 'exported') tone = 'bg-emerald-100 text-emerald-800';
  else if (status === 'failed' || balanceOk === false)
    tone = 'bg-red-100 text-red-800';
  else if (status === 'parsed') tone = 'bg-amber-100 text-amber-800';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tone}`}>
      {label}
    </span>
  );
}
