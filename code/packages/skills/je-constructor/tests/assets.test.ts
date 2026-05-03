import { describe, it, expect } from 'vitest';
import {
  constructAssetPurchaseJE,
  constructAssetDepreciationJE,
  constructAssetSaleJE,
  calculateMonthlyDepreciation,
} from '../src/index.js';

describe('ASSET_PURCHASE — capitalize purchase to asset account', () => {
  it('routes subtotal to asset account (not expense), with VAT input', () => {
    const r = constructAssetPurchaseJE({
      assetName: 'מחשב נייד Lenovo X1',
      invoiceNumber: 'PC-001',
      documentDate: '2026-05-12',
      subtotal: 5000,
      vat: 900,
      counterpartyAccount: '200001',
      isImmediatePayment: false,
      assetAccount: '140-2',
      vatInputAccount: '205-2',
      transactionType: 'מ',
    });
    expect(r.records).toHaveLength(1);
    const lines = r.records[0]!.lines;
    expect(lines[0]!).toMatchObject({ account: '140-2', debit: 5000, credit: 0 });
    expect(lines[1]!).toMatchObject({ account: '205-2', debit: 900, credit: 0 });
    expect(lines[2]!).toMatchObject({ account: '200001', debit: 0, credit: 5900 });
    expect(r.warnings).toHaveLength(0);
  });

  it('handles immediate payment (DR asset / DR vat / CR bank)', () => {
    const r = constructAssetPurchaseJE({
      assetName: 'כיסא משרדי',
      invoiceNumber: 'CHAIR-1',
      documentDate: '2026-05-01',
      subtotal: 1000,
      vat: 180,
      counterpartyAccount: '121-0',
      isImmediatePayment: true,
      assetAccount: '140-3',
      vatInputAccount: '205-2',
      transactionType: 'מ',
    });
    expect(r.records[0]!.lines[2]!).toMatchObject({
      account: '121-0',
      debit: 0,
      credit: 1180,
    });
    expect(r.records[0]!.notes.some((n) => n.includes('תשלום מיידי'))).toBe(true);
  });

  it('warns on zero or negative subtotal', () => {
    const r = constructAssetPurchaseJE({
      assetName: 'X',
      invoiceNumber: 'X',
      documentDate: '2026-05-01',
      subtotal: 0,
      vat: 0,
      counterpartyAccount: '200001',
      isImmediatePayment: false,
      assetAccount: '140-2',
      vatInputAccount: '205-2',
      transactionType: 'מ',
    });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('ASSET_DEPRECIATION — monthly straight-line', () => {
  it('produces a balanced 2-line JE', () => {
    const r = constructAssetDepreciationJE({
      assetId: 'asset-1234567890',
      assetName: 'Lenovo X1',
      monthEndDate: '2026-05-31',
      monthlyAmount: 137.5,
      depreciationExpenseAccount: '610-0',
      accumulatedDepreciationAccount: '149-2',
      transactionType: 'מ',
    });
    expect(r.records).toHaveLength(1);
    const lines = r.records[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]!).toMatchObject({ account: '610-0', debit: 137.5, credit: 0 });
    expect(lines[1]!).toMatchObject({ account: '149-2', debit: 0, credit: 137.5 });
  });

  it('returns no records (and a warning) for zero amount', () => {
    const r = constructAssetDepreciationJE({
      assetId: 'asset-x',
      assetName: 'נכס מופחת מלא',
      monthEndDate: '2026-05-31',
      monthlyAmount: 0,
      depreciationExpenseAccount: '610-0',
      accumulatedDepreciationAccount: '149-2',
      transactionType: 'מ',
    });
    expect(r.records).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('calculateMonthlyDepreciation', () => {
  it('5,000 ₪ over 36 months → 138.89 (rounded 138.89)', () => {
    const m = calculateMonthlyDepreciation({
      purchaseAmount: 5000,
      salvageValue: 0,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
    });
    expect(m).toBeCloseTo(138.89, 2);
  });

  it('respects salvage value', () => {
    const m = calculateMonthlyDepreciation({
      purchaseAmount: 100000,
      salvageValue: 10000,
      usefulLifeMonths: 60,
      accumulatedDepreciation: 0,
    });
    expect(m).toBeCloseTo(1500, 2); // (100k - 10k) / 60
  });

  it('caps last month to remaining balance (no over-depreciation)', () => {
    const m = calculateMonthlyDepreciation({
      purchaseAmount: 1000,
      salvageValue: 0,
      usefulLifeMonths: 12,
      accumulatedDepreciation: 950, // 50 left
    });
    expect(m).toBe(50);
  });

  it('returns 0 when fully depreciated', () => {
    const m = calculateMonthlyDepreciation({
      purchaseAmount: 1000,
      salvageValue: 0,
      usefulLifeMonths: 12,
      accumulatedDepreciation: 1000,
    });
    expect(m).toBe(0);
  });
});

describe('ASSET_SALE — disposal with proceeds', () => {
  it('produces gain when proceeds exceed net book value', () => {
    const r = constructAssetSaleJE({
      assetId: 'asset-1234567890',
      assetName: 'מחשב Lenovo',
      saleDate: '2026-05-30',
      assetAccount: '140-2',
      purchaseAmount: 5000,
      accumulatedDepreciation: 3000,
      accumulatedDepreciationAccount: '149-2',
      proceedsSubtotal: 2500,
      proceedsVat: 450,
      proceedsAccount: '121-0',
      outputVatAccount: '220-0',
      gainAccount: '744-0',
      lossAccount: '625-0',
      transactionType: 'מ',
    });
    // Net book = 5000 - 3000 = 2000; proceeds_subtotal = 2500 → gain 500
    expect(r.records).toHaveLength(1);
    const lines = r.records[0]!.lines;
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.05);
    const gainLine = lines.find((l) => l.account === '744-0');
    expect(gainLine).toBeDefined();
    expect(gainLine!.credit).toBeCloseTo(500, 2);
  });

  it('produces loss when proceeds are below net book value', () => {
    const r = constructAssetSaleJE({
      assetId: 'asset-2',
      assetName: 'מחשב ישן',
      saleDate: '2026-05-30',
      assetAccount: '140-2',
      purchaseAmount: 5000,
      accumulatedDepreciation: 1000,
      accumulatedDepreciationAccount: '149-2',
      proceedsSubtotal: 1000, // less than NBV (4000)
      proceedsVat: 180,
      proceedsAccount: '121-0',
      outputVatAccount: '220-0',
      gainAccount: '744-0',
      lossAccount: '625-0',
      transactionType: 'מ',
    });
    const lines = r.records[0]!.lines;
    const lossLine = lines.find((l) => l.account === '625-0');
    expect(lossLine).toBeDefined();
    expect(lossLine!.debit).toBeCloseTo(3000, 2); // NBV 4000 - proceeds 1000
  });

  it('handles disposal with zero proceeds (full write-off as loss)', () => {
    const r = constructAssetSaleJE({
      assetId: 'asset-3',
      assetName: 'מחשב נזרק',
      saleDate: '2026-05-30',
      assetAccount: '140-2',
      purchaseAmount: 5000,
      accumulatedDepreciation: 2000,
      accumulatedDepreciationAccount: '149-2',
      proceedsSubtotal: 0,
      proceedsVat: 0,
      proceedsAccount: '121-0',
      outputVatAccount: '220-0',
      gainAccount: '744-0',
      lossAccount: '625-0',
      transactionType: 'מ',
    });
    const lines = r.records[0]!.lines;
    const lossLine = lines.find((l) => l.account === '625-0');
    expect(lossLine).toBeDefined();
    expect(lossLine!.debit).toBeCloseTo(3000, 2); // NBV 3000
    // No proceeds line
    expect(lines.find((l) => l.account === '121-0')).toBeUndefined();
  });
});
