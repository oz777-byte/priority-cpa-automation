import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureDraftJEsForCurrentCompany } from './actions';
import { JEEditorPanel } from './je-editor-panel';

export const dynamic = 'force-dynamic';

interface JERow {
  id: string;
  status: string;
  transaction_type: string;
  reference1: string;
  reference2: string | null;
  document_date: string;
  value_date: string;
  currency: string;
  details: string;
  scenario: string | null;
  invoice_id: string | null;
}

interface LineRow {
  id: string;
  je_id: string;
  line_no: number;
  account: string;
  debit: number;
  credit: number;
  details: string | null;
}

export default async function JEsPage() {
  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) redirect('/dashboard/companies');

  // Ensure every queued invoice has a draft JE.
  await ensureDraftJEsForCurrentCompany();

  const admin = getAdminClient();

  const { data: jeRows } = await admin
    .from('journal_entries')
    .select('id, status, transaction_type, reference1, reference2, document_date, value_date, currency, details, scenario, invoice_id')
    .eq('company_id', company.id)
    .neq('status', 'exported')
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false });

  const jeIds = (jeRows ?? []).map((r) => r.id as string);
  const { data: lineRows } = jeIds.length > 0
    ? await admin
        .from('journal_entry_lines')
        .select('id, je_id, line_no, account, debit, credit, details')
        .in('je_id', jeIds)
        .order('line_no', { ascending: true })
    : { data: [] as LineRow[] };

  const linesByJE = new Map<string, LineRow[]>();
  for (const l of (lineRows ?? []) as LineRow[]) {
    const arr = linesByJE.get(l.je_id) ?? [];
    arr.push(l);
    linesByJE.set(l.je_id, arr);
  }

  const jes = ((jeRows ?? []) as JERow[]).map((je) => ({
    je,
    lines: linesByJE.get(je.id) ?? [],
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">פקודות יומן</h1>
          <p className="text-ink-600 mt-1 text-sm">
            כל הפקודות הממתינות לייצוא לפריוריטי. אפשר לערוך כל שורה ישירות —
            השינויים נשמרים אוטומטית.
          </p>
        </div>
        {jes.length > 0 && (
          <form action="/api/movein" method="post">
            <button
              type="submit"
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
            >
              הפק MOVEIN.DAT לכולן ({jes.length})
            </button>
          </form>
        )}
      </div>

      {jes.length === 0 ? (
        <EmptyState />
      ) : (
        <JEEditorPanel jes={jes} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-8 text-center space-y-3">
      <h2 className="text-lg font-semibold text-ink-900">אין פקודות יומן בהמתנה</h2>
      <p className="text-sm text-ink-600">
        ברגע שתיכנס חשבונית לתור — ייווצר אוטומטית JE טיוטה, וכאן תוכל לערוך
        אותו.
      </p>
      <Link
        href="/dashboard/companies"
        className="inline-block px-4 py-2 bg-accent-600 text-white rounded-lg text-sm"
      >
        עבור לחברות לטעינת חשבוניות לדוגמה
      </Link>
    </div>
  );
}
