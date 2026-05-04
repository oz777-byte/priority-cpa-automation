'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  updateJEHeaderAction,
  updateLineAction,
  removeLineAction,
} from './actions';

/**
 * Priority-style flat journal entries table.
 *
 * Convention from Priority's "תנועות יומן" form:
 *   - One row per LINE (not per JE)
 *   - All fields visible per row including JE-level headers
 *     (סוג תנועה, אסמכתא 1/2, תאריכים, פרטים) — denormalized for display
 *   - User scrolls HORIZONTALLY to see all columns (no responsive collapse)
 *   - Lines belonging to the same JE are visually grouped (alternating
 *     row backgrounds), with JE-level fields editable only on the first line
 *   - Balance status shown per JE (red row when unbalanced)
 *   - Sticky # column on the right for orientation while scrolling
 *
 * Sources: Priority release notes 19.1, erpil.co.il wizards, h-erp MOVEIN spec.
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

interface FlatRow {
  je: JE;
  line: Line;
  isFirstLineOfJE: boolean;
  isLastLineOfJE: boolean;
  drSum: number;
  crSum: number;
  balanced: boolean;
  jeRowIndex: number;
}

export function JEEditorPanel({
  jes,
  accountNames,
}: {
  jes: JEWithLines[];
  accountNames: Record<string, string>;
}) {
  // Flatten — one row per line. Pre-compute per-JE sums + first/last indicators.
  const rows: FlatRow[] = [];
  jes.forEach(({ je, lines }, jeIndex) => {
    const drSum = lines.reduce((s, l) => s + Number(l.debit), 0);
    const crSum = lines.reduce((s, l) => s + Number(l.credit), 0);
    const balanced = Math.abs(drSum - crSum) <= 0.05;
    lines.forEach((line, i) => {
      rows.push({
        je,
        line,
        isFirstLineOfJE: i === 0,
        isLastLineOfJE: i === lines.length - 1,
        drSum,
        crSum,
        balanced,
        jeRowIndex: jeIndex,
      });
    });
  });

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-ink-300 p-8 text-center text-sm text-ink-500">
        אין פקודות יומן בתצוגה זו.
      </div>
    );
  }

  const hasFx = rows.some((r) => r.je.currency !== 'ILS');

  return (
    <div className="border border-ink-300 bg-white shadow-sm">
      {/* Top bar with summary */}
      <div className="px-3 py-2 bg-gradient-to-l from-ink-100 to-ink-50 border-b border-ink-300 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-ink-800">תנועות יומן</span>
          <span className="text-ink-500">·</span>
          <span className="text-ink-600">{jes.length} פקודות</span>
          <span className="text-ink-500">·</span>
          <span className="text-ink-600">{rows.length} שורות</span>
        </div>
        <div className="text-[10px] text-ink-500">
          ↔ ניתן לגלול אופקית לראות את כל העמודות
        </div>
      </div>

      <div className="overflow-x-auto" dir="rtl">
        <table className="text-xs border-collapse" style={{ minWidth: '1800px' }}>
          <thead>
            <tr className="bg-ink-100 border-b-2 border-ink-300 text-[10px] uppercase tracking-wider text-ink-700 font-semibold">
              <Th width="50px" sticky>#</Th>
              <Th width="80px">מס׳ תנועה</Th>
              <Th width="60px">סוג</Th>
              <Th width="110px">אסמכתא 1</Th>
              <Th width="100px">אסמכתא 2</Th>
              <Th width="100px">ת. אסמכתא</Th>
              <Th width="100px">ת. ערך</Th>
              <Th width="90px">חשבון</Th>
              <Th width="180px">שם חשבון</Th>
              <Th width="110px" align="left">חובה</Th>
              <Th width="110px" align="left">זכות</Th>
              {hasFx && (
                <>
                  <Th width="100px" align="left">חובה מט&quot;ח</Th>
                  <Th width="100px" align="left">זכות מט&quot;ח</Th>
                  <Th width="60px">מטבע</Th>
                </>
              )}
              <Th width="110px">מרכז עלות</Th>
              <Th width="180px">פרטים (כותרת)</Th>
              <Th width="180px">פרטי שורה</Th>
              <Th width="110px">סטטוס</Th>
              <Th width="80px">תרחיש</Th>
              <Th width="40px">{' '}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FlatLineRow
                key={row.line.id}
                row={row}
                accountNames={accountNames}
                showFx={hasFx}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom summary */}
      <div className="px-3 py-2 bg-ink-50 border-t-2 border-ink-300 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-ink-700 font-semibold">סיכום:</span>
          <span className="text-ink-600">
            סה״כ חובה{' '}
            <span dir="ltr" className="tabular-nums font-semibold text-ink-900">
              {rows.reduce((s, r) => s + Number(r.line.debit), 0).toFixed(2)}
            </span>
          </span>
          <span className="text-ink-600">
            סה״כ זכות{' '}
            <span dir="ltr" className="tabular-nums font-semibold text-ink-900">
              {rows.reduce((s, r) => s + Number(r.line.credit), 0).toFixed(2)}
            </span>
          </span>
        </div>
        <div>
          {jes.every((j) => {
            const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
            const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
            return Math.abs(dr - cr) <= 0.05;
          }) ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 size={11} />
              כל הפקודות מאוזנות
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-700 font-medium">
              <AlertCircle size={11} />
              {jes.filter((j) => {
                const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
                const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
                return Math.abs(dr - cr) > 0.05;
              }).length}{' '}
              פקודות לא מאוזנות
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* =================== one-line row =================== */

function FlatLineRow({
  row,
  accountNames,
  showFx,
}: {
  row: FlatRow;
  accountNames: Record<string, string>;
  showFx: boolean;
}) {
  const { je, line, isFirstLineOfJE, isLastLineOfJE, balanced, jeRowIndex } = row;
  const isExported = je.status === 'exported';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountValue, setAccountValue] = useState(line.account);

  // JE-grouping background — alternate per JE for visual scanning.
  const groupBg = jeRowIndex % 2 === 0 ? 'bg-white' : 'bg-ink-50/40';
  const unbalancedBg = !balanced ? 'bg-red-50/60' : groupBg;
  const borderTop = isFirstLineOfJE ? 'border-t-2 border-t-ink-300' : '';
  const borderBottom = isLastLineOfJE
    ? 'border-b border-b-ink-200'
    : 'border-b border-b-ink-100';

  function commitHeader(field: string, value: string) {
    if (isExported) return;
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
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function commitLine(
    field: 'account' | 'debit' | 'credit' | 'details',
    value: string,
  ) {
    if (isExported) return;
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

  const numberDisplay =
    je.je_number != null
      ? isExported
        ? String(je.je_number)
        : `T-${je.je_number}`
      : '—';

  return (
    <tr className={`${unbalancedBg} ${borderTop} ${borderBottom} hover:bg-amber-50/40 group`}>
      <Td sticky align="center" className="text-ink-500 tabular-nums">
        {line.line_no}
      </Td>

      <Td align="center" className="font-mono tabular-nums">
        {isFirstLineOfJE ? (
          <span
            className={`text-xs ${isExported ? 'text-ink-900 font-bold' : 'text-amber-700 font-semibold'}`}
            dir="ltr"
            title={isExported ? 'מספר סופי' : 'מספר זמני'}
          >
            {numberDisplay}
          </span>
        ) : (
          <span className="text-ink-300">·</span>
        )}
      </Td>

      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.transaction_type}
            disabled={isExported}
            onCommit={(v) => commitHeader('transactionType', v)}
            align="center"
            maxLength={3}
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>
      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.reference1}
            dir="ltr"
            monospace
            disabled={isExported}
            onCommit={(v) => commitHeader('reference1', v)}
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>
      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.reference2 ?? ''}
            dir="ltr"
            monospace
            disabled={isExported}
            onCommit={(v) => commitHeader('reference2', v)}
            placeholder="—"
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>
      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.document_date}
            type="date"
            dir="ltr"
            disabled={isExported}
            onCommit={(v) => commitHeader('documentDate', v)}
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>
      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.value_date}
            type="date"
            dir="ltr"
            disabled={isExported}
            onCommit={(v) => commitHeader('valueDate', v)}
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>

      <Td>
        <CellInput
          defaultValue={line.account}
          onValueChange={setAccountValue}
          dir="ltr"
          monospace
          disabled={isExported}
          onCommit={(v) => commitLine('account', v)}
          maxLength={15}
        />
      </Td>

      <Td className="text-ink-700">
        <span title={accountValue} className="truncate block">
          {accountNames[accountValue] ?? '—'}
        </span>
      </Td>

      <Td align="left" className="tabular-nums" dir="ltr">
        <CellInput
          defaultValue={line.debit > 0 ? String(line.debit) : ''}
          dir="ltr"
          inputMode="decimal"
          align="left"
          disabled={isExported}
          onCommit={(v) => commitLine('debit', v || '0')}
          placeholder="—"
        />
      </Td>

      <Td align="left" className="tabular-nums" dir="ltr">
        <CellInput
          defaultValue={line.credit > 0 ? String(line.credit) : ''}
          dir="ltr"
          inputMode="decimal"
          align="left"
          disabled={isExported}
          onCommit={(v) => commitLine('credit', v || '0')}
          placeholder="—"
        />
      </Td>

      {showFx && (
        <>
          <Td align="left" className="tabular-nums text-ink-700" dir="ltr">
            {line.debit_fx > 0 ? line.debit_fx.toFixed(2) : '—'}
          </Td>
          <Td align="left" className="tabular-nums text-ink-700" dir="ltr">
            {line.credit_fx > 0 ? line.credit_fx.toFixed(2) : '—'}
          </Td>
          <Td align="center" className="font-mono text-ink-700" dir="ltr">
            {isFirstLineOfJE ? (
              je.currency
            ) : (
              <span className="text-ink-300">·</span>
            )}
          </Td>
        </>
      )}

      <Td className="font-mono text-ink-700" dir="ltr">
        {line.cost_center || '—'}
      </Td>

      <Td>
        {isFirstLineOfJE ? (
          <CellInput
            defaultValue={je.details}
            disabled={isExported}
            onCommit={(v) => commitHeader('details', v)}
            placeholder="—"
            maxLength={60}
          />
        ) : (
          <span className="text-ink-300 text-xs px-2">·</span>
        )}
      </Td>

      <Td>
        <CellInput
          defaultValue={line.details ?? ''}
          disabled={isExported}
          onCommit={(v) => commitLine('details', v)}
          placeholder="—"
        />
      </Td>

      <Td align="center">
        {isFirstLineOfJE ? (
          <StatusBadge status={je.status} />
        ) : (
          <span className="text-ink-300">·</span>
        )}
      </Td>

      <Td align="center" className="font-mono text-[10px]">
        {isFirstLineOfJE ? (
          <span
            dir="ltr"
            className="px-1.5 py-0.5 bg-white border border-ink-200 text-ink-700 rounded"
          >
            {je.scenario ?? '—'}
          </span>
        ) : (
          <span className="text-ink-300">·</span>
        )}
      </Td>

      <Td align="center">
        {isExported ? (
          <Lock size={11} className="text-purple-600 mx-auto" aria-label="נעול" />
        ) : pending ? (
          <Loader2 size={11} className="animate-spin text-ink-400 mx-auto" />
        ) : (
          <button
            type="button"
            onClick={remove}
            className="text-ink-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition mx-auto block"
            title="מחק שורה"
          >
            <Trash2 size={12} />
          </button>
        )}
        {error && <div className="text-[9px] text-red-700 mt-0.5">{error}</div>}
      </Td>
    </tr>
  );
}

