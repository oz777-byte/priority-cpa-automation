import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileEdit, Download, Inbox, AlertCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureDraftJEsForCurrentCompany } from './actions';
import { JEEditorPanel } from './je-editor-panel';
import { PageHeader } from '@/components/page-header';

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
    <div className="max-w-6xl mx-auto">
      <PageHeader
        icon={FileEdit}
        title="פקודות יומן"
        description="כל פקודה כאן היא JE שמיוצא לפריוריטי. ערוך כל שורה ישירות (חשבון, סכום) — השינויים נשמרים בלחיצה מחוץ לשדה. הפק קובץ MOVEIN.DAT כשהכל מוכן."
        action={editable.length > 0 ? (
          <form action="/api/movein" method="post">
            <button
              type="submit"
              className="px-5 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 flex items-center gap-2 shadow-sm"
            >
              <Download size={16} />
              הפק MOVEIN.DAT ({editable.length})
            </button>
          </form>
        ) : undefined}
      />

      {editable.length === 0 && exported.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {editable.length > 0 && (
            <section>
              <SectionTitle
                icon={FileEdit}
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
                icon={Download}
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
  icon: Icon,
  tone,
  title,
  count,
  description,
}: {
  icon: typeof FileEdit;
  tone: 'amber' | 'green' | 'blue';
  title: string;
  count: number;
  description: string;
}) {
  const palette = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  }[tone];
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${palette}`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="font-semibold text-ink-900 flex items-center gap-2">
          {title}
          <span className="text-xs px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded">{count}</span>
        </div>
        <div className="text-xs text-ink-600">{description}</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-10 text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-ink-100 flex items-center justify-center">
        <Inbox size={22} className="text-ink-400" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-ink-900">אין פקודות יומן</h2>
        <p className="text-sm text-ink-600 max-w-md mx-auto">
          כל חשבונית שתיכנס לתור — תיצור אוטומטית פקודת יומן טיוטה כאן.
          לטעינת חשבוניות לדוגמה כדי לראות את הזרימה:
        </p>
      </div>
      <Link
        href="/dashboard/companies"
        className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
      >
        <Building2Mini />
        לחברות → טעינת חשבוניות POC
      </Link>
      <div className="text-xs text-ink-400 flex items-center gap-1.5 justify-center">
        <AlertCircle size={12} />
        בעתיד הקרוב: גרירת PDF + OCR אוטומטי במקום הזנה ידנית
      </div>
    </div>
  );
}

function Building2Mini() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}
