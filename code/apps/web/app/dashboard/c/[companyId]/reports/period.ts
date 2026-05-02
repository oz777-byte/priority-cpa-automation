/**
 * Israeli VAT period helpers — bimonthly is the most common filing
 * cadence (Jan-Feb, Mar-Apr, ...). Monthly filers can use the month
 * presets directly.
 */

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}
function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Bimonthly window containing the given date (anchor=Jan/Feb, Mar/Apr, ...). */
function bimonthlyOf(year: number, month: number): { firstMonth: number; year: number } {
  // Months 1,2 → 1; 3,4 → 3; etc.
  const firstMonth = month % 2 === 1 ? month : month - 1;
  return { firstMonth, year };
}

export function currentBimonthly(today: Date = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const { firstMonth, year } = bimonthlyOf(y, m);
  const lastMonth = firstMonth + 1;
  return {
    from: iso(year, firstMonth, 1),
    to: iso(year, lastMonth, lastDay(year, lastMonth)),
    label: `${pad(firstMonth)}-${pad(lastMonth)}/${year}`,
  };
}

export function previousBimonthly(today: Date = new Date()): DateRange {
  const cur = currentBimonthly(today);
  const [y, m] = cur.from.split('-').map(Number) as [number, number];
  const prevFirstMonth = m === 1 ? 11 : m - 2;
  const prevYear = m === 1 ? y - 1 : y;
  const prevLast = prevFirstMonth + 1;
  return {
    from: iso(prevYear, prevFirstMonth, 1),
    to: iso(prevYear, prevLast, lastDay(prevYear, prevLast)),
    label: `${pad(prevFirstMonth)}-${pad(prevLast)}/${prevYear}`,
  };
}

export function currentMonth(today: Date = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  return {
    from: iso(y, m, 1),
    to: iso(y, m, lastDay(y, m)),
    label: `${pad(m)}/${y}`,
  };
}

export function previousMonth(today: Date = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return {
    from: iso(py, pm, 1),
    to: iso(py, pm, lastDay(py, pm)),
    label: `${pad(pm)}/${py}`,
  };
}
