'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { submitFieldCorrectionAction } from './actions';

export function EditableField({
  companyId,
  invoiceId,
  fieldPath,
  value,
  displayValue,
  inputType = 'text',
  inputDir,
  hint,
}: {
  companyId: string;
  invoiceId: string;
  fieldPath:
    | 'supplier.name'
    | 'supplier.tax_id'
    | 'invoice.number'
    | 'invoice.date'
    | 'invoice.allocation_number'
    | 'totals.subtotal'
    | 'totals.total';
  value: string;
  displayValue?: React.ReactNode;
  inputType?: 'text' | 'number' | 'date';
  inputDir?: 'ltr' | 'rtl';
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    if (!draft.trim()) {
      setError('ערך לא יכול להיות ריק');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('invoiceId', invoiceId);
    fd.set('fieldPath', fieldPath);
    fd.set('correctedValue', draft.trim());
    startTransition(async () => {
      const r = await submitFieldCorrectionAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setEditing(false);
    });
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 group">
        <span>{displayValue ?? value}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-accent-600 transition-opacity"
          title={hint ?? 'תקן ערך זה'}
          aria-label="תקן"
        >
          <Pencil size={11} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1">
        <input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          dir={inputDir}
          autoFocus
          disabled={pending}
          className="px-2 py-0.5 border border-accent-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[120px]"
        />
        <button
          type="button"
          onClick={commit}
          disabled={pending}
          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          title="שמור (Enter)"
          aria-label="שמור"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="text-ink-400 hover:text-red-600 disabled:opacity-50"
          title="בטל (Esc)"
          aria-label="בטל"
        >
          <X size={14} />
        </button>
      </span>
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.9
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : confidence >= 0.7
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';
  return (
    <span
      className={`text-[9px] px-1 py-0.5 rounded border font-medium ${tone}`}
      title={`רמת ביטחון OCR: ${pct}%`}
    >
      {pct}%
    </span>
  );
}