/* =================== building blocks =================== */

function Th({
  width,
  align,
  sticky,
  children,
}: {
  width?: string;
  align?: 'right' | 'left' | 'center';
  sticky?: boolean;
  children: React.ReactNode;
}) {
  const alignClass =
    align === 'left'
      ? 'text-left'
      : align === 'center'
        ? 'text-center'
        : 'text-right';
  const stickyClass = sticky
    ? 'sticky right-0 bg-ink-100 z-10 border-l border-ink-300'
    : '';
  return (
    <th
      className={`${alignClass} ${stickyClass} px-2 py-2 whitespace-nowrap`}
      style={width ? { width, minWidth: width } : undefined}
    >
      {children}
    </th>
  );
}

function Td({
  align,
  sticky,
  className,
  dir,
  children,
}: {
  align?: 'right' | 'left' | 'center';
  sticky?: boolean;
  className?: string;
  dir?: 'ltr' | 'rtl';
  children: React.ReactNode;
}) {
  const alignClass =
    align === 'left'
      ? 'text-left'
      : align === 'center'
        ? 'text-center'
        : 'text-right';
  const stickyClass = sticky
    ? 'sticky right-0 z-10 border-l border-ink-200 bg-inherit'
    : '';
  return (
    <td
      className={`${alignClass} ${stickyClass} px-2 py-1 whitespace-nowrap ${className ?? ''}`}
      dir={dir}
    >
      {children}
    </td>
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
  type,
}: {
  defaultValue: string;
  onCommit: (v: string) => void;
  onValueChange?: (v: string) => void;
  dir?: 'ltr' | 'rtl';
  monospace?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text';
  align?: 'left' | 'right' | 'center';
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const alignClass =
    align === 'left'
      ? 'text-left tabular-nums'
      : align === 'center'
        ? 'text-center'
        : '';
  return (
    <input
      value={value}
      type={type}
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
      className={`w-full px-1.5 py-0.5 border border-transparent text-xs bg-transparent
        hover:border-ink-300 hover:bg-white focus:bg-white focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30
        disabled:hover:border-transparent disabled:cursor-text
        ${alignClass}
        ${monospace ? 'font-mono' : ''}`}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { bg: string; text: string; border: string; label: string }
  > = {
    draft: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      label: 'טיוטה',
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
      label: 'יוצא',
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
      className={`inline-block px-1.5 py-0 rounded text-[9px] font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      {c.label}
    </span>
  );
}
