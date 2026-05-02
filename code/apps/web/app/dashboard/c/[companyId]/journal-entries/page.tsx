import Link from 'next/link';
import { Download, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureDraftJEsForCompany } from './actions';
import { JEEditorPanel } from '@/components/journal-entries/editor-panel';

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

export default async function CompanyJEsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  await ensureDraftJEsForCompany(company.id, me.id, me.email);

  const admin = getAdminClient();
  const { data: jeRows } = await admin
    .from('journal_entries')
    .select('id, status, transaction_type, reference1, reference2, document_date, value_date, currency, details, scenario, invoice_id')
    .eq('company_id', company.id)
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

  const allJes = ((jeRows ?? []) as JERow[]).map((je) => ({
    je,
    lines: linesByJE.get(je.id) ?? [],
  }));

  const editable = allJes.filter((x) => x.je.status !== 'exported');
  const exported = allJes.filter((x) => x.je.status === 'exported');

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">פקודות יומן</h2>
          <p className="text-sm text-ink-600 mt-0.5">
            ערוך כל שורה ישירות (חשבון, סכום) — שינויים נשמרים בלחיצה מחוץ
            לשדה. כשהכל מוכן — הפק קובץ MOVEIN.DAT.
          </p>
        </div>
        {editable.length > 0 && (
          <form action={`/api/movein?companyId=${company.id}`} method="post">
            <button
              type="submit"
              className="px-5 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-2 shadow-sm"
            >
              <Download size={16} />
              הפק MOVEIN.DAT ({editable.length})
            </button>
          </form>
        )}
      </div>

      {editable.length === 0 && exported.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {editable.length > 0 && (
            <section>
              <SectionTitle
                tone="amber"
                title="טיוטות לעריכה"
                count={editable.length}
                description="ניתן לערוך כל שורה. השינויים נשמרים אוטומטית."
              />
              <JEEditorPanel jes={editable} />
            </section>
          )}

          {exported.length > 0 && (
            <section>
              <SectionTitle
                tone="green"
                title="היסטוריה - יוצאו לפריוריטי"
                count={exported.length}
                description="לקריאה בלבד. JE שיוצא נעול לעריכה."
              />
              <JEEditorPanel jes={exported} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  tone,
  title,
  count,
  description,
}: {
  tone: 'amber' | 'green' | 'blue';
  title: string;
  count: number;
  description: string;
}) {
  const accent = {
    amber: 'text-amber-700 bg-amber-100',
    green: 'text-emerald-700 bg-emerald-100',
    blue: 'text-blue-700 bg-blue-100',
  }[tone];
  return (
    <div className="mb-3">
      <div className="font-semibold text-ink-900 flex items-center gap-2">
        {title}
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${accent}`}>{count}</span>
      </div>
      <div className="text-xs text-ink-600">{description}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-10 text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-white flex items-center justify-center">
        <Inbox size={22} className="text-ink-400" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink-900">אין פקודות יומן</h3>
        <p className="text-sm text-ink-600 max-w-md mx-auto">
          ברגע שתיכנס חשבונית — ייווצר אוטומטית JE טיוטה, וכאן תוכל לערוך אותו
          ולייצא לפריוריטי.
        </p>
      </div>
      <Link
        href="/dashboard/companies"
        className="inline-block px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
      >
        טען חשבוניות לדוגמה
      </Link>
    </div>
  );
}
