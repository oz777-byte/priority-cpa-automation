import { roundCents } from './helpers.js';
import type {
  AssetConstructResult,
  AssetDepreciationInput,
  AssetJELine,
  AssetJERecord,
  AssetPurchaseInput,
  AssetSaleInput,
} from './asset-types.js';

/**
 * ASSET_PURCHASE — capitalize purchase to the asset account instead of expense.
 *
 *   DR  asset_account              subtotal
 *   DR  vat_input_account          vat
 *   CR  counterparty               total       (supplier OR payment account)
 */
export function constructAssetPurchaseJE(
  input: AssetPurchaseInput,
): AssetConstructResult {
  const warnings: string[] = [];
  const total = roundCents(input.subtotal + input.vat);

  const lines: AssetJELine[] = [
    {
      account: input.assetAccount,
      debit: input.subtotal,
      credit: 0,
      ...(input.costCenter ? { costCenter: input.costCenter } : {}),
      details: input.assetName,
    },
    { account: input.vatInputAccount, debit: input.vat, credit: 0 },
    {
      account: input.counterpartyAccount,
      debit: 0,
      credit: total,
    },
  ];

  if (input.subtotal <= 0) {
    warnings.push('סכום הרכישה אפס או שלילי — בדוק את החשבונית');
  }

  return {
    scenario: 'ASSET_PURCHASE',
    records: [
      {
        reference1: input.invoiceNumber,
        documentDate: input.documentDate,
        valueDate: input.documentDate,
        details: `רכישת נכס — ${input.assetName}`,
        transactionType: input.transactionType,
        scenario: 'ASSET_PURCHASE',
        lines,
        notes: [
          `נכס "${input.assetName}" הוקצה לחשבון ${input.assetAccount}`,
          input.isImmediatePayment
            ? 'תשלום מיידי — אין יתרה לספק'
            : 'יתרת ספק נפתחה — תיסגר בעת התשלום',
          'פחת חודשי יתחיל מהחודש העוקב לרכישה',
        ],
      },
    ],
    warnings,
  };
}

/**
 * ASSET_DEPRECIATION — monthly straight-line.
 *
 *   DR  depreciation_expense       monthly_amount
 *   CR  accumulated_depreciation   monthly_amount
 */
export function constructAssetDepreciationJE(
  input: AssetDepreciationInput,
): AssetConstructResult {
  const warnings: string[] = [];
  const amount = roundCents(input.monthlyAmount);

  if (amount <= 0) {
    return {
      scenario: 'ASSET_DEPRECIATION',
      records: [],
      warnings: ['סכום פחת חודשי אפס — לא נוצר JE (נכס מופחת מלא או לא פעיל)'],
    };
  }

  const lines: AssetJELine[] = [
    {
      account: input.depreciationExpenseAccount,
      debit: amount,
      credit: 0,
      ...(input.costCenter ? { costCenter: input.costCenter } : {}),
      details: `פחת — ${input.assetName}`,
    },
    {
      account: input.accumulatedDepreciationAccount,
      debit: 0,
      credit: amount,
    },
  ];

  return {
    scenario: 'ASSET_DEPRECIATION',
    records: [
      {
        reference1: `DEP-${input.assetId.slice(0, 8)}`,
        documentDate: input.monthEndDate,
        valueDate: input.monthEndDate,
        details: `פחת חודשי — ${input.assetName}`,
        transactionType: input.transactionType,
        scenario: 'ASSET_DEPRECIATION',
        lines,
        notes: [
          `נכס: ${input.assetName}`,
          `פחת לחודש: ${amount.toFixed(2)} ₪`,
        ],
      },
    ],
    warnings,
  };
}

/**
 * ASSET_SALE — disposal of a fixed asset.
 *
 * Multi-line JE that:
 *   1. Reverses the asset cost (CR asset_account)
 *   2. Reverses accumulated depreciation (DR accumulated)
 *   3. Books proceeds (DR proceeds_account at gross + CR output_vat at vat amount)
 *   4. Books gain/loss as the balancing line:
 *      gain = (proceeds_subtotal) − (purchase − accumulated_depreciation)
 *      gain > 0 → CR gainAccount; gain < 0 → DR lossAccount
 *
 * For pure disposal (no proceeds), proceedsSubtotal = 0; the entire net book
 * value falls to lossAccount.
 *
 * Single record (4-6 lines). May exceed 180-format 4-line cap depending on
 * gain/loss path → caller can flag for FLEXIBLE.
 */
