'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  updateJEHeaderAction,
  updateLineAction,
  addLineAction,
  removeLineAction,
} from './actions';

/**
 * Priority-style JE editor.
 *
 * Visual conventions taken from Priority ERP's "תנועות יומן" form:
 *   - Header section at top with field grid (סוג תנועה, אסמכתא 1/2,
 *     תאריך אסמכתא, תאריך ערך, מטבע, פרטים)
 *   - Lines table below with columns:
 *     # · חשבון · שם חשבון · חובה · זכות · חובה מט"ח · זכות מט"ח · מרכז עלות · פרטים
 *   - Bottom totals row: סה"כ חובה / סה"כ זכות / מאזן indicator
 *   - JE number shown as "T-{number}" while draft, plain "{number}" when final
 *   - Light grey-on-white aesthetic with thin borders, sources from Priority
 *     release-notes screenshots and forum descriptions.
 */

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
  je_number: number | null;
}

interface Line {
  id: string;
  je_id: string;
  line_no: number;
  account: string;
  debit: number;
  credit: number;
  debit_fx: number;
  credit_fx: number;
  cost_center: string | null;
  details: string | null;
}

interface JEWithLines {
  je: JE;
  lines: Line[];
}

export function JEEditorPanel({
  jes,
  accountNames,
}: {
  jes: JEWithLines[];
  accountNames: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      {jes.map((item) => (
        <JECard
          key={item.je.id}
          je={item.je}
          lines={item.lines}
          accountNames={accountNames}
        />
      ))}
    </div>
  );
}

/* =================== card =================== */

function JECard({
  je,
  lines,
  accountNames,
}: {
  je: JE;
  lines: Line[];
  accountNames: Record<string, string>;
}) {
  const drSum = lines.reduce((s, l) => s + Number(l.debit), 0);
  const crSum = lines.reduce((s, l) => s + Number(l.credit), 0);
  const drFxSum = lines.reduce((s, l) => s + Number(l.debit_fx), 0);
  const crFxSum = lines.reduce((s, l) => s + Number(l.credit_fx), 0);
  const balanced = Math.abs(drSum - crSum) <= 0.05;
  const isExported = je.status === 'exported';
  const isFx = je.currency !== 'ILS';
  const hasCostCenters = lines.some((l) => l.cost_center && l.cost_center.length > 0);

  return (
    <article className="bg-white border border-ink-300 shadow-sm overflow-hidden">
      <CardHeader je={je} balanced={balanced} isExported={isExported} />
      <HeaderFields je={je} disabled={isExported} />
      <LinesTable
        je={je}
        lines={lines}
        drSum={drSum}
        crSum={crSum}
        drFxSum={drFxSum}
        crFxSum={crFxSum}
        balanced={balanced}
        disabled={isExported}
        accountNames={accountNames}
        showFx={isFx}
        showCostCenter={hasCostCenters || !isExported}
      />
    </article>
  );
}

