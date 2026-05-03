import iconv from 'iconv-lite';
import {
  buildHeader,
  buildInputRecord,
  buildSaleRecord,
  buildTrailer,
} from './format.js';
import type { Pcn874Input, Pcn874Result, Pcn874Summary } from './types.js';

const ROUND2 = (n: number): number => Math.round(n * 100) / 100;

export function buildPcn874(input: Pcn874Input): Pcn874Result {
  if (!/^\d{9}$/.test(input.vatId)) {
    throw new Error(`vatId must be exactly 9 digits, got "${input.vatId}"`);
  }
  if (input.month < 1 || input.month > 12) {
    throw new Error(`month must be 1..12, got ${input.month}`);
  }
  if (input.year < 2020 || input.year > 2100) {
    throw new Error(`year out of expected range: ${input.year}`);
  }

  const term = input.lineTerminator ?? '\r\n';

  // Aggregate totals.
  let inputsSubtotal = 0;
  let inputsVat = 0;
  for (const t of input.inputs) {
    inputsSubtotal += t.subtotal;
    inputsVat += t.vat;
  }
  let salesSubtotal = 0;
  let salesVat = 0;
  for (const t of input.sales) {
    salesSubtotal += t.subtotal;
    salesVat += t.vat;
  }
  inputsSubtotal = ROUND2(inputsSubtotal);
  inputsVat = ROUND2(inputsVat);
  salesSubtotal = ROUND2(salesSubtotal);
  salesVat = ROUND2(salesVat);

  const summary: Pcn874Summary = {
    totalInputsSubtotal: inputsSubtotal,
    totalInputsVat: inputsVat,
    totalSalesSubtotal: salesSubtotal,
    totalSalesVat: salesVat,
    vatToPay: ROUND2(salesVat - inputsVat),
    inputsCount: input.inputs.length,
    salesCount: input.sales.length,
  };

  // Build records.
  const header = buildHeader({
    vatId: input.vatId,
    year: input.year,
    month: input.month,
    totalSalesCount: input.sales.length,
    totalInputsCount: input.inputs.length,
    totalSalesVat: salesVat,
    totalInputsVat: inputsVat,
    totalSalesSubtotal: salesSubtotal,
    totalInputsSubtotal: inputsSubtotal,
  });

  const saleRecords = input.sales.map(buildSaleRecord);
  const inputRecords = input.inputs.map(buildInputRecord);
  const trailer = buildTrailer({
    totalRecords: 1 + saleRecords.length + inputRecords.length + 1,
    totalVatToPay: summary.vatToPay,
  });

  const text =
    [header, ...saleRecords, ...inputRecords, trailer].join(term) + term;

  const buffer = iconv.encode(text, 'win1255');

  return { text, summary, buffer };
}