export function constructAssetSaleJE(
  input: AssetSaleInput,
): AssetConstructResult {
  const warnings: string[] = [];

  const purchase = roundCents(input.purchaseAmount);
  const accumulated = roundCents(input.accumulatedDepreciation);
  const proceedsSubtotal = roundCents(input.proceedsSubtotal);
  const proceedsVat = roundCents(input.proceedsVat);
  const proceedsTotal = roundCents(proceedsSubtotal + proceedsVat);

  const netBookValue = roundCents(purchase - accumulated);
  const gainOrLoss = roundCents(proceedsSubtotal - netBookValue);

  if (accumulated > purchase) {
    warnings.push(
      `פחת מצטבר (${accumulated.toFixed(2)}) חורג מעלות הרכישה (${purchase.toFixed(2)}). בדוק נתוני נכס.`,
    );
  }

  const lines: AssetJELine[] = [];

  // 1. Receive proceeds (or zero if disposed without proceeds).
  if (proceedsTotal > 0) {
    lines.push({
      account: input.proceedsAccount,
      debit: proceedsTotal,
      credit: 0,
      details: `תקבול ממכירת ${input.assetName}`,
    });
  }

  // 2. Reverse accumulated depreciation (zero out the contra-account).
  if (accumulated > 0) {
    lines.push({
      account: input.accumulatedDepreciationAccount,
      debit: accumulated,
      credit: 0,
      details: `סגירת פחת מצטבר`,
    });
  }

  // 3. Reverse asset cost.
  lines.push({
    account: input.assetAccount,
    debit: 0,
    credit: purchase,
    details: `סגירת ${input.assetName}`,
  });

  // 4. Output VAT on the sale (if any).
  if (proceedsVat > 0) {
    lines.push({
      account: input.outputVatAccount,
      debit: 0,
      credit: proceedsVat,
      details: 'מע"מ עסקאות',
    });
  }

  // 5. Gain or loss balancing line.
  if (gainOrLoss > 0) {
    lines.push({
      account: input.gainAccount,
      debit: 0,
      credit: gainOrLoss,
      details: 'רווח הון ממכירת נכס',
    });
  } else if (gainOrLoss < 0) {
    lines.push({
      account: input.lossAccount,
      debit: -gainOrLoss,
      credit: 0,
      details: 'הפסד הון ממכירת נכס',
    });
  }

  // Sanity: balance check
  const drSum = roundCents(lines.reduce((s, l) => s + l.debit, 0));
  const crSum = roundCents(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(drSum - crSum) > 0.05) {
    warnings.push(
      `JE מכירת נכס לא מאוזן: חובה ${drSum.toFixed(2)} ≠ זכות ${crSum.toFixed(2)}`,
    );
  }

  if (lines.length > 4) {
    warnings.push(
      `JE מכירת נכס מכיל ${lines.length} שורות — חורג מ-4 השורות שתומך פורמט 180. ייצוא ידרוש FLEXIBLE.`,
    );
  }

  return {
    scenario: 'ASSET_SALE',
    records: [
      {
        reference1: `SALE-${input.assetId.slice(0, 8)}`,
        documentDate: input.saleDate,
        valueDate: input.saleDate,
        details: `מכירת נכס — ${input.assetName}`,
        transactionType: input.transactionType,
        scenario: 'ASSET_SALE',
        lines,
        notes: [
          `ערך פנקסני: ${netBookValue.toFixed(2)} ₪`,
          `תמורה (לפני מע"מ): ${proceedsSubtotal.toFixed(2)} ₪`,
          gainOrLoss >= 0
            ? `רווח הון: ${gainOrLoss.toFixed(2)} ₪`
            : `הפסד הון: ${Math.abs(gainOrLoss).toFixed(2)} ₪`,
        ],
      },
    ],
    warnings,
  };
}

/**
 * Calculate monthly straight-line depreciation amount.
 * Returns 0 if asset is already fully depreciated or salvage value reached.
 */
export function calculateMonthlyDepreciation(input: {
  purchaseAmount: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
}): number {
  const depreciableBase = input.purchaseAmount - input.salvageValue;
  if (depreciableBase <= 0) return 0;
  const monthly = roundCents(depreciableBase / input.usefulLifeMonths);
  const remaining = roundCents(depreciableBase - input.accumulatedDepreciation);
  if (remaining <= 0) return 0;
  // Last-month catch-up: cap to remaining so we don't over-depreciate.
  return Math.min(monthly, remaining);
}
