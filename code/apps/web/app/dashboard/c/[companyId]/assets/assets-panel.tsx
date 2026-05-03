'use client';

import { useState, useTransition } from 'react';
import {
  Plus,
  TrendingDown,
  CircleDollarSign,
  X,
  Truck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import {
  createAssetAction,
  runMonthlyDepreciationAction,
  sellAssetAction,
} from './actions';

export type AssetStatus = 'active' | 'sold' | 'disposed' | 'inactive';

export interface AssetRow {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseDate: string;
  purchaseAmount: number;
  annualRate: number;
  salvageValue: number;
  usefulLifeMonths: number;
  assetAccount: string;
  accumulatedDepreciation: number;
  lastDepreciationDate: string | null;
  netBookValue: number;
  status: AssetStatus;
  retiredDate: string | null;
  retirementProceeds: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  office_equipment: 'ציוד משרדי',
  computers: 'מחשבים',
  vehicles: 'רכבים',
  furniture: 'ריהוט',
  machinery: 'מכונות',
  buildings: 'מבנים',
  leasehold_improvements: 'שיפורים במושכר',
  software: 'תוכנה',
  other: 'אחר',
};

const STATUS_LABELS: Record<AssetStatus, { label: string; tone: string }> = {
  active: { label: 'פעיל', tone: 'bg-emerald-100 text-emerald-800' },
  sold: { label: 'נמכר', tone: 'bg-blue-100 text-blue-800' },
  disposed: { label: 'הוסר', tone: 'bg-ink-200 text-ink-700' },
  inactive: { label: 'לא פעיל', tone: 'bg-amber-100 text-amber-800' },
};

const fmt = (n: number): string =>
  n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function AssetsPanel({
  companyId,
  rows,
}: {
  companyId: string;
  rows: AssetRow[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showDepRun, setShowDepRun] = useState(false);
  const [sellingAsset, setSellingAsset] = useState<AssetRow | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCost = rows
    .filter((r) => r.status === 'active')
    .reduce((s, r) => s + r.purchaseAmount, 0);
  const totalAccumulated = rows
    .filter((r) => r.status === 'active')
    .reduce((s, r) => s + r.accumulatedDepreciation, 0);
  const totalNbv = rows
    .filter((r) => r.status === 'active')
    .reduce((s, r) => s + r.netBookValue, 0);

  const columns: Column<AssetRow>[] = [
    {
      key: 'name',
      header: 'נכס',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="text-ink-900 font-medium text-sm">{r.name}</div>
          <div className="text-[11px] text-ink-500">
            {CATEGORY_LABELS[r.category] ?? r.category}
            {r.serialNumber ? ` · ${r.serialNumber}` : ''}
          </div>
        </div>
      ),
      value: (r) => r.name,
    },
    {
      key: 'purchaseDate',
      header: 'תאריך',
      sortable: true,
      dir: 'ltr',
      cell: (r) => <span className="text-ink-600 text-xs">{r.purchaseDate}</span>,
      value: (r) => r.purchaseDate,
    },
    {
      key: 'purchaseAmount',
      header: 'עלות',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 tabular-nums" dir="ltr">
          {fmt(r.purchaseAmount)} ₪
        </span>
      ),
      value: (r) => r.purchaseAmount,
    },
    {
      key: 'annualRate',
      header: 'שיעור פחת',
      cell: (r) => (
        <span className="text-ink-700 text-xs tabular-nums">
          {(r.annualRate * 100).toFixed(0)}% שנתי
        </span>
      ),
      value: (r) => r.annualRate,
    },
    {
      key: 'accumulatedDepreciation',
      header: 'פחת מצטבר',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-600 tabular-nums" dir="ltr">
          {fmt(r.accumulatedDepreciation)} ₪
        </span>
      ),
      value: (r) => r.accumulatedDepreciation,
    },
    {
      key: 'netBookValue',
      header: 'ערך פנקסני',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 font-medium tabular-nums" dir="ltr">
          {fmt(r.netBookValue)} ₪
        </span>
      ),
      value: (r) => r.netBookValue,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const s = STATUS_LABELS[r.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.tone}`}>
            {s.label}
          </span>
        );
      },
      value: (r) => r.status,
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (r) =>
        r.status === 'active' ? (
          <button
            type="button"
            onClick={() => setSellingAsset(r)}
            className="text-xs px-2 py-1 border border-ink-200 hover:bg-ink-50 rounded"
          >
            מכור / הסר
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          {info}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="עלות נכסים פעילים" value={fmt(totalCost)} suffix="₪" tone="ink" />
        <Stat label="פחת מצטבר" value={fmt(totalAccumulated)} suffix="₪" tone="amber" />
        <Stat label="ערך פנקסני" value={fmt(totalNbv)} suffix="₪" tone="emerald" />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 flex items-center gap-1.5"
        >
          <Plus size={14} />
          הוסף נכס
        </button>
        <button
          type="button"
          onClick={() => setShowDepRun(true)}
          className="px-4 py-2 border border-ink-300 text-ink-800 hover:bg-ink-50 rounded-lg text-sm flex items-center gap-1.5"
        >
          <TrendingDown size={14} />
          הרץ פחת חודשי
        </button>
      </div>

      <DataTable<AssetRow>
        rows={rows}
        columns={columns}
        defaultSort={{ key: 'purchaseDate', direction: 'desc' }}
        empty={
          <div className="text-center py-6 text-sm text-ink-600">
            עדיין אין נכסי קבע. הוסף נכס ראשון כדי להתחיל מעקב פחת.
          </div>
        }
      />

      {showAdd && (
        <AddAssetModal
          companyId={companyId}
          onClose={() => setShowAdd(false)}
          onSuccess={(msg) => {
            setShowAdd(false);
            setInfo(msg);
            setError(null);
          }}
          onError={(err) => setError(err)}
        />
      )}
      {showDepRun && (
        <DepreciationRunModal
          companyId={companyId}
          onClose={() => setShowDepRun(false)}
          onSuccess={(msg) => {
            setShowDepRun(false);
            setInfo(msg);
            setError(null);
          }}
          onError={(err) => setError(err)}
        />
      )}
      {sellingAsset && (
        <SellAssetModal
          companyId={companyId}
          asset={sellingAsset}
          onClose={() => setSellingAsset(null)}
          onSuccess={(msg) => {
            setSellingAsset(null);
            setInfo(msg);
            setError(null);
          }}
          onError={(err) => setError(err)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix: string;
  tone: 'ink' | 'amber' | 'emerald';
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/40'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/40'
        : 'border-ink-200 bg-white';
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
        {label}
      </div>
      <div className="text-lg font-semibold text-ink-900 tabular-nums mt-0.5" dir="ltr">
        {value} {suffix}
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string; defaultRate: number; defaultAccount: string; defaultAccumulated: string }> = [
  { value: 'computers', label: 'מחשבים וציוד מחשוב', defaultRate: 33, defaultAccount: '140-2', defaultAccumulated: '149-2' },
  { value: 'office_equipment', label: 'ציוד משרדי', defaultRate: 7, defaultAccount: '140-3', defaultAccumulated: '149-3' },
  { value: 'furniture', label: 'ריהוט', defaultRate: 7, defaultAccount: '140-3', defaultAccumulated: '149-3' },
  { value: 'vehicles', label: 'כלי רכב', defaultRate: 15, defaultAccount: '140-1', defaultAccumulated: '149-1' },
  { value: 'machinery', label: 'מכונות', defaultRate: 15, defaultAccount: '140-4', defaultAccumulated: '149-4' },
  { value: 'buildings', label: 'מבנים', defaultRate: 4, defaultAccount: '141-0', defaultAccumulated: '149-9' },
  { value: 'software', label: 'תוכנה', defaultRate: 33, defaultAccount: '140-5', defaultAccumulated: '149-5' },
  { value: 'leasehold_improvements', label: 'שיפורים במושכר', defaultRate: 10, defaultAccount: '140-6', defaultAccumulated: '149-6' },
  { value: 'office_equipment_other', label: 'אחר', defaultRate: 10, defaultAccount: '140-9', defaultAccumulated: '149-9' },
];

function AddAssetModal({
  companyId,
  onClose,
  onSuccess,
  onError,
}: {
  companyId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]!.value);
  const selected =
    CATEGORY_OPTIONS.find((c) => c.value === category) ?? CATEGORY_OPTIONS[0]!;
  const [isImmediate, setIsImmediate] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('companyId', companyId);
    if (isImmediate) fd.set('is_immediate_payment', 'true');
    startTransition(async () => {
      const r = await createAssetAction(fd);
      if (!r.ok) {
        onError(r.error ?? 'יצירת נכס נכשלה');
        return;
      }
      const months = (r.details as { usefulLifeMonths?: number } | undefined)?.usefulLifeMonths;
      onSuccess(`נכס נוצר. חיי שירות מחושבים: ${months ?? '—'} חודשים.`);
    });
  }

  return (
    <div className="fixed inset-0 bg-ink-900/50 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <Truck size={14} className="text-brand-500" />
            הוסף נכס קבע חדש
          </h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <Field label="שם הנכס" name="name" required placeholder="למשל: Lenovo X1 — מחשב נייד" />
        <Field label="תיאור (אופציונלי)" name="description" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs font-medium text-ink-700 mb-1">קטגוריה</div>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              disabled={pending}
              required
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.defaultRate}% שנתי)
                </option>
              ))}
            </select>
          </label>
          <Field label="מספר סידורי" name="serial_number" placeholder="אופציונלי" />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="תאריך רכישה" name="purchase_date" type="date" required />
          <Field label="עלות (לפני מע&quot;מ)" name="purchase_amount" type="number" step="0.01" required />
          <Field label="מע&quot;מ" name="vat_amount" type="number" step="0.01" defaultValue="0" />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field
            label="שיעור פחת שנתי %"
            name="depreciation_rate_percent"
            type="number"
            step="0.5"
            defaultValue={String(selected.defaultRate)}
            required
          />
          <Field label="ערך גרט (אופציונלי)" name="salvage_value" type="number" step="0.01" defaultValue="0" />
          <Field label="מרכז עלות (אופציונלי)" name="cost_center" />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="חשבון נכס" name="asset_account" defaultValue={selected.defaultAccount} required />
          <Field label="חשבון פחת מצטבר" name="accumulated_depreciation_account" defaultValue={selected.defaultAccumulated} required />
          <Field label="חשבון הוצאות פחת" name="depreciation_expense_account" defaultValue="610-0" required />
        </div>

        <div className="border border-ink-100 rounded-lg p-3 bg-ink-50/40 space-y-3">
          <div className="text-xs font-semibold text-ink-700">צד נגדי לרכישה</div>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={isImmediate}
              onChange={(e) => setIsImmediate(e.target.checked)}
            />
            תשלום מיידי (CR ישיר לבנק/אשראי במקום פתיחת ספק)
          </label>
          <Field
            label={isImmediate ? 'חשבון תשלום (בנק/אשראי)' : 'חשבון ספק'}
            name="counterparty_account"
            defaultValue={isImmediate ? '121-0' : '200001'}
            required
          />
        </div>

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
            disabled={pending}
            className="px-5 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            {pending ? 'שומר...' : 'הוסף נכס + צור JE רכישה'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DepreciationRunModal({
  companyId,
  onClose,
  onSuccess,
  onError,
}: {
  companyId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const today = new Date();
  // Default = previous month
  const defaultMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const defaultYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [pending, startTransition] = useTransition();

  function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('companyId', companyId);
    fd.set('year', String(year));
    fd.set('month', String(month));
    startTransition(async () => {
      const r = await runMonthlyDepreciationAction(fd);
      if (!r.ok) {
        onError(r.error ?? 'הרצת פחת נכשלה');
        return;
      }
      const d = r.details as { runsCreated: number; skipped: number; totalAmount: number } | undefined;
      onSuccess(
        `${d?.runsCreated ?? 0} נכסים הופחתו (${d?.totalAmount ?? 0} ₪ סה"כ); ${d?.skipped ?? 0} דולגו (כבר רצו או מופחתים מלאים).`,
      );
    });
  }

  const yearOptions: number[] = [];
  for (let y = today.getFullYear(); y >= today.getFullYear() - 5; y--) yearOptions.push(y);

  return (
    <div className="fixed inset-0 bg-ink-900/50 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={run}
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <TrendingDown size={14} className="text-amber-600" />
            הרץ פחת חודשי
          </h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-ink-600 leading-relaxed">
          המערכת תעבור על כל הנכסים הפעילים, תחשב פחת קו ישר חודשי ותיצור JE לכל אחד.
          הריצה idempotent — חודש שכבר רץ ידולג. תקופה נעולה תיחסם.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <div className="text-xs font-medium text-ink-700 mb-1">שנה</div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              disabled={pending}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="text-xs font-medium text-ink-700 mb-1">חודש</div>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              disabled={pending}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')} — {MONTH_NAMES[m]}
                </option>
              ))}
            </select>
          </label>
        </div>

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
            disabled={pending}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
          >
            {pending ? 'מריץ...' : 'הרץ פחת'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SellAssetModal({
  companyId,
  asset,
  onClose,
  onSuccess,
  onError,
}: {
  companyId: string;
  asset: AssetRow;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const [isDisposal, setIsDisposal] = useState(false);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('companyId', companyId);
    fd.set('assetId', asset.id);
    if (isDisposal) fd.set('isDisposal', 'true');
    startTransition(async () => {
      const r = await sellAssetAction(fd);
      if (!r.ok) {
        onError(r.error ?? 'מכירת נכס נכשלה');
        return;
      }
      onSuccess(isDisposal ? 'הנכס סומן כהוסר.' : 'הנכס נמכר ו-JE רווח/הפסד הון נוצר.');
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
            <CircleDollarSign size={14} className="text-blue-600" />
            מכירה / הסרה — {asset.name}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-ink-600 bg-ink-50 border border-ink-100 rounded p-2 space-y-0.5">
          <div>
            ערך פנקסני: <span className="font-medium tabular-nums" dir="ltr">{fmt(asset.netBookValue)} ₪</span>
          </div>
          <div>
            פחת מצטבר: <span className="tabular-nums" dir="ltr">{fmt(asset.accumulatedDepreciation)} ₪</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={isDisposal}
            onChange={(e) => setIsDisposal(e.target.checked)}
          />
          הסרה ללא תמורה (גריטה / אובדן) — כל ערך פנקסני יירשם כהפסד
        </label>

        <Field label="תאריך מכירה" name="saleDate" type="date" defaultValue={today} required />

        {!isDisposal && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="תמורה (לפני מע&quot;מ)" name="proceedsSubtotal" type="number" step="0.01" required />
              <Field label="מע&quot;מ עסקאות" name="proceedsVat" type="number" step="0.01" defaultValue="0" />
            </div>
            <Field label="חשבון תקבול (בנק/לקוח)" name="proceedsAccount" defaultValue="121-0" required />
          </>
        )}
        {isDisposal && (
          <input type="hidden" name="proceedsAccount" value="121-0" />
        )}

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
            disabled={pending}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {pending ? 'שומר...' : isDisposal ? 'הסר נכס' : 'מכור נכס'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  step,
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1">
        {label}
        {required && <span className="text-red-500 mr-0.5">*</span>}
      </div>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </label>
  );
}
