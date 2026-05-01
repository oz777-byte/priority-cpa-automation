import { round } from './rates.js';

export type DeductionCategory = 'standard' | 'vehicle' | 'meals' | 'non_deductible';

export const DEDUCTION_RATES: Readonly<Record<DeductionCategory, number>> = {
  standard: 1.0,
  vehicle: 2 / 3,
  meals: 0.25,
  non_deductible: 0,
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
