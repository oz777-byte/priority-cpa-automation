'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  updateJEHeaderAction,
  updateLineAction,
  addLineAction,
  removeLineAction,
} from './actions';

interface JE {
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

interface Line {
  id: string;
  je_id: string;
  line_no: number;
  account: string;
  debit: number;
  credit: number;
  details: string | null;
}

interface JEWithLines {
  je: JE;
  lines: Line[];
}

export function JEEditorPanel({ jes }: { jes: JEWithLines[] }) {
  return (
    <div className="space-y-4">
      {jes.map((item) => (
        <JECard key={item.je.id} je={item.je} lines={item.lines} />
      ))}
    </div>
  );
}

/* =================== card =================== */

function JECard({ je, lines }: { je: JE; lines: Line[] }) {
  const drSum = lines.reduce((s, l) => s + Number(l.debit), 0);
  const crSum = lines.reduce((s, l) => s + Number(l.credit), 0);
  const balanced = Math.abs(drSum - crSum) <= 0.05;
  const isExported = je.status === 'exported';
  const tone = scenarioTone(je.scenario);

  return (
    <article className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-sm">
      <div className={`h-1 ${tone.bar}`} />

      <CardHeader
        je={je}
        balanced={balanced}
        drSum={drSum}
        crSum={crSum}
        isExported={isExported}
        tone={tone}
      />

      <HeaderFields je={je} disabled={isExported} />

      <LinesTable
        je={je}
        lines={lines}
        drSum={drSum}
        crSum={crSum}
        balanced={balanced}
        disabled={isExported}
      />
    </article>
  );
}

function CardHeader({
  je,
  balanced,
  drSum,
  crSum,
  isExported,
  tone,
}: {
  je: JE;
  balanced: boolean;
  drSum: number;
  crSum: number;
  isExported: boolean;
  tone: ReturnType<typeof scenarioTone>;
}) {
  return (
    <div className="px-5 py-3 flex items-start justify-between gap-3 border-b border-ink-100">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <ScenarioPill label={tone.label} bg={tone.pillBg} text={tone.pillText} />
          <span className="text-xs text-ink-400">·</span>
          <span className="text-xs font-mono text-ink-700" dir="ltr">
            {je.reference1}
          </span>
          <span className="text-xs text-ink-400">·</span>
          <span className="text-xs text-ink-600" dir="ltr">
            {je.document_date}
          </span>
          <span className="text-xs text-ink-400">·</span>
          <span className="text-xs text-ink-600" dir="ltr">
            {je.currency}
          </span>
        </div>
        {je.details && (
          <h3 className="text-sm font-semibold text-ink-900 mt-1 truncate">
            {je.details}
          </h3>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <BalanceIndicator balanced={balanced} drSum={drSum} crSum={crSum} />
        <StatusBadge status={je.status} />
        {je.invoice_id && (
          <a
            href={`#invoice-${je.invoice_id}`}
            className="p-1.5 text-ink-400 hover:text-accent-600 hover:bg-ink-50 rounded-md"
            title="פתח חשבונית מקור"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

/* =================== header fields =================== */

function HeaderFields({ je, disabled }: { je: JE; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function commit(field: string, value: string) {
    if (disabled) return;
    setError(null);
    const fd = new FormData();
    fd.set('jeId', je.id);
    // Always send current state of all fields so the server gets a complete picture
    fd.set(
      'transactionType',
      field === 'transactionType' ? value : je.transaction_type,
    );
    fd.set('reference1', field === 'reference1' ? value : je.reference1);
    fd.set('documentDate', field === 'documentDate' ? value : je.document_date);
    fd.set('valueDate', field === 'valueDate' ? value : je.value_date);
    fd.set('details', field === 'details' ? value : je.details);
    startTransition(async () => {
      const r = await updateJEHeaderAction(fd);
      if (!r.ok) {
        setError(r.error ?? 'שמירה נכשלה');
        return;
      }
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="px-5 py-4 bg-ink-50/40 border-b border-ink-100">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3">
        <InlineField
          label="סוג תנועה"
          name="transactionType"
          defaultValue={je.transaction_type}
          maxLength={3}
          disabled={disabled}
          onCommit={(v) => commit('transactionType', v)}
        />
        <InlineField
          label="אסמכתא"
          name="reference1"
          defaultValue={je.reference1}
          dir="ltr"
          monospace
          disabled={disabled}
          onCommit={(v) => commit('reference1', v)}
        />
        <InlineField
          label="תאריך חשבונית"
          name="documentDate"
          defaultValue={je.document_date}
          type="date"
          dir="ltr"
          disabled={disabled}
          onCommit={(v) => commit('documentDate', v)}
        />
        <InlineField
          label="תאריך ערך"
          name="valueDate"
          defaultValue={je.value_date}
          type="date"
          dir="ltr"
          disabled={disabled}
          onCommit={(v) => commit('valueDate', v)}
        />
        <InlineField
          label="פרטים"
          name="details"
          defaultValue={je.details}
          maxLength={22}
          disabled={disabled}
          onCommit={(v) => commit('details', v)}
        />
      </div>
      <SaveStatus pending={pending} error={error} savedAt={savedAt} />
    </div>
  );
}

/* =================== lines table =================== */

function LinesTable({
  je,
  lines,
  drSum,
  crSum,
  balanced,
  disabled,
}: {
  je: JE;
  lines: Line[];
  drSum: number;
  crSum: number;
  balanced: boolean;
  disabled: boolean;
}) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100">
            <th className="w-12 px-3 py-2 text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              #
            </th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              חשבון
            </th>
            <th className="w-32 px-3 py-2 text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              חובה
            </th>
            <th className="w-32 px-3 py-2 text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              זכות
            </th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              פרטי שורה
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <LineRow key={line.id} line={line} disabled={disabled} />
          ))}
          {!disabled && <AddLineRow jeId={je.id} />}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink-200 bg-ink-50/60">
            <td colSpan={2} className="px-3 py-3 text-xs text-ink-500 uppercase tracking-wider font-semibold">
              סך הכול
            </td>
            <td className="px-3 py-3 text-left tabular-nums font-semibold text-ink-900">
              {drSum.toFixed(2)}
            </td>
            <td className="px-3 py-3 text-left tabular-nums font-semibold text-ink-900">
              {crSum.toFixed(2)}
            </td>
            <td colSpan={2} className="px-3 py-3 text-right">
              {!balanced && (
                <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
                  <AlertCircle size={12} />
                  הפרש {(drSum - crSum).toFixed(2)}
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LineRow({ line, disabled }: { line: Line; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(field: 'account' | 'debit' | 'credit' | 'details', value: string) {
    if (disabled) return;
    setError(null);
    const fd = new FormData();
    fd.set('lineId', line.id);
    fd.set(field, value);
    startTransition(async () => {
      const r = await updateLineAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function remove() {
    if (!confirm('למחוק את השורה?')) return;
    setError(null);
    const fd = new FormData();
    fd.set('lineId', line.id);
    startTransition(async () => {
      const r = await removeLineAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  return (
    <tr className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40 group">
      <td className="px-3 py-2 text-xs text-ink-400 tabular-nums">
        {line.line_no}
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          defaultValue={line.account}
          dir="ltr"
          monospace
          disabled={disabled}
          onCommit={(v) => commit('account', v)}
          maxLength={15}
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          defaultValue={line.debit > 0 ? String(line.debit) : ''}
          dir="ltr"
          inputMode="decimal"
          align="left"
          disabled={disabled}
          onCommit={(v) => commit('debit', v || '0')}
          placeholder="—"
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          defaultValue={line.credit > 0 ? String(line.credit) : ''}
          dir="ltr"
          inputMode="decimal"
          align="left"
          disabled={disabled}
          onCommit={(v) => commit('credit', v || '0')}
          placeholder="—"
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          defaultValue={line.details ?? ''}
          disabled={disabled}
          onCommit={(v) => commit('details', v)}
          placeholder="—"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        {pending ? (
          <Loader2 size={12} className="animate-spin text-ink-400 mx-auto" />
        ) : disabled ? null : (
          <button
            onClick={remove}
            className="text-ink-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
            title="מחק שורה"
          >
            <Trash2 size={13} />
          </button>
        )}
        {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
      </td>
    </tr>
  );
}

function AddLineRow({ jeId }: { jeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function add(formData: FormData) {
    setError(null);
    formData.set('jeId', jeId);
    startTransition(async () => {
      const r = await addLineAction(formData);
      if (!r.ok) {
        setError(r.error ?? 'שגיאה');
        return;
      }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <tr className="border-b border-ink-100 last:border-0">
        <td colSpan={6} className="px-3 py-2">
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-accent-600 hover:text-accent-500 flex items-center gap-1"
          >
            <Plus size={12} />
            הוסף שורה
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink-100 last:border-0 bg-accent-500/5">
      <td className="px-3 py-2 text-xs text-accent-600 font-medium">חדש</td>
      <td colSpan={5} className="px-2 py-2">
        <form action={add} className="flex gap-2 items-center flex-wrap">
          <input
            name="account"
            placeholder="חשבון"
            dir="ltr"
            required
            maxLength={15}
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <input
            name="debit"
            placeholder="חובה"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm tabular-nums w-24 text-left focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <input
            name="credit"
            placeholder="זכות"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm tabular-nums w-24 text-left focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <input
            name="details"
            placeholder="פרטים (אופציונלי)"
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 bg-accent-600 text-white text-sm rounded-md disabled:opacity-50 hover:bg-accent-500"
          >
            {pending ? '...' : 'הוסף'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-2 py-1.5 text-ink-600 text-sm hover:bg-ink-50 rounded-md"
          >
            ביטול
          </button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </form>
      </td>
    </tr>
  );
}

/* =================== building blocks =================== */

function InlineField({
  label,
  name,
  defaultValue,
  type,
  dir,
  monospace,
  maxLength,
  disabled,
  onCommit,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  dir?: 'ltr' | 'rtl';
  monospace?: boolean;
  maxLength?: number;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <label
        htmlFor={`${name}-${defaultValue}`}
        className="block text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1.5"
      >
        {label}
      </label>
      <input
        id={`${name}-${defaultValue}`}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== defaultValue) onCommit(value);
        }}
        type={type}
        dir={dir}
        maxLength={maxLength}
        disabled={disabled}
        className={`w-full px-2.5 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-ink-50 disabled:text-ink-500 ${
          monospace ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

function CellInput({
  defaultValue,
  onCommit,
  dir,
  monospace,
  inputMode,
  align,
  maxLength,
  placeholder,
  disabled,
}: {
  defaultValue: string;
  onCommit: (v: string) => void;
  dir?: 'ltr' | 'rtl';
  monospace?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text';
  align?: 'left' | 'right';
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== defaultValue) onCommit(value);
      }}
      dir={dir}
      inputMode={inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-2 py-1 border border-transparent rounded-md text-sm bg-transparent
        hover:border-ink-200 focus:bg-white focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20
        disabled:hover:border-transparent disabled:cursor-text
        ${align === 'left' ? 'text-left tabular-nums' : ''}
        ${monospace ? 'font-mono' : ''}`}
    />
  );
}

function SaveStatus({
  pending,
  error,
  savedAt,
}: {
  pending: boolean;
  error: string | null;
  savedAt: number | null;
}) {
  if (error) {
    return (
      <div className="text-xs text-red-700 mt-2 flex items-center gap-1">
        <AlertCircle size={11} /> {error}
      </div>
    );
  }
  if (pending) {
    return (
      <div className="text-xs text-ink-500 mt-2 flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> שומר...
      </div>
    );
  }
  if (savedAt && Date.now() - savedAt < 2000) {
    return (
      <div className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
        <CheckCircle2 size={11} /> נשמר
      </div>
    );
  }
  return null;
}

function ScenarioPill({
  label,
  bg,
  text,
}: {
  label: string;
  bg: string;
  text: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${bg} ${text}`}
      dir="ltr"
    >
      {label}
    </span>
  );
}

function BalanceIndicator({
  balanced,
  drSum,
  crSum,
}: {
  balanced: boolean;
  drSum: number;
  crSum: number;
}) {
  if (drSum === 0 && crSum === 0) return null;
  if (balanced) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
        <CheckCircle2 size={11} />
        מאוזן
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-medium">
      <AlertCircle size={11} />
      לא מאוזן
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'טיוטה' },
    validated: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'אומת' },
    approved: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'מאושר' },
    exported: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'יוצא' },
    error: { bg: 'bg-red-50', text: 'text-red-700', label: 'שגיאה' },
  };
  const c = map[status] ?? { bg: 'bg-ink-100', text: 'text-ink-700', label: status };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function scenarioTone(scenario: string | null): {
  label: string;
  bar: string;
  pillBg: string;
  pillText: string;
} {
  const s = (scenario ?? 'STANDARD').toUpperCase();
  if (s === 'STANDARD' || s === 'WITH_DISCOUNT' || s === 'AGGREGATOR') {
    return {
      label: s,
      bar: 'bg-emerald-300',
      pillBg: 'bg-emerald-100',
      pillText: 'text-emerald-800',
    };
  }
  if (s === 'CREDIT_NOTE') {
    return {
      label: s,
      bar: 'bg-rose-300',
      pillBg: 'bg-rose-100',
      pillText: 'text-rose-800',
    };
  }
  if (s === 'MISSING_ALLOCATION') {
    return {
      label: s,
      bar: 'bg-red-400',
      pillBg: 'bg-red-100',
      pillText: 'text-red-800',
    };
  }
  if (s === 'IMMEDIATE_PAYMENT') {
    return {
      label: s,
      bar: 'bg-blue-300',
      pillBg: 'bg-blue-100',
      pillText: 'text-blue-800',
    };
  }
  if (s === 'FOREIGN_CURRENCY') {
    return {
      label: s,
      bar: 'bg-cyan-300',
      pillBg: 'bg-cyan-100',
      pillText: 'text-cyan-800',
    };
  }
  // Anything else (allocation, withholding, mixed deduction, multi-expense, cost center)
  return {
    label: s,
    bar: 'bg-amber-300',
    pillBg: 'bg-amber-100',
    pillText: 'text-amber-800',
  };
}