function CardHeader({
  je,
  balanced,
  isExported,
}: {
  je: JE;
  balanced: boolean;
  isExported: boolean;
}) {
  // Priority displays JE number with "T" prefix when temporary (draft).
  const numberDisplay = je.je_number != null
    ? isExported
      ? `${je.je_number}`
      : `T-${je.je_number}`
    : '—';

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-l from-ink-100 to-ink-50 border-b border-ink-300">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            פקודת יומן
          </span>
          <span
            className={`text-sm font-mono font-bold tabular-nums ${
              isExported ? 'text-ink-900' : 'text-amber-700'
            }`}
            dir="ltr"
            title={isExported ? 'מספר סופי' : 'מספר זמני (טרם יוצא)'}
          >
            {numberDisplay}
          </span>
        </div>
        {je.scenario && (
          <>
            <span className="text-ink-300">|</span>
            <code
              className="text-[10px] font-mono px-1.5 py-0.5 bg-white border border-ink-200 text-ink-700 rounded"
              dir="ltr"
            >
              {je.scenario}
            </code>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <BalanceIndicator balanced={balanced} />
        <StatusBadge status={je.status} />
        {isExported && (
          <Lock size={12} className="text-purple-600" aria-label="נעול — יוצא" />
        )}
        {je.invoice_id && (
          <a
            href={`/dashboard/c/${''}#invoice-${je.invoice_id}`}
            className="p-1 text-ink-500 hover:text-accent-600 hover:bg-white rounded"
            title="פתח חשבונית מקור"
          >
            <ExternalLink size={12} />
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
    fd.set('transactionType', field === 'transactionType' ? value : je.transaction_type);
    fd.set('reference1', field === 'reference1' ? value : je.reference1);
    if (field === 'reference2' || je.reference2) {
      fd.set('reference2', field === 'reference2' ? value : je.reference2 ?? '');
    }
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
    <div className="px-4 py-3 bg-ink-50/50 border-b border-ink-200">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-x-3 gap-y-2">
        <PriorityField
          label="סוג תנועה"
          name="transactionType"
          defaultValue={je.transaction_type}
          maxLength={3}
          disabled={disabled}
          align="center"
          onCommit={(v) => commit('transactionType', v)}
        />
        <PriorityField
          label="אסמכתא 1"
          name="reference1"
          defaultValue={je.reference1}
          dir="ltr"
          monospace
          disabled={disabled}
          onCommit={(v) => commit('reference1', v)}
        />
        <PriorityField
          label="אסמכתא 2"
          name="reference2"
          defaultValue={je.reference2 ?? ''}
          dir="ltr"
          monospace
          disabled={disabled}
          placeholder="—"
          onCommit={(v) => commit('reference2', v)}
        />
        <PriorityField
          label="תאריך אסמכתא"
          name="documentDate"
          defaultValue={je.document_date}
          type="date"
          dir="ltr"
          disabled={disabled}
          onCommit={(v) => commit('documentDate', v)}
        />
        <PriorityField
          label="תאריך ערך"
          name="valueDate"
          defaultValue={je.value_date}
          type="date"
          dir="ltr"
          disabled={disabled}
          onCommit={(v) => commit('valueDate', v)}
        />
        <PriorityField
          label="מטבע"
          name="currency"
          defaultValue={je.currency}
          dir="ltr"
          monospace
          disabled
          align="center"
          onCommit={() => {
            /* currency edits not supported via this header action */
          }}
        />
      </div>
      <div className="grid grid-cols-1 mt-2">
        <PriorityField
          label="פרטים"
          name="details"
          defaultValue={je.details}
          maxLength={60}
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
  drFxSum,
  crFxSum,
  balanced,
  disabled,
  accountNames,
  showFx,
  showCostCenter,
}: {
  je: JE;
  lines: Line[];
  drSum: number;
  crSum: number;
  drFxSum: number;
  crFxSum: number;
  balanced: boolean;
  disabled: boolean;
  accountNames: Record<string, string>;
  showFx: boolean;
  showCostCenter: boolean;
}) {
  const colCount =
    7 + (showFx ? 2 : 0) + (showCostCenter ? 1 : 0) + (disabled ? 0 : 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink-100/70">
          <tr className="border-b-2 border-ink-300 text-[10px] uppercase tracking-wider text-ink-700 font-semibold">
            <Th width="w-10" align="center">
              #
            </Th>
            <Th width="w-28" align="right">
              חשבון
            </Th>
            <Th align="right">שם חשבון</Th>
            <Th width="w-28" align="left">
              חובה
            </Th>
            <Th width="w-28" align="left">
              זכות
            </Th>
            {showFx && (
              <>
                <Th width="w-24" align="left">
                  חובה מט&quot;ח
                </Th>
                <Th width="w-24" align="left">
                  זכות מט&quot;ח
                </Th>
              </>
            )}
            {showCostCenter && (
              <Th width="w-28" align="right">
                מרכז עלות
              </Th>
            )}
            <Th align="right">פרטי שורה</Th>
            {!disabled && <Th width="w-10" align="center">{' '}</Th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              disabled={disabled}
              accountNames={accountNames}
              showFx={showFx}
              showCostCenter={showCostCenter}
            />
          ))}
          {!disabled && <AddLineRow jeId={je.id} colSpan={colCount - 1} />}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-300 bg-ink-50">
            <td colSpan={3} className="px-3 py-2 text-xs text-ink-700 font-bold uppercase tracking-wider text-right">
              סה&quot;כ
            </td>
            <td className="px-3 py-2 text-left tabular-nums font-bold text-ink-900" dir="ltr">
              {drSum.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-left tabular-nums font-bold text-ink-900" dir="ltr">
              {crSum.toFixed(2)}
            </td>
            {showFx && (
              <>
                <td className="px-3 py-2 text-left tabular-nums font-bold text-ink-900" dir="ltr">
                  {drFxSum.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-left tabular-nums font-bold text-ink-900" dir="ltr">
                  {crFxSum.toFixed(2)}
                </td>
              </>
            )}
            {showCostCenter && <td className="px-3 py-2"></td>}
            <td className="px-3 py-2 text-right" colSpan={disabled ? 1 : 2}>
              {balanced ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 size={12} />
                  מאוזן
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
                  <AlertCircle size={12} />
                  הפרש <span dir="ltr" className="tabular-nums">{(drSum - crSum).toFixed(2)}</span>
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  width,
  align,
  children,
}: {
  width?: string;
  align: 'right' | 'left' | 'center';
  children: React.ReactNode;
}) {
  const alignClass =
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';
  return (
    <th className={`${width ?? ''} px-3 py-2 ${alignClass}`}>{children}</th>
  );
}

function LineRow({
  line,
  disabled,
  accountNames,
  showFx,
  showCostCenter,
}: {
  line: Line;
  disabled: boolean;
  accountNames: Record<string, string>;
  showFx: boolean;
  showCostCenter: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountValue, setAccountValue] = useState(line.account);

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
    <tr className="border-b border-ink-100 last:border-0 hover:bg-amber-50/30 group">
      <td className="px-3 py-1.5 text-xs text-ink-500 tabular-nums text-center">
        {line.line_no}
      </td>
      <td className="px-2 py-1">
        <CellInput
          defaultValue={line.account}
          onValueChange={setAccountValue}
          dir="ltr"
          monospace
          disabled={disabled}
          onCommit={(v) => commit('account', v)}
          maxLength={15}
        />
      </td>
      <td className="px-2 py-1.5 text-xs text-ink-700">
        <span title={accountValue}>{accountNames[accountValue] ?? '—'}</span>
      </td>
      <td className="px-2 py-1">
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
      <td className="px-2 py-1">
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
      {showFx && (
        <>
          <td className="px-2 py-1.5 text-left tabular-nums text-xs text-ink-700" dir="ltr">
            {line.debit_fx > 0 ? line.debit_fx.toFixed(2) : '—'}
          </td>
          <td className="px-2 py-1.5 text-left tabular-nums text-xs text-ink-700" dir="ltr">
            {line.credit_fx > 0 ? line.credit_fx.toFixed(2) : '—'}
          </td>
        </>
      )}
      {showCostCenter && (
        <td className="px-2 py-1.5 text-xs text-ink-700 font-mono" dir="ltr">
          {line.cost_center || '—'}
        </td>
      )}
      <td className="px-2 py-1">
        <CellInput
          defaultValue={line.details ?? ''}
          disabled={disabled}
          onCommit={(v) => commit('details', v)}
          placeholder="—"
        />
      </td>
      {!disabled && (
        <td className="px-2 py-1 text-center">
          {pending ? (
            <Loader2 size={11} className="animate-spin text-ink-400 mx-auto" />
          ) : (
            <button
              onClick={remove}
              className="text-ink-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
              title="מחק שורה"
              type="button"
            >
              <Trash2 size={12} />
            </button>
          )}
          {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
        </td>
      )}
    </tr>
  );
}

function AddLineRow({ jeId, colSpan }: { jeId: string; colSpan: number }) {
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
        <td colSpan={colSpan + 1} className="px-3 py-1.5">
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-accent-600 hover:text-accent-500 flex items-center gap-1"
            type="button"
          >
            <Plus size={11} />
            הוסף שורה
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink-100 last:border-0 bg-amber-50/40">
      <td className="px-3 py-2 text-xs text-amber-700 font-medium">חדש</td>
      <td colSpan={colSpan} className="px-2 py-2">
        <form action={add} className="flex gap-2 items-center flex-wrap">
          <input
            name="account"
            placeholder="חשבון"
            dir="ltr"
            required
            maxLength={15}
            className="px-2 py-1 border border-ink-300 text-sm font-mono w-32 focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
          />
          <input
            name="debit"
            placeholder="חובה"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1 border border-ink-300 text-sm tabular-nums w-24 text-left focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
          />
          <input
            name="credit"
            placeholder="זכות"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1 border border-ink-300 text-sm tabular-nums w-24 text-left focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
          />
          <input
            name="details"
            placeholder="פרטים (אופציונלי)"
            className="px-2 py-1 border border-ink-300 text-sm flex-1 min-w-[120px] focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1 bg-accent-600 text-white text-sm disabled:opacity-50 hover:bg-accent-500"
          >
            {pending ? '...' : 'הוסף'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-2 py-1 text-ink-600 text-sm hover:bg-ink-50"
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

function PriorityField({
  label,
  name,
  defaultValue,
  type,
  dir,
  monospace,
  maxLength,
  disabled,
  placeholder,
  align,
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
  placeholder?: string;
  align?: 'center';
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const alignClass = align === 'center' ? 'text-center' : '';
  return (
    <div>
      <label
        htmlFor={`${name}-${defaultValue}`}
        className="block text-[10px] text-ink-600 font-medium mb-0.5"
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
        placeholder={placeholder}
        className={`w-full px-2 py-1 border border-ink-300 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500 disabled:bg-ink-100 disabled:text-ink-600 disabled:cursor-not-allowed ${
          monospace ? 'font-mono' : ''
        } ${alignClass}`}
      />
    </div>
  );
}

function CellInput({
  defaultValue,
  onCommit,
  onValueChange,
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
  onValueChange?: (v: string) => void;
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
      onChange={(e) => {
        setValue(e.target.value);
        onValueChange?.(e.target.value);
      }}
      onBlur={() => {
        if (value !== defaultValue) onCommit(value);
      }}
      dir={dir}
      inputMode={inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-2 py-0.5 border border-transparent text-sm bg-transparent
        hover:border-ink-300 hover:bg-white focus:bg-white focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30
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

function BalanceIndicator({ balanced }: { balanced: boolean }) {
  if (balanced) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">
        <CheckCircle2 size={10} />
        מאוזן
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-medium">
      <AlertCircle size={10} />
      לא מאוזן
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; border: string; label: string }> = {
    draft: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      label: 'טיוטה (T)',
    },
    validated: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      label: 'אומת',
    },
    approved: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      label: 'מאושר',
    },
    exported: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      label: 'יוצא לפריוריטי',
    },
    error: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      label: 'שגיאה',
    },
  };
  const c = map[status] ?? {
    bg: 'bg-ink-50',
    text: 'text-ink-700',
    border: 'border-ink-200',
    label: status,
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      {c.label}
    </span>
  );
}
