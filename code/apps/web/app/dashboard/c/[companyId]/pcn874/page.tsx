import { FileText } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { Pcn874Panel, type ExportRow } from './pcn874-panel';

export const dynamic = 'force-dynamic';

interface DBExport {
  id: string;
  year: number;
  month: number;
  total_inputs_subtotal: number;
  total_inputs_vat: number;
  total_sales_subtotal: number;
  total_sales_vat: number;
  vat_to_pay: number;
  je_count: number;
  file_md5: string;
  file_byte_size: number;
  generated_at: string;
  period_locked_by_this: boolean;
  notes: string | null;
  is_correction: boolean;
  correction_of_id: string | null;
  correction_sequence: number;
  correction_reason: string | null;
}

interface DBPeriod {
  year: number;
  month: number;
  status: 'open' | 'locked' | 'closed';
}

export default async function Pcn874Page({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data: history } = await admin
    .from('pcn874_exports')
    .select(
      'id, year, month, total_inputs_subtotal, total_inputs_vat, ' +
        'total_sales_subtotal, total_sales_vat, vat_to_pay, je_count, ' +
        'file_md5, file_byte_size, generated_at, period_locked_by_this, notes, ' +
        'is_correction, correction_of_id, correction_sequence, correction_reason',
    )
    .eq('company_id', company.id)
    .order('generated_at', { ascending: false })
    .limit(50);

  const rows: ExportRow[] = ((history ?? []) as unknown as DBExport[]).map((e) => ({
    id: e.id,
    year: e.year,
    month: e.month,
    inputsSubtotal: Number(e.total_inputs_subtotal),
    inputsVat: Number(e.total_inputs_vat),
    salesSubtotal: Number(e.total_sales_subtotal),
    salesVat: Number(e.total_sales_vat),
    vatToPay: Number(e.vat_to_pay),
    jeCount: e.je_count,
    md5: e.file_md5,
    bytes: e.file_byte_size,
    generatedAt: e.generated_at,
    autoLocked: e.period_locked_by_this,
    isCorrection: e.is_correction,
    correctionSequence: e.correction_sequence,
    correctionReason: e.correction_reason,
  }));

  // Pull periods that have a 874 already + whether they're locked, so the panel
  // can offer "reopen for correction" only on locked periods that have a prior export.
  const { data: periodsRaw } = await admin
    .from('accounting_periods')
    .select('year, month, status')
    .eq('company_id', company.id);
  const periodLockedSet = new Set<string>();
  for (const p of (periodsRaw ?? []) as DBPeriod[]) {
    if (p.status === 'locked' || p.status === 'closed') {
      periodLockedSet.add(`${p.year}-${p.month}`);
    }
  }
  const correctableExports: ExportRow[] = rows.filter(
    (r) => periodLockedSet.has(`${r.year}-${r.month}`) && !r.isCorrection,
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <FileText size={18} className="text-brand-500" />
          דיווח PCN874 — מע"מ מקוון
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          ייצור קובץ הדיווח החודשי לרשות המסים. מאחדת את כל פקודות היומן בחודש
          הנבחר, מסכמת תשומות מול עסקאות, ומפיקה קובץ לפורמט הרשמי. ייצור הקובץ
          נועל אוטומטית את התקופה.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
        <strong>אזהרת אימות:</strong> הקובץ מבוסס על מבנה הרשומות הציבורי של
        רשות המסים. לפני הגשה ראשונה — אמת את הפלט מול המסמך הרשמי "מבנה קובץ
        דיווח מקוון 874" ובצע ריצת בדיקה במערכת שע"מ.
      </div>

      <Pcn874Panel
        companyId={company.id}
        history={rows}
        correctableExports={correctableExports}
        lockedPeriods={Array.from(periodLockedSet)}
      />
    </div>
  );
}
