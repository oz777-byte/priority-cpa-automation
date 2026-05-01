# @priority-cpa/invoice-schema

Canonical Zod schemas for invoices, journal entries, and OCR-source mappers. The shared "type backbone" that all other skills depend on.

## Exports

- `CanonicalInvoiceSchema` — the canonical invoice format (post-OCR, pre-JE).
- `JournalEntrySchema` — multi-line balanced JE, used by `je-validator` and `movein-generator`.
- `ScenarioSchema` — enum of the 13 known JE scenarios from `je_scenarios_playbook.md`.
- `fromAzureDI`, `fromGoogleDI` — OCR-source mappers (signatures only at this stage; full impl in Phase 1 M5).

## Design choices

- **Passthrough on unknown fields**. Real OCR JSON has many vendor-specific fields. We strip nothing — downstream skills can use them or ignore them.
- **`tax_id` is a free string, not a 9-digit regex**. Foreign suppliers don't fit the Israeli pattern, and we'd rather process the invoice and flag the issue downstream than reject at schema time.
- **`vat_amount` is optional in `totals`** — the format authority for VAT is `(total - subtotal)`, not the OCR-reported value (POC found a 3-agora mismatch on the Wertheim invoice).
- **`JournalEntrySchema` enforces DR=CR within ±0.05 ILS** at parse time. A JE that doesn't balance is malformed, period.
