'use client';

import { useState, useTransition } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface RateRow {
  currency: string;
  rate: number;
  rateDate: string;
  source: string;
}

export function FxRatesPanel({ initialRates }: { initialRates: RateRow[] }) {
  const [rates, setRates] = useState<RateRow[]>(initialRates);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function refresh() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const r = await fetch('/api/rates/refresh-boi', { method: 'POST' });
        const json = (await r.json()) as
          | {
              ok: true;
              source: string;
              rateDate: string;
              count: number;
              rates: Array<{ currency: string; rate: number }>;
              warning?: string;
            }
          | { error?: string };
        if (!r.ok || !('ok' in json)) {
          setError(('error' in json && json.error) || 'רענון נכשל');
          return;
        }
        setRates(
          json.rates.map((x) => ({
            currency: x.currency,
            rate: x.rate,
            rateDate: json.rateDate,
            source: json.source,
          })),
        );
        setInfo(
          json.source === 'mock'
            ? `mock: ${json.count} שערים. ${json.warning ? `(${json.warning})` : ''}`
            : `${json.count} שערים נטענו לתאריך ${json.rateDate}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה');
      }
    });
  }

  const isMock = rates.some((r) => r.source === 'mock');

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">שערי בנק ישראל</h3>
          <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
            המערכת ממלאת אוטומטית fx_rate בחשבוניות במט"ח לפי השער הקרוב לתאריך
            החשבונית. הרענון אמור לרוץ אוטומטית כל יום (Vercel Cron); הכפתור
            כאן מאפשר רענון ידני.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={pending}
          className="px-3 py-2 text-sm border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          רענן עכשיו
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          {info}
        </div>
      )}
      {isMock && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            השערים המוצגים הם mock — בנק ישראל לא נגיש כרגע. ניתן להגדיר{' '}
            <code dir="ltr">BOI_RATES_URL</code> לכתובת חלופית ב-Vercel.
          </span>
        </div>
      )}

      {rates.length === 0 ? (
        <div className="text-sm text-ink-500 py-2">
          אין עדיין שערים בקאש. לחץ "רענן עכשיו" לטעינה ראשונה.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold border-b border-ink-100">
              <th className="text-right py-2">מטבע</th>
              <th className="text-left py-2">שער (₪)</th>
              <th className="text-left py-2">תאריך</th>
              <th className="text-left py-2">מקור</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.currency} className="border-b border-ink-100 last:border-0">
                <td className="py-2 font-mono text-ink-900" dir="ltr">{r.currency}</td>
                <td className="py-2 text-left tabular-nums" dir="ltr">
                  {r.rate.toFixed(4)}
                </td>
                <td className="py-2 text-left text-ink-600 text-xs" dir="ltr">
                  {r.rateDate}
                </td>
                <td className="py-2 text-left">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium font-mono ${
                      r.source === 'boi'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                    dir="ltr"
                  >
                    {r.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
