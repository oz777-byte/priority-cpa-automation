import { Lightbulb } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/page-header';
import { NotesPanel, type NoteRow, type NoteStatus } from './notes-panel';

export const dynamic = 'force-dynamic';

interface DBNote {
  id: string;
  rule_id: number;
  rule_code: string;
  rule_title: string;
  user_id: string;
  user_email: string;
  company_id: string | null;
  note: string;
  status: NoteStatus;
  admin_response: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export default async function AdminRuleNotesPage() {
  await requireAdmin();
  const admin = getAdminClient();

  const { data: notes } = await admin
    .from('rule_improvement_notes')
    .select('*')
    .order('created_at', { ascending: false });

  // Optional: resolve company names for display.
  const companyIds = Array.from(
    new Set(((notes ?? []) as DBNote[]).map((n) => n.company_id).filter(Boolean) as string[]),
  );
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: comps } = await admin
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    for (const c of (comps ?? []) as Array<{ id: string; name: string }>) {
      companyNames.set(c.id, c.name);
    }
  }

  const rows: NoteRow[] = ((notes ?? []) as DBNote[]).map((n) => ({
    id: n.id,
    ruleId: n.rule_id,
    ruleCode: n.rule_code,
    ruleTitle: n.rule_title,
    userEmail: n.user_email,
    companyName: n.company_id ? companyNames.get(n.company_id) ?? null : null,
    note: n.note,
    status: n.status,
    adminResponse: n.admin_response,
    reviewedAt: n.reviewed_at,
    createdAt: n.created_at,
  }));

  const counts = rows.reduce<Record<NoteStatus, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    { open: 0, reviewing: 0, planned: 0, shipped: 0, rejected: 0, duplicate: 0 },
  );

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        icon={Lightbulb}
        title="הערות שיפור — חוקי הנהלת חשבונות"
        description='כל הערה שרו"ח שלח על אחד מהחוקים. השב, סווג, וקדם את ה-roadmap.'
      />

      <div className="bg-white border border-ink-200 rounded-xl p-3 mb-4 flex flex-wrap gap-2 text-xs">
        <Stat label="פתוחות" count={counts.open} tone="amber" />
        <Stat label="בבדיקה" count={counts.reviewing} tone="blue" />
        <Stat label="ב-roadmap" count={counts.planned} tone="purple" />
        <Stat label="הוטמעו" count={counts.shipped} tone="emerald" />
        <Stat label="נדחו" count={counts.rejected} tone="ink" />
        <Stat label="כפילויות" count={counts.duplicate} tone="ink" />
      </div>

      <NotesPanel rows={rows} />
    </div>
  );
}

function Stat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'amber' | 'blue' | 'purple' | 'emerald' | 'ink';
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : tone === 'purple'
          ? 'bg-purple-50 text-purple-800 border-purple-200'
          : tone === 'emerald'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-ink-50 text-ink-700 border-ink-200';
  return (
    <div className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${cls}`}>
      <span>{label}</span>
      <span className="text-[10px] tabular-nums">{count}</span>
    </div>
  );
}
