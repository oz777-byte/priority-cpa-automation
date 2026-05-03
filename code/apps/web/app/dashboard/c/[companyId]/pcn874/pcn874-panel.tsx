'use client';

import { useState, useTransition } from 'react';
import {
  Eye,
  Download,
  FileText,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  History,
  X,
  RefreshCw,
} from 'lucide-react';
import { reopenPeriodForCorrectionAction } from './actions';

export interface ExportRow {
  id: string;
  year: number;
  month: number;
  inputsSubtotal: number;
  inputsVat: number;
  salesSubtotal: number;
  salesVat: number;
  vatToPay: number;
  jeCount: number;
  md5: string;
  bytes: number;
  generatedAt: string;
  autoLocked: boolean;
  isCorrection: boolean;
  correctionSequence: number;
  correctionReason: string | null;
}

interface PreviewData {
  ok: true;
  vatId: string;
  summary: {
    totalInputsSubtotal: number;
    totalInputsVat: number;
    totalSalesSubtotal: number;
    totalSalesVat: number;
    vatToPay: number;
    inputsCount: number;
    salesCount: number;
  };
  warnings: string[];
  preview: string;
}

const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const fmt = (n: number): string =>
  n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Pcn874Panel({
  companyId,
  history,
  correctableExports,
  lockedPeriods,
}: {
  companyId: string;
  history: ExportRow[];
  correctableExports: ExportRow[];
  lockedPeriods: string[];
}) {
  const today = new Date();
  // Default = previous month (typical use case: end-of-month reporting).
  const defaultMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const defaultYear =
    today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [autoLock, setAutoLock] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reopenModal, setReopenModal] = useState<ExportRow | null>(null);
  const [pending, startTransition] = useTransition();

  // Detect if the currently-selected period already has a 874 export
  // (which would make this generation a correction).
  const isCorrectionForSelected = history.some(
    (h) => h.year === year && h.month === month && !h.isCorrection,
  );
  const periodKey = `${year}-${month}`;
  const periodLocked = lockedPeriods.includes(periodKey);

  void correctableExports; // currently surfaced in history list — kept in props for future use

  function loadPreview() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const url = `/api/reports/pcn874?companyId=${encodeURIComponent(companyId)}&year=${year}&month=${month}&preview=1`;
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error || 'טעינת תצוגה מקדימה נכשלה');
          return;
        }
        setPreview(json as PreviewData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאת רשת');
      }
    });
  }

  function generate() {
    setError(null);
    if (isCorrectionForSelected && correctionReason.trim().length < 10) {
      setError('דיווח קיים — נא לתאר את סיבת התיקון (לפחות 10 תווים) לפני הפקת תיקון.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/reports/pcn874', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            year,
            month,
            lockPeriod: autoLock,
            ...(isCorrectionForSelected ? { correctionReason: correctionReason.trim() } : {}),
          }),
        });
        if (!res.ok) {
          let msg = 'הפקה נכשלה';
          try {
            const err = await res.json();
            msg = err.error || msg;
          } catch {
            /* ignore */
          }
          setError(msg);
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') ?? '';
        const m = /filename="([^"]+)"/.exec(cd);
        const filename = m?.[1] ?? `pcn874-${year}-${month}.txt`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // Reload to show new history row + locked period state.
        setTimeout(() => window.location.reload(), 600);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאת רשת');
      }
    });
  }

  function downloadHistorical(id: string) {
    // The DB stores file_content as text; we surface it via the API endpoint
    // by id in a future enhancement. For now we point users to re-generate.
    void id;
    alert('להורדה חוזרת — הפק את הדיווח שוב לאותו חודש (יישמר רישום חדש בהיסטוריה).');
  }

  const yearOptions: number[] = [];
  for (let y = today.getFullYear(); y >= today.getFullYear() - 5; y--) {
    yearOptions.push(y);
  }

  return (
    <div className="space-y-5">
      {/* Period picker */}
      <div className="bg-white border border-ink-200 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <div className="text-xs text-ink-600 mb-1">שנה</div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              disabled={pending}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-ink-600 mb-1">חודש</div>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              disabled={pending}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')} — {MONTH_NAMES[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700 mr-3">
            <input
              type="checkbox"
              checked={autoLock}
              onChange={(e) => setAutoLock(e.target.checked)}
              disabled={pending}
              className="rounded"
            />
            נעל את התקופה אוטומטית בעת ההפקה
          </label>
          <div className="flex-1" />
          <button
            type="button"
            onClick={loadPreview}
            disabled={pending}
            className="px-4 py-2 border border-ink-300 text-ink-800 hover:bg-ink-50 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Eye size={14} />
            תצוגה מקדימה
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={pending || !preview}
            className="px-5 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 flex items-center gap-1.5 disabled:opacity-50"
            title={!preview ? 'יש לטעון תצוגה מקדימה לפני הפקה' : ''}
          >
            <Download size={14} />
            {pending ? 'מפיק...' : 'הפק והורד'}
          </button>
        </div>

        {isCorrectionForSelected && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <RefreshCw size={13} />
              מצב תיקון: כבר הופק 874 לתקופה זו
              {periodLocked && (
                <span className="text-[10px] font-normal text-amber-700 mr-2">
                  (התקופה {periodLocked ? 'נעולה' : 'פתוחה'})
                </span>
              )}
            </div>
            {periodLocked ? (
              <div className="text-[11px] text-amber-800 leading-relaxed">
                התקופה נעולה. כדי לבצע תיקון:
                <strong> 1)</strong> פתח את התקופה דרך כפתור "פתח לתיקון" שליד הדיווח בהיסטוריה למטה,
                <strong> 2)</strong> הוסף או ערוך JEs לפי הצורך,
                <strong> 3)</strong> חזור לכאן והפק 874 חדש — הוא ייווצר אוטומטית כתיקון.
              </div>
            ) : (
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="סיבת התיקון (חובה — לפחות 10 תווים). לדוגמה: התווספה חשבונית 4427930 שלא נכללה בדיווח המקורי."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500"
                disabled={pending}
              />
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {info && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2">
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
            {info}
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-white border border-accent-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <FileText size={14} className="text-accent-600" />
            תצוגה מקדימה — {MONTH_NAMES[month]} {year}
            <span className="text-xs text-ink-500 font-normal mr-auto" dir="ltr">
              ע.מ {preview.vatId}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <SummaryCard
              label="עסקאות (מכירות)"
              count={preview.summary.salesCount}
              subtotal={preview.summary.totalSalesSubtotal}
              vat={preview.summary.totalSalesVat}
              tone="emerald"
            />
            <SummaryCard
              label="תשומות (קניות)"
              count={preview.summary.inputsCount}
              subtotal={preview.summary.totalInputsSubtotal}
              vat={preview.summary.totalInputsVat}
              tone="blue"
            />
          </div>

          <div
            className={`rounded-lg p-3 border flex items-center justify-between ${
              preview.summary.vatToPay >= 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div>
              <div className="text-xs font-medium">
                {preview.summary.vatToPay >= 0 ? 'מע"מ לתשלום' : 'מע"מ להחזר'}
              </div>
              <div className="text-2xl font-bold tabular-nums" dir="ltr">
                {fmt(Math.abs(preview.summary.vatToPay))} ₪
              </div>
            </div>
            <div className="text-xs text-ink-600 leading-relaxed">
              סך עסקאות מע"מ <span dir="ltr" className="tabular-nums">{fmt(preview.summary.totalSalesVat)}</span>
              <br />
              פחות תשומות מע"מ <span dir="ltr" className="tabular-nums">{fmt(preview.summary.totalInputsVat)}</span>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle size={12} />
                {preview.warnings.length} התראות:
              </div>
              <ul className="list-disc pr-4 space-y-0.5">
                {preview.warnings.slice(0, 5).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {preview.warnings.length > 5 && (
                  <li>... ועוד {preview.warnings.length - 5}</li>
                )}
              </ul>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              5 שורות ראשונות של הקובץ (לאימות מבנה)
            </div>
            <pre
              className="text-[11px] font-mono bg-ink-900 text-ink-100 p-3 rounded-lg overflow-x-auto whitespace-pre"
              dir="ltr"
            >
              {preview.preview}
            </pre>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white border border-ink-200 rounded-xl">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2 text-sm font-semibold text-ink-900">
          <History size={14} className="text-brand-500" />
          היסטוריית ייצוא ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-500">
            עדיין לא הופק קובץ 874 לחברה זו.
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {history.map((h) => {
              const periodKey = `${h.year}-${h.month}`;
              const isLocked = lockedPeriods.includes(periodKey);
              const canReopen = isLocked && !h.isCorrection;
              return (
                <li key={h.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900 text-sm" dir="ltr">
                        {String(h.month).padStart(2, '0')}/{h.year}
                      </span>
                      <span className="text-xs text-ink-500">
                        {h.jeCount} פקודות
                      </span>
                      {h.isCorrection && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-medium flex items-center gap-1">
                          <RefreshCw size={10} />
                          תיקון #{h.correctionSequence}
                        </span>
                      )}
                      {h.autoLocked && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-medium flex items-center gap-1">
                          <Lock size={10} />
                          תקופה ננעלה
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-600 mt-0.5 flex flex-wrap items-center gap-2 tabular-nums">
                      <span dir="ltr">{h.generatedAt.slice(0, 10)}</span>
                      <span>·</span>
                      <span>
                        {h.vatToPay >= 0 ? 'לתשלום ' : 'להחזר '}
                        <strong>{fmt(Math.abs(h.vatToPay))} ₪</strong>
                      </span>
                      <span>·</span>
                      <span dir="ltr" className="text-[10px] text-ink-400 font-mono">
                        MD5 {h.md5.slice(0, 12)}…
                      </span>
                      <span>·</span>
                      <span>{h.bytes} bytes</span>
                    </div>
                    {h.correctionReason && (
                      <div className="text-[11px] text-purple-700 mt-1 leading-relaxed bg-purple-50 px-2 py-1 rounded">
                        <strong>סיבת תיקון:</strong> {h.correctionReason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canReopen && (
                      <button
                        type="button"
                        onClick={() => setReopenModal(h)}
                        className="text-xs px-2 py-1 border border-purple-300 text-purple-800 hover:bg-purple-50 rounded flex items-center gap-1"
                        title="פתח את התקופה לתיקון רטרואקטיבי"
                      >
                        <Unlock size={11} />
                        פתח לתיקון
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadHistorical(h.id)}
                      className="text-xs px-2 py-1 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded flex items-center gap-1"
                      title="להורדה חוזרת — הפק שוב"
                    >
                      <Download size={11} />
                      הורד
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {reopenModal && (
        <ReopenModal
          companyId={companyId}
          row={reopenModal}
          onClose={() => setReopenModal(null)}
          onSuccess={(msg) => {
            setReopenModal(null);
            setInfo(msg);
            setError(null);
            setTimeout(() => window.location.reload(), 800);
          }}
          onError={(err) => setError(err)}
        />
      )}
    </div>
  );
}

function ReopenModal({
  companyId,
  row,
  onClose,
  onSuccess,
  onError,
}: {
  companyId: string;
  row: ExportRow;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      onError('סיבה חייבת לכלול לפחות 10 תווים');
      return;
    }
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('year', String(row.year));
    fd.set('month', String(row.month));
    fd.set('reason', reason.trim());
    startTransition(async () => {
      const r = await reopenPeriodForCorrectionAction(fd);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      onSuccess(
        `התקופה ${row.month}/${row.year} נפתחה לתיקון. הוסף/ערוך JEs ואז חזור לכאן והפק 874 חדש — הוא ייווצר כתיקון ${row.month}/${row.year}.`,
      );
    });
  }

  return (
    <div className="fixed inset-0 bg-ink-900/50 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <Unlock size={14} className="text-purple-600" />
            פתיחת תקופה לתיקון 874 — {String(row.month).padStart(2, '0')}/{row.year}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 leading-relaxed">
          <strong>שים לב:</strong> פעולה זו פותחת תקופה נעולה לעריכת JEs. לאחר שתוסיף/תתקן את ה-JEs, חזור למסך זה והפק 874 — הוא ייווצר אוטומטית כתיקון. הסיבה תישמר ב-audit log ובדיווח.
        </div>

        <label className="block">
          <div className="text-xs font-medium text-ink-700 mb-1">
            סיבת התיקון <span className="text-red-500">*</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="לדוגמה: התווספה חשבונית מספק וירטהיים שלא נכללה בדיווח המקורי בגלל איחור."
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={pending}
            required
          />
          <div className="text-[10px] text-ink-500 mt-1">
            {reason.length}/500 תווים (מינימום 10)
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={pending || reason.trim().length < 10}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Unlock size={13} />
            {pending ? 'פותח...' : 'פתח את התקופה'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  subtotal,
  vat,
  tone,
}: {
  label: string;
  count: number;
  subtotal: number;
  vat: number;
  tone: 'emerald' | 'blue';
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/40'
      : 'border-blue-200 bg-blue-50/40';
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-xs text-ink-700 font-medium flex items-center gap-1.5">
        <CheckCircle2 size={12} />
        {label}
        <span className="text-[10px] text-ink-500 mr-auto">{count} פקודות</span>
      </div>
      <div className="mt-2 grid grid-cols-2 text-xs gap-2">
        <div>
          <div className="text-[10px] text-ink-500">סכום ביניים</div>
          <div className="font-medium tabular-nums" dir="ltr">{fmt(subtotal)} ₪</div>
        </div>
        <div>
          <div className="text-[10px] text-ink-500">מע"מ</div>
          <div className="font-medium tabular-nums" dir="ltr">{fmt(vat)} ₪</div>
        </div>
      </div>
    </div>
  );
}
