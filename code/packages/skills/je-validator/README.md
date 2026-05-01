# @priority-cpa/je-validator

The 10-check validation gate that runs before any invoice can be exported to MOVEIN.DAT.

## API

```ts
import { validateInvoice } from '@priority-cpa/je-validator';
const result = validateInvoice(canonicalInvoice, context);
// { passed: boolean, errors: ValidationError[], warnings: ValidationWarning[] }
```

## The 10 checks

| # | Code                              | Severity | What it does                                                       |
| - | --------------------------------- | -------- | ------------------------------------------------------------------ |
| 1 | `TOTALS_INCONSISTENT`             | Error    | `subtotal + vat ≠ total` beyond ±0.05 ILS                          |
| 2 | `VAT_RATE_MISMATCH`               | Error    | declared `vat_rate` doesn't match `getStandardVatRate(date)`       |
| 3 | `EXPENSE_ACCOUNT_NOT_FOUND`       | Error    | configured expense account missing from chart                      |
| 3 | `VAT_ACCOUNT_NOT_FOUND`           | Error    | configured VAT-input account missing from chart                    |
| 3 | `SUPPLIER_ACCOUNT_NOT_FOUND`      | Error    | supplier internal code missing from chart                          |
| 4 | `SUPPLIER_UNKNOWN`                | Error    | supplier internal code missing from supplier master                |
| 5 | `DATE_OUT_OF_RANGE` / `DATE_FAR_PAST` / `DATE_FUTURE` | mixed | invoice date outside the configured window |
| 6 | `ALLOCATION_REQUIRED`             | Error    | invoice over the year's threshold but no `allocation_number`       |
| 7 | `ALLOCATION_NUMBER_NOT_VERIFIED`  | Warning  | allocation number present but not yet verified vs Tax Authority    |
| 8 | `DUPLICATE_INVOICE`               | Error    | fingerprint (tax_id + number + date + total) already ingested      |
| 9 | `OCR_LOW_CONFIDENCE`              | Warning  | `metadata.ocr_confidence` below threshold (default 0.8)            |
| 10 | `NON_ILS_CURRENCY`               | Warning  | currency ≠ ILS — flag for FX engine routing                        |

## Design choices

- **Errors block; warnings don't.** `passed === errors.length === 0`.
- **Empty `knownAccounts`/`knownSupplierCodes` sets skip those checks.** This keeps the validator usable in unit tests and in early-pipeline calls before company config is fully loaded.
- **Hebrew + English messages on every issue.** UI shows Hebrew; logs and dev tools show English.
- **Pure function**, no I/O. Allocation-number validation against the Tax Authority API is *not* done here — only formal checks. The actual API integration lives in Phase 4.
