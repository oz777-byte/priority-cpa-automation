'use client';

import Link from 'next/link';
import { Calendar, Printer } from 'lucide-react';

const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function PeriodSelector({
  basePath,
  rangeLabel,
  rangeFrom,
  rangeTo,
  activePreset,
  showPrint = true,
  exportHref,
}: {
  basePath: string;
  rangeLabel: string;
  rangeFrom: string;
  rangeTo: string;
  activePreset: string | undefined;
  showPrint?: boolean;
  exportHref: string | undefined;
}) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const prevYear = thisMonth === 1 ? thisYear - 1 : thisYear;
  const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;

  function presetHref(preset: string): string {
    return `${basePath}?preset=${preset}`;
  }

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-4 space-y-3 print:hidden">
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-ink-500" />
        <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
          תקופת הדוח
        </span>
        <span className="text-sm text-ink-900 font-medium" dir="ltr">
          {rangeLabel}
        </span>
        <div className="mr-auto flex items-center gap-2">
          {showPrint && (
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs text-ink-700 border border-ink-200 hover:bg-ink-50 rounded-md flex items-center gap-1.5"
            >
              <Printer size={12} />
              הדפס / PDF
            </button>
          )}
          {exportHref && (
            <a
              href={exportHref}
              download
              className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md"
            >
              ייצוא CSV
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PresetLink href={presetHref(`y_${thisYear}`)} label={`שנת ${thisYear}`} active={activePreset === `y_${thisYear}`} />
        <PresetLink href={presetHref(`y_${thisYear - 1}`)} label={`שנת ${thisYear - 1}`} active={activePreset === `y_${thisYear - 1}`} />
        <PresetLink
          href={presetHref(`m_${thisYear}-${thisMonth}`)}
          label={`${MONTH_NAMES[thisMonth]} ${thisYear}`}
          active={activePreset === `m_${thisYear}-${thisMonth}`}
        />
        <PresetLink
          href={presetHref(`m_${prevYear}-${prevMonth}`)}
          label={`${MONTH_NAMES[prevMonth]} ${prevYear}`}
          active={activePreset === `m_${prevYear}-${prevMonth}`}
        />
        <form className="flex items-center gap-2 mr-auto" action={basePath}>
          <input type="hidden" name="preset" value="custom" />
          <input
            type="date"
            name="from"
            defaultValue={rangeFrom}
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm"
            dir="ltr"
          />
          <span className="text-ink-400 text-xs">→</span>
          <input
            type="date"
            name="to"
            defaultValue={rangeTo}
            className="px-2 py-1.5 border border-ink-200 rounded-md text-sm"
            dir="ltr"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs text-accent-600 border border-accent-200 hover:bg-accent-50 rounded-md"
          >
            סנן
          </button>
        </form>
      </div>
    </section>
  );
}

function PresetLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-xs rounded-md border ${
        active
          ? 'bg-accent-500/10 text-accent-700 border-accent-200'
          : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
      }`}
    >
      {label}
    </Link>
  );
}

export function PrintHeader({
  companyName,
  reportTitle,
  rangeLabel,
}: {
  companyName: string;
  reportTitle: string;
  rangeLabel: string;
}) {
  return (
    <div className="hidden print:block mb-4 border-b-2 border-ink-900 pb-2">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-base font-bold text-ink-900">{companyName}</h1>
          <h2 className="text-sm text-ink-700 mt-1">{reportTitle}</h2>
        </div>
        <div className="text-xs text-ink-600 text-left" dir="ltr">
          <div>{rangeLabel}</div>
          <div className="text-[10px] text-ink-500 mt-0.5">
            הופק: {new Date().toISOString().slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      </div>
    </div>
  );
}
