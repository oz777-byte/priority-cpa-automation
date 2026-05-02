'use client';

import { useState, useTransition } from 'react';
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
    <div className="space-y-6">
      {jes.map((item) => (
        <JECard key={item.je.id} je={item.je} lines={item.lines} />
      ))}
    </div>
  );
}

function JECard({ je, lines }: { je: JE; lines: Line[] }) {
  const drSum = lines.reduce((s, l) => s + Number(l.debit), 0);
  const crSum = lines.reduce((s, l) => s + Number(l.credit), 0);
  const balanced = Math.abs(drSum - crSum) <= 0.05;

  return (
    <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
      <JEHeader je={je} balanced={balanced} drSum={drSum} crSum={crSum} />
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-ink-600 border-b border-ink-200">
          <tr>
            <th className="text-right p-3 font-medium w-12">#</th>
            <th className="text-right p-3 font-medium">חשבון</th>
            <th className="text-right p-3 font-medium w-32">חובה</th>
            <th className="text-right p-3 font-medium w-32">זכות</th>
            <th className="text-right p-3 font-medium">פרטי שורה (אופציונלי)</th>
            <th className="text-right p-3 font-medium w-12"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <LineRow key={line.id} line={line} />
          ))}
          <AddLineRow jeId={je.id} />
        </tbody>
        <tfoot className="border-t-2 border-ink-200 bg-ink-50">
          <tr>
            <td colSpan={2} className="p-3 text-ink-600 text-xs">סך</td>
            <td className="p-3 tabular-nums font-semibold">{drSum.toFixed(2)}</td>
            <td className="p-3 tabular-nums font-semibold">{crSum.toFixed(2)}</td>
            <td colSpan={2} className="p-3">
              {!balanced && (
                <span className="text-xs text-red-700">
                  לא מאוזן (הפרש {(drSum - crSum).toFixed(2)})
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function JEHeader({
  je,
  balanced,
  drSum,
  crSum,
}: {
  je: JE;
  balanced: boolean;
  drSum: number;
  crSum: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(formData: FormData) {
    setError(null);
    formData.set('jeId', je.id);
    start(async () => {
      const r = await updateJEHeaderAction(formData);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  return (
    <div className="px-5 py-4 border-b border-ink-200">
      <form action={save} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <FieldInput
          name="transactionType"
          label="סוג תנועה"
          defaultValue={je.transaction_type}
          maxLength={3}
        />
        <FieldInput
          name="reference1"
          label="אסמכתא"
          defaultValue={je.reference1}
          dir="ltr"
        />
        <FieldInput
          name="documentDate"
          label="תאריך החשבונית"
          defaultValue={je.document_date}
          dir="ltr"
          type="date"
        />
        <FieldInput
          name="valueDate"
          label="תאריך ערך"
          defaultValue={je.value_date}
          dir="ltr"
          type="date"
        />
        <FieldInput
          name="details"
          label="פרטים"
          defaultValue={je.details}
          maxLength={22}
        />
        <div className="md:col-span-5 flex justify-between items-center">
          <div className="text-xs text-ink-400">
            {je.scenario && <span>תרחיש: {je.scenario} · </span>}
            סטטוס: {je.status} · מטבע: <span dir="ltr">{je.currency}</span>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-700">{error}</span>}
            {pending && <span className="text-xs text-ink-400">שומר...</span>}
            {!pending && balanced && drSum > 0 && (
              <span className="text-xs text-green-700">מאוזן ✓</span>
            )}
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 bg-ink-100 text-ink-800 rounded text-sm hover:bg-ink-200 disabled:opacity-50"
            >
              שמור כותרת
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function LineRow({ line }: { line: Line }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(field: 'account' | 'debit' | 'credit' | 'details', value: string) {
    setError(null);
    const fd = new FormData();
    fd.set('lineId', line.id);
    fd.set(field, value);
    start(async () => {
      const r = await updateLineAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function remove() {
    if (!confirm('למחוק את השורה?')) return;
    setError(null);
    const fd = new FormData();
    fd.set('lineId', line.id);
    start(async () => {
      const r = await removeLineAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="p-3 text-ink-400 text-sm">{line.line_no}</td>
      <td className="p-2">
        <CellInput
          defaultValue={line.account}
          dir="ltr"
          onCommit={(v) => commit('account', v)}
          maxLength={8}
        />
      </td>
      <td className="p-2">
        <CellInput
          defaultValue={line.debit > 0 ? String(line.debit) : ''}
          dir="ltr"
          inputMode="decimal"
          onCommit={(v) => commit('debit', v || '0')}
          align="left"
        />
      </td>
      <td className="p-2">
        <CellInput
          defaultValue={line.credit > 0 ? String(line.credit) : ''}
          dir="ltr"
          inputMode="decimal"
          onCommit={(v) => commit('credit', v || '0')}
          align="left"
        />
      </td>
      <td className="p-2">
        <CellInput
          defaultValue={line.details ?? ''}
          onCommit={(v) => commit('details', v)}
        />
      </td>
      <td className="p-2 text-center">
        {pending ? (
          <span className="text-xs text-ink-400">⋯</span>
        ) : (
          <button
            onClick={remove}
            className="text-red-700 hover:text-red-800 text-sm"
            title="מחק שורה"
          >
            ✕
          </button>
        )}
        {error && <div className="text-xs text-red-700 mt-1">{error}</div>}
      </td>
    </tr>
  );
}

function AddLineRow({ jeId }: { jeId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function add(formData: FormData) {
    setError(null);
    formData.set('jeId', jeId);
    start(async () => {
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
        <td colSpan={6} className="p-3">
          <button
            onClick={() => setOpen(true)}
            className="text-accent-600 text-sm hover:underline"
          >
            + הוסף שורה
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink-100 last:border-0 bg-ink-50/40">
      <td className="p-3 text-ink-400 text-sm">חדש</td>
      <td colSpan={5} className="p-2">
        <form action={add} className="flex gap-2 items-center">
          <input
            name="account"
            placeholder="חשבון"
            dir="ltr"
            required
            maxLength={8}
            className="px-2 py-1 border border-ink-200 rounded text-sm"
          />
          <input
            name="debit"
            placeholder="חובה"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1 border border-ink-200 rounded text-sm w-24"
          />
          <input
            name="credit"
            placeholder="זכות"
            dir="ltr"
            inputMode="decimal"
            defaultValue="0"
            className="px-2 py-1 border border-ink-200 rounded text-sm w-24"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1 bg-accent-600 text-white text-sm rounded disabled:opacity-50"
          >
            {pending ? '...' : 'הוסף'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-2 py-1 text-ink-600 text-sm"
          >
            ביטול
          </button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </form>
      </td>
    </tr>
  );
}

function CellInput({
  defaultValue,
  onCommit,
  dir,
  inputMode,
  align,
  maxLength,
}: {
  defaultValue: string;
  onCommit: (v: string) => void;
  dir?: 'ltr' | 'rtl';
  inputMode?: 'decimal' | 'numeric' | 'text';
  align?: 'left' | 'right';
  maxLength?: number;
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
      className={`w-full px-2 py-1 border border-transparent hover:border-ink-200 focus:border-accent-500 rounded text-sm bg-transparent focus:bg-white ${align === 'left' ? 'text-left' : ''}`}
    />
  );
}

function FieldInput({
  name,
  label,
  defaultValue,
  dir,
  type,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue: string;
  dir?: 'ltr' | 'rtl';
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-ink-600 mb-0.5">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        dir={dir}
        type={type}
        maxLength={maxLength}
        className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm"
      />
    </div>
  );
}
