'use client';

import { useRef, useState } from 'react';
import {
  Upload,
  FileCheck2,
  AlertTriangle,
  Download,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type { ConversionReport } from '@priority-cpa/ardeni-parser';

interface Props {
  companyId: string;
}

type Phase = 'idle' | 'uploading' | 'preview' | 'exporting';

export function ArdeniClient({ companyId }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const exportable =
    report !== null && report.isOpeningValid && report.balanceOk;

  async function handleFile(file: File) {
    setError(null);
    setReport(null);
    setJobId(null);
    setFileName(file.name);
    setPhase('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/ardeni?companyId=${companyId}`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as {
        jobId?: string;
        report?: ConversionReport;
        error?: string;
      };
      if (!res.ok || !data.report || !data.jobId) {
        setError(data.error ?? 'העלאה נכשלה');
        setPhase('idle');
        return;
      }
      setReport(data.report);
      setJobId(data.jobId);
      setPhase('preview');
    } catch {
      setError('שגיאת רשת — נסה שוב');
      setPhase('idle');
    }
  }

  async function handleExport() {
    if (!jobId) return;
    setError(null);
    setPhase('exporting');
    try {
      const res = await fetch(`/api/ardeni?companyId=${companyId}&job=${jobId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'ייצוא נכשל');
        setPhase('preview');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movein-${jobId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setPhase('preview');
    } catch {
      setError('שגיאת רשת — נסה שוב');
      setPhase('preview');
    }
  }

  return (
    <div className="space-y-5">
      {/* Dropzone */}
      <div
        className="bg-white border border-dashed border-ink-300 rounded-xl p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.dat,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Upload size={28} className="mx-auto text-ink-400" />
        <p className="text-sm text-ink-700 mt-3">
          גרור לכאן קובץ <span dir="ltr" className="font-mono">BKMVDATA.TXT</span> או
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={phase === 'uploading' || phase === 'exporting'}
          className="mt-3 px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
        >
          בחר קובץ
        </button>
        <p className="text-[11px] text-ink-400 mt-3">
          מבנה אחיד (OF1.31), קידוד Windows-1255, עד 50MB
        </p>
        {fileName && (
          <p className="text-xs text-ink-600 mt-2" dir="ltr">
            {fileName}
          </p>
        )}
      </div>

      {/* Loading */}
      {phase === 'uploading' && (
        <div className="bg-white border border-ink-200 rounded-xl p-5 flex items-center gap-2 text-sm text-ink-600">
          <Loader2 size={16} className="animate-spin text-accent-600" />
          מנתח את הקובץ…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Blocking preview */}
      {report && phase !== 'uploading' && (
        <div className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <FileCheck2 size={16} className="text-accent-600" />
            תצוגה מקדימה — אישור לפני ייצוא
          </h3>

          {/* Guards */}
          <div className="flex flex-wrap gap-2">
            <Guard
              ok={report.isOpeningValid}
              okText="מבנה אחיד תקין (A100)"
              badText="מבנה לא תקין — אין A100"
            />
            <Guard
              ok={report.balanceOk}
              okText="מאוזן: חובה = זכות"
              badText="לא מאוזן — אסור לייצא"
            />
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric label="פקודות יומן" value={report.jeCount} />
            <Metric label="שורות מקור (B100)" value={report.sourceLineCount} />
            <Metric
              label="חשבונות בשימוש"
              value={`${report.requiredAccountCount} / ${report.sourceAccountCount}`}
            />
            <Metric label="סך חובה" value={`${report.drSum.toFixed(2)} ₪`} />
            <Metric label="סך זכות" value={`${report.crSum.toFixed(2)} ₪`} />
            <Metric label="הפרש" value={`${report.netImbalance.toFixed(2)} ₪`} />
          </div>

          {/* Currencies + periods */}
          <div className="text-xs text-ink-600 space-y-1">
            <p>
              מטבעות:{' '}
              <span dir="ltr">
                {Object.entries(report.currencyCounts)
                  .map(([c, n]) => `${c} (${n})`)
                  .join(' · ') || '—'}
              </span>
            </p>
            <p>
              תקופות לפתיחה:{' '}
              <span dir="ltr">{report.periods.join(', ') || '—'}</span>
            </p>
          </div>

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {report.warnings.length} אזהרות לבדיקה ידנית
              </p>
              <ul className="text-[11px] space-y-0.5 list-disc pr-4">
                {report.warnings.slice(0, 5).map((w, i) => (
                  <li key={i} dir="ltr" className="text-right">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Export CTA */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!exportable || phase === 'exporting'}
              className="px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {phase === 'exporting' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              צור קובץ MOVEIN
            </button>
            {!exportable && (
              <p className="text-[11px] text-red-600 mt-2">
                לא ניתן לייצא עד לתיקון הבעיות שסומנו למעלה.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function JobDownload({
  companyId,
  jobId,
}: {
  companyId: string;
  jobId: string;
}) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/ardeni?companyId=${companyId}&job=${jobId}`,
        { method: 'GET' },
      );
      const data = (await res.json()) as { url?: string };
      if (data.url) window.open(data.url, '_blank');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={busy}
      className="text-sm text-accent-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      הורד
    </button>
  );
}

function Guard({
  ok,
  okText,
  badText,
}: {
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return ok ? (
    <span className="text-[11px] px-2 py-1 rounded-lg font-medium bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5">
      <ShieldCheck size={13} />
      {okText}
    </span>
  ) : (
    <span className="text-[11px] px-2 py-1 rounded-lg font-medium bg-red-50 text-red-700 inline-flex items-center gap-1.5">
      <ShieldAlert size={13} />
      {badText}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-ink-100 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
        {label}
      </p>
      <p className="text-sm font-semibold text-ink-900 mt-0.5 tabular-nums" dir="ltr">
        {value}
      </p>
    </div>
  );
}
