# @priority-cpa/israeli-vat-logic

Pure functions encoding Israeli VAT rules.

## Functions

- **`getStandardVatRate(isoDate)`** → `17 | 18`. Switchover at `2025-01-01`.
- **`calculateVat(subtotal, ratePercent)`** → rounded VAT (2 decimals).
- **`isAllocationRequired(subtotal, isoDate)` / `getAllocationThreshold(isoDate)`** — חוק מספר הקצאה (2024+). 25K NIS in 2024, 20K from 2025.
- **`applyMixedDeduction(category, expense, vat)`** — splits expense and VAT into deductible / non-deductible parts. Categories: `standard` (100%), `vehicle` (2/3), `meals` (1/4), `non_deductible` (0%).
- **`reconcileRounding(stated, tolerance?)`** — when OCR-reported `subtotal + vat ≠ total` by ≤ tolerance (default ±0.05), trusts `total` as printed and recomputes VAT. Throws beyond tolerance.

## Why "trust total, recompute VAT"

The POC found Wertheim 4427930 reporting VAT=87.25 while `total - subtotal = 87.22`. Loading 87.25 produced an unbalanced JE in Priority. The ledger must balance, so the printed `total` wins and VAT is back-derived. This matches the manual-entry convention used by the pilot CPA.

## Out of scope here

- Zero-rated cases (export, tourists). Handled at the invoice/scenario level — the `currency` and `is_export` flags on `CanonicalInvoice` will drive zero-VAT treatment elsewhere.
- Multi-rate invoices (rare in supplier invoices). Handled in `scenario-detector` (Phase 2).
- Allocation number validation against the Tax Authority API. Phase 4.
