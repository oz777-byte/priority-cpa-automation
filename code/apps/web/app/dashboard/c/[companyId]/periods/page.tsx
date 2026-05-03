import { Calendar } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { PeriodsPanel, type PeriodRow, type PeriodStatus } from './periods-panel';

export const dynamic = 'force-dynamic';

interface DBPeriod {
  year: number;
  month: number;
  status: PeriodStatus;
  locked_at: string | null;
}

interface DBJESummary {
  document_date: string;
  debit_total: number;
}

export default async function PeriodsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  // Fetch periods.
  const { data: periodsData } = await admin
    .from('accounting_periods')
    .select('year, month, status, locked_at')
    .eq('company_id', company.id)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  // Fetch JE counts and totals per (year, month) — single query, aggregate in JS.
  const { data: jesData } = await admin
    .from('journal_entries')
    .select('id, document_date')
    .eq('company_id', company.id);

  const { data: linesData } = jesData && jesData.length > 0
    ? await admin
        .from('journal_entry_lines')
        .select('je_id, debit')
        .in('je_id', jesData.map((j) => j.id as string))
    : { data: [] };

  const debitsByJE = new Map<string, number>();
  for (const l of (linesData ?? []) as Array<{ je_id: string; debit: number }>) {
    debitsByJE.set(
      l.je_id,
      (debitsByJE.get(l.je_id) ?? 0) + Number(l.debit),
    );
  }

  const summaryByPeriod = new Map<
    string,
    { count: number; total_debit: number }
  >();
  for (const j of (jesData ?? []) as Array<{ id: string; document_date: string }>) {
    const date = new Date(j.document_date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const cur = summaryByPeriod.get(key) ?? { count: 0, total_debit: 0 };
    cur.count += 1;
    cur.total_debit += debitsByJE.get(j.id) ?? 0;
    summaryByPeriod.set(key, cur);
  }

  const rows: PeriodRow[] = ((periodsData ?? []) as DBPeriod[]).map((p) => {
    const key = `${p.year}-${p.month}`;
    const summary = summaryByPeriod.get(key) ?? { count: 0, total_debit: 0 };
    return {
      id: key,
      year: p.year,
      month: p.month,
      status: p.status,
      jeCount: summary.count,
      total_debit: summary.total_debit,
      total_credit: summary.total_debit, // balanced JEs → debit = credit
      lockedAt: p.locked_at,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Calendar size={18} className="text-brand-500" />
          תקופות חשבונאיות
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          כל חודש שיש בו פקודת יומן הופך לתקופה אוטומטית. נעילת תקופה (אחרי
          דיווח מע"מ) חוסמת רישום או עריכה של JE בחודש הזה.
        </p>
      </div>

      <PeriodsPanel rows={rows} companyId={company.id} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed space-y-1">
        <div>
          <strong>מספור JE רץ:</strong> כל פקודת יומן מקבלת מספר רץ ייחודי
          לחברה (חוק ישראלי — ללא חוסרים ברצף).
        </div>
        <div>
          <strong>נעילה אוטומטית:</strong> בקרוב — נעילה אוטומטית אחרי דיווח
          PCN874 + שמירה ארוכת-טווח של 7 שנים.
        </div>
      </div>
    </div>
  );
}
