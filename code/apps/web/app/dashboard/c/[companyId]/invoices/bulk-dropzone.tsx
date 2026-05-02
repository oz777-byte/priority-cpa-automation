'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanLine,
  X,
} from 'lucide-react';
import type { ExtractedInvoice } from '@priority-cpa/ocr-azure';
import { createInvoiceFromOcrAction } from './bulk-actions';

type RowStatus =
  | { phase: 'pending' }
  | { phase: 'extracting' }
  | { phase: 'creating' }
  | { phase: 'created'; invoiceId: string }
  | { phase: 'duplicate' }
  | { phase: 'error'; message: string };

interface ProgressRow {
  id: string;
  fileName: string;
  fileSize: number;
  status: RowStatus;
}

export function BulkInvoiceDropzone({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [, startTransition] = useTransition();

  function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter(
      (f) =>
        f.size > 0 &&
        (f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf')),
    );
    if (files.length === 0) return;

    const newRows: ProgressRow[] = files.map((f) => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      fileSize: f.size,
      status: { phase: 'pending' },
    }));
    setRows((prev) => [...newRows, ...prev]);

    // Process sequentially so we don't pound the OCR endpoint.
    startTransition(async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const rowId = newRows[i]!.id;
        await processOne(file, rowId);
      }
      // Refresh server data so the new invoices appear in the table below.
      router.refresh();
    });
  }

  async function processOne(file: File, rowId: string) {
    function update(status: RowStatus) {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, status } : r)));
    }

    update({ phase: 'extracting' });
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await fetch(
        `/api/invoices/ocr?companyId=${encodeURIComponent(companyId)}`,
        { method: 'POST', body: fd },
      );
      const json = (await r.json()) as
        | {
            ok: true;
            extracted: ExtractedInvoice;
            fileName: string;
            pdfPath: string | null;
          }
        | { ok?: false; error?: string };
      if (!r.ok || !('ok' in json) || !json.ok) {
        update({
          phase: 'error',
          message: ('error' in json && json.error) || 'חילוץ נכשל',
        });
        return;
      }

      update({ phase: 'creating' });
      const created = await createInvoiceFromOcrAction({
        companyId,
        extracted: json.extracted,
        pdfPath: json.pdfPath,
        fileName: json.fileName,
      });

      if (created.duplicate) {
        update({ phase: 'duplicate' });
      } else if (created.ok && created.invoiceId) {
        update({ phase: 'created', invoiceId: created.invoiceId });
      } else {
        update({ phase: 'error', message: created.error ?? 'יצירת חשבונית נכשלה' });
      }
    } catch (e) {
      update({
        phase: 'error',
        message: e instanceof Error ? e.message : 'שגיאה בלתי צפויה',
      });
    }
  }

  function clearCompleted() {
    setRows((prev) =>
      prev.filter(
        (r) =>
          r.status.phase !== 'created' &&
          r.status.phase !== 'duplicate' &&
          r.status.phase !== 'error',
      ),
    );
  }

  const completed = rows.filter(
    (r) =>
      r.status.phase === 'created' ||
      r.status.phase === 'duplicate' ||
      r.status.phase === 'error',
  ).length;
  const inFlight = rows.filter(
    (r) =>
      r.status.phase === 'extracting' ||
      r.status.phase === 'creating' ||
      r.status.phase === 'pending',
  ).length;

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          processFiles(e.dataTransfer.files);
        }}
        className={`block bg-brand-radial text-white rounded-xl p-4 border-2 border-dashed cursor-pointer transition ${
          isDragging
            ? 'border-brand-glow shadow-glow'
            : 'border-white/20 hover:border-white/40'
        }`}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 text-brand-glow flex items-center justify-center flex-shrink-0">
            {inFlight > 0 ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Upload size={20} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">
              {inFlight > 0
                ? `מעבד ${inFlight} קבצים...`
                : 'גרור PDF או כמה קבצים — חילוץ + יצירה אוטומטיים'}
            </div>
            <div className="text-white/70 text-xs mt-0.5">
              כל PDF הופך לטיוטת חשבונית. כפילויות מזוהות לפי ע.מ + מספר + תאריך + סכום.
            </div>
          </div>
          <ScanLine size={20} className="text-brand-glow/60 flex-shrink-0" />
        </div>
      </label>

      {rows.length > 0 && (
        <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-ink-50/60 border-b border-ink-100">
            <div className="text-xs text-ink-600">
              {completed > 0 && (
                <>
                  <span className="font-medium tabular-nums">{completed}</span> הושלמו
                </>
              )}
              {completed > 0 && inFlight > 0 && <span className="mx-2">·</span>}
              {inFlight > 0 && (
                <>
                  <span className="font-medium tabular-nums">{inFlight}</span> בעיבוד
                </>
              )}
            </div>
            {completed > 0 && (
              <button
                onClick={clearCompleted}
                className="text-xs text-ink-500 hover:text-ink-900 flex items-center gap-1"
              >
                <X size={12} />
                נקה הושלמו
              </button>
            )}
          </div>
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => (
              <ProgressRow key={r.id} row={r} companyId={companyId} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProgressRow({
  row,
  companyId,
}: {
  row: ProgressRow;
  companyId: string;
}) {
  const sizeKb = (row.fileSize / 1024).toFixed(0);
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm">
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0">
        <div className="text-ink-900 truncate" dir="ltr">
          {row.fileName}
        </div>
        <div className="text-[11px] text-ink-500 mt-0.5">
          <span className="tabular-nums">{sizeKb} KB</span>
          <span className="mx-1.5 text-ink-300">·</span>
          <StatusLabel status={row.status} />
        </div>
      </div>
      {row.status.phase === 'created' && (
        <a
          href={`/dashboard/c/${companyId}/invoices/${row.status.invoiceId}`}
          className="text-xs text-accent-600 hover:underline flex-shrink-0"
        >
          פתח
        </a>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: RowStatus }) {
  const cls = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0';
  switch (status.phase) {
    case 'pending':
      return (
        <div className={`${cls} bg-ink-100 text-ink-500`}>
          <Loader2 size={13} />
        </div>
      );
    case 'extracting':
    case 'creating':
      return (
        <div className={`${cls} bg-blue-50 text-blue-700`}>
          <Loader2 size={13} className="animate-spin" />
        </div>
      );
    case 'created':
      return (
        <div className={`${cls} bg-emerald-50 text-emerald-700`}>
          <CheckCircle2 size={13} />
        </div>
      );
    case 'duplicate':
      return (
        <div className={`${cls} bg-amber-50 text-amber-700`}>
          <AlertTriangle size={13} />
        </div>
      );
    case 'error':
      return (
        <div className={`${cls} bg-red-50 text-red-700`}>
          <XCircle size={13} />
        </div>
      );
  }
}

function StatusLabel({ status }: { status: RowStatus }) {
  switch (status.phase) {
    case 'pending':
      return <span className="text-ink-500">בתור</span>;
    case 'extracting':
      return <span className="text-blue-700">מחלץ נתונים</span>;
    case 'creating':
      return <span className="text-blue-700">יוצר חשבונית</span>;
    case 'created':
      return <span className="text-emerald-700">נוצרה</span>;
    case 'duplicate':
      return <span className="text-amber-700">כבר קיים — דילגנו</span>;
    case 'error':
      return <span className="text-red-700">{status.message}</span>;
  }
}
