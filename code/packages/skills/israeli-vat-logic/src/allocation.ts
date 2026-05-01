const ALLOCATION_THRESHOLDS_BY_YEAR: Readonly<Record<number, number>> = {
  2024: 25_000,
  2025: 20_000,
  2026: 20_000,
};

const DEFAULT_THRESHOLD_FROM_2025_ONWARDS = 20_000;
const ALLOCATION_REGULATION_FIRST_YEAR = 2024;

export function getAllocationThreshold(isoDate: string): number | null {
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  if (year < ALLOCATION_REGULATION_FIRST_YEAR) return null;
  return ALLOCATION_THRESHOLDS_BY_YEAR[year] ?? DEFAULT_THRESHOLD_FROM_2025_ONWARDS;
}

export function isAllocationRequired(subtotalIls: number, isoDate: string): boolean {
  const threshold = getAllocationThreshold(isoDate);
  if (threshold === null) return false;
  return subtotalIls > threshold;
}
