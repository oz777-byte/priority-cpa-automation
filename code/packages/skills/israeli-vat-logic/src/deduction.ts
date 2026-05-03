import { round } from './rates.js';

/**
 * Israeli VAT input recovery rates by category.
 *
 * Sources: תקנות מס הכנסה (פחת) + הוראת מס הכנסה (ניכוי בשל הוצאות מסויימות).
 *
 * Categories:
 *  - standard / vehicle (M1) / meals (אש"ל) / non_deductible: legacy rates
 *  - commercial_vehicle (N1, panel van, work truck): 100% — vehicle used solely for business
 *  - motorcycle_small (≤125cc): 100% — treated like a commercial vehicle
 *  - motorcycle_large (>125cc): 2/3 — same as private passenger car
 *  - mobile_phone_full_business: 100% — when wholly business-use
 *  - mobile_phone_partial: 2/3 — typical mixed personal/business
 *  - mobile_phone_personal_majority: 1/3 — when mostly personal
 *  - gifts_above_threshold: 0% — gifts to clients/employees over ~210₪/year
 *  - late_meals: 100% — meals provided after 8+ hours of work (overtime meals)
 *  - foreign_trip: 0% — foreign business-trip VAT (foreign jurisdiction VAT, non-recoverable in Israel)
 */
export type DeductionCategory =
  | 'standard'
  | 'vehicle'
  | 'meals'
  | 'non_deductible'
  | 'commercial_vehicle'
  | 'motorcycle_small'
  | 'motorcycle_large'
  | 'mobile_phone_full_business'
  | 'mobile_phone_partial'
  | 'mobile_phone_personal_majority'
  | 'gifts_above_threshold'
  | 'late_meals'
  | 'foreign_trip';

export const DEDUCTION_RATES: Readonly<Record<DeductionCategory, number>> = {
  standard: 1.0,
  vehicle: 2 / 3,
  meals: 0.25,
  non_deductible: 0,
  commercial_vehicle: 1.0,
  motorcycle_small: 1.0,
  motorcycle_large: 2 / 3,
  mobile_phone_full_business: 1.0,
  mobile_phone_partial: 2 / 3,
  mobile_phone_personal_majority: 1 / 3,
  gifts_above_threshold: 0,
  late_meals: 1.0,
  foreign_trip: 0,
};

/** Hebrew labels for UI display. */
export const DEDUCTION_LABELS: Readonly<Record<DeductionCategory, string>> = {
  standard: 'רגיל (100%)',
  vehicle: 'רכב פרטי M1 (2/3)',
  meals: 'ארוחות אש"ל (1/4)',
  non_deductible: 'לא מנוכה (0%)',
  commercial_vehicle: 'רכב מסחרי N1 / טנדר (100%)',
  motorcycle_small: 'אופנוע ≤125 סמ"ק (100%)',
  motorcycle_large: 'אופנוע >125 סמ"ק (2/3)',
  mobile_phone_full_business: 'נייד עסקי בלבד (100%)',
  mobile_phone_partial: 'נייד מעורב — רוב עסקי (2/3)',
  mobile_phone_personal_majority: 'נייד מעורב — רוב פרטי (1/3)',
  gifts_above_threshold: 'מתנות מעל הרף (0%)',
  late_meals: 'ארוחות לאחר 8 שעות (100%)',
  foreign_trip: 'נסיעות חו"ל (0%)',
};

export interface MixedDeductionResult {
  deductibleExpense: number;
  nonDeductibleExpense: number;
  deductibleVat: number;
  nonDeductibleVat: number;
}

export function applyMixedDeduction(
  category: DeductionCategory,
  expenseAmount: number,
  vatAmount: number,
): MixedDeductionResult {
  const rate = DEDUCTION_RATES[category];
  const deductibleExpense = round(expenseAmount * rate);
  const deductibleVat = round(vatAmount * rate);
  return {
    deductibleExpense,
    nonDeductibleExpense: round(expenseAmount - deductibleExpense),
    deductibleVat,
    nonDeductibleVat: round(vatAmount - deductibleVat),
  };
}
