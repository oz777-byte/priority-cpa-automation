import { Sparkles } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

interface DBCorrection {
  id: string;
  company_id: string;
  invoice_id: string;
  field_path: string;
  original_value: string | null;
  corrected_value: string;
  corrected_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  'supplier.name': 'שם ספק',
  'supplier.tax_id': 'ע.מ ספק',
  'invoice.number': 'מס׳ חשבונית',
  'invoice.date': 'תאריך חשבונית',
  'invoice.allocation_number': 'מספר הקצאה',
  'totals.subtotal': 'סכום ביניים',
  'totals.total': 'סך הכול',
};

export default async function OcrQualityPage() {
  await requireAdmin();
  const admin = getAdminClient();

  const { data: corrections } = await admin
    .from('ocr_corrections')
    .select('id, company_id, invoice_id, field_path, original_value, corrected_value, corrected_at')
    .order('corrected_at', { ascending: false })
    .limit(500);

  const list = (corrections ?? []) as DBCorrection[];

  // Aggregate by field_path.
  const byField = new Map<string, number>();
  for (const c of list) {
    byField.set(c.field_path, (byField.get(c.field_path) ?? 0) + 1);
  }
  const byFieldSorted = Array.from(byField.entries()).sort((a, b) => b[1] - a[1]);

  // Aggregate "common substitution" (original → corrected) — top 20.
  const subKey = (c: DBCorrection): string =>
    `${c.field_path}|${(c.original_value ?? '').slice(0, 60)}|${c.corrected_value.slice(0, 60)}`;
  const subCount = new Map<string, { count: number; sample: DBCorrection }>();
  for (const c of list) {
    const k = subKey(c);
    const cur = subCount.get(k) ?? { count: 0, sample: c };
    cur.count += 1;
    subCount.set(k, cur);
  }
  const topSubs = Array.from(subCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .filter((s) => s.count > 1); // Only show recurring ones

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        icon={Sparkles}
        title="איכות OCR — תיקוני שדות"
        description="מציג את כל התיקונים שמשתמשים ביצעו על שדות OCR. תיקונים חוזרים מצביעים על דפוסי שגיאה שכדאי לתקן בעתיד."
      />

      <section className="bg-white border border-ink-200 rounded-xl p-4 mb-5">
        <h3 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          תיקונים לפי שדה ({list.length} תיקונים סה&quot;כ)
        </h3>
        {byFieldSorted.length === 0 ? (
          <div className="text-sm text-ink-500 text-center py-6">
            עדיין לא בוצעו תיקוני OCR.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
              <tr>
                <th className="text-right px-3 py-2">שדה</th>
                <th className="text-left px-3 py-2 w-32">מספר תיקונים</th>
                <th className="text-left px-3 py-2 w-32">% מסך תיקונים</th>
              </tr>
            </thead>
            <tbody>
              {byFieldSorted.map(([field, count]) => {
                const pct = list.length > 0 ? (count / list.length) * 100 : 0;
                return (
                  <tr key={field} className="border-b border-ink-100 last:border-0">
                    <td className="px-3 py-2 text-ink-900">
                      {FIELD_LABELS[field] ?? field}
                      <code className="text-[10px] text-ink-500 mr-2 font-mono" dir="ltr">
                        {field}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-left tabular-nums font-medium" dir="ltr">
                      {count}
                    </td>
                    <td className="px-3 py-2 text-left tabular-nums text-ink-600">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border border-ink-200 rounded-xl p-4 mb-5">
        <h3 className="text-sm font-semibold text-ink-900 mb-3">
          טעויות חוזרות ({topSubs.length})
        </h3>
        <p className="text-xs text-ink-500 mb-3">
          תיקונים שחוזרים יותר מפעם אחת — מועמדים אופטימליים לכוונון מודל / regex / מילון מונחים.
        </p>
        {topSubs.length === 0 ? (
          <div className="text-sm text-ink-500 text-center py-6">
            אין דפוסים חוזרים עדיין (כל התיקונים ייחודיים).
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
              <tr>
                <th className="text-right px-3 py-2">שדה</th>
                <th className="text-right px-3 py-2">OCR קלט</th>
                <th className="text-right px-3 py-2">תיקון</th>
                <th className="text-left px-3 py-2 w-20">×</th>
              </tr>
            </thead>
            <tbody>
              {topSubs.map((s, i) => (
                <tr key={i} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2 text-ink-700 text-xs">
                    {FIELD_LABELS[s.sample.field_path] ?? s.sample.field_path}
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    <span className="text-red-700 line-through text-xs" dir="auto">
                      {s.sample.original_value || <em className="text-ink-400">(ריק)</em>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    <span className="text-emerald-700 text-xs" dir="auto">
                      {s.sample.corrected_value}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums font-medium">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border border-ink-200 rounded-xl">
        <div className="px-4 py-2 border-b border-ink-100 bg-ink-50/40">
          <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
            תיקונים אחרונים ({Math.min(list.length, 50)})
          </span>
        </div>
        {list.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-500">אין תיקונים.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
              <tr>
                <th className="text-right px-3 py-2 w-28">תאריך</th>
                <th className="text-right px-3 py-2">שדה</th>
                <th className="text-right px-3 py-2">קלט OCR</th>
                <th className="text-right px-3 py-2">תיקון</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 50).map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
                  <td className="px-3 py-2 text-ink-500 text-xs" dir="ltr">
                    {c.corrected_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-ink-700 text-xs">
                    {FIELD_LABELS[c.field_path] ?? c.field_path}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-red-700 line-through text-xs" dir="auto">
                      {c.original_value || <em className="text-ink-400">(ריק)</em>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-emerald-700 text-xs" dir="auto">
                      {c.corrected_value}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
