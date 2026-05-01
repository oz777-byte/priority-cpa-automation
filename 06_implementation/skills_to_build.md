# Skills to Build — 10 Modules

כל skill = פונקציה / module עצמאי עם interface ברור ו-tests. בנייה ב-TypeScript.

---

## Skill #1: movein-generator
**Priority**: Phase 1 | **Effort**: 1-2 days

### תפקיד
המרת array של JEs מאושרים → קובץ MOVEIN.DAT (180-char או FLEXIBLE).

### Interface
```ts
import { JournalEntry, MoveinOptions } from './types';

export interface MoveinOptions {
  format: '180-char' | 'flexible';
  sourceCode: 'HASH';
  encoding: 'cp1255';
  endOfLine: 'CRLF';
}

export function generateMovein(
  entries: JournalEntry[],
  options: MoveinOptions
): Buffer;  // CP1255 encoded buffer
```

### Tests
- `should produce byte-identical output to POC reference for Wertheim+Tzarfati`
- `should pad alpha fields right with spaces`
- `should pad numeric fields left with spaces`
- `should encode Hebrew correctly in CP1255`
- `should reject entries that violate 180-char limits`
- `should produce CRLF line endings`

---

## Skill #2: invoice-schema (canonical)
**Priority**: Phase 1 | **Effort**: 1 day

### תפקיד
Schema definitions + validators + mappers from various OCR sources to canonical JSON.

### Interface
```ts
import { z } from 'zod';

export const InvoiceCanonicalSchema = z.object({
  invoice: z.object({
    number: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.enum(['ILS', 'USD', 'EUR', 'GBP']),
    allocation_number: z.string().nullable(),
  }),
  supplier: z.object({
    name: z.string(),
    tax_id: z.string().regex(/^\d{9}$/),
    country: z.string().default('IL'),
  }),
  totals: z.object({
    subtotal: z.number(),
    vat_rate: z.number(),
    vat_amount: z.number(),
    total: z.number(),
  }),
  lines: z.array(z.object({
    description: z.string(),
    qty: z.number(),
    price: z.number(),
    total: z.number(),
    category: z.string().optional(),
  })),
  metadata: z.object({
    ocr_confidence: z.number().min(0).max(1),
    source: z.string(),
    ingested_at: z.string(),
  }),
});

export type InvoiceCanonical = z.infer<typeof InvoiceCanonicalSchema>;

export function fromAzureDI(azureOutput: AzureDIInvoice): InvoiceCanonical;
export function fromGoogleDI(googleOutput: GoogleDIInvoice): InvoiceCanonical;
```

### Tests
- Round-trip parse/serialize
- Mappers for Azure DI sample outputs
- Validation rejects invalid data

---

## Skill #3: israeli-vat-logic
**Priority**: Phase 1 | **Effort**: 1 day

### תפקיד
חישובי מע"מ ישראלי + allocation threshold + mixed deductions.

### Interface
```ts
export function getVatRate(date: string): 17 | 18 | 0;  // by date

export function calculateVat(
  subtotal: number,
  rate: number
): number;  // standard VAT calculation

export function isAllocationRequired(
  subtotal: number,
  date: string
): boolean;  // 2024+ regulation

export function applyMixedDeduction(
  expenseType: 'vehicle' | 'meals' | 'travel' | 'standard',
  amount: number,
  vatAmount: number
): { deductibleExpense: number; nonDeductibleExpense: number; deductibleVat: number; nonDeductibleVat: number };

export function reconcileRounding(
  stated: { subtotal: number; vat: number; total: number },
  tolerance?: number
): { subtotal: number; vat: number; total: number };
```

### Tests
- VAT rate switches: 17% pre-2025, 18% post
- Allocation threshold (configurable, default 25K NIS)
- Vehicle: 2/3 deductible
- Meals: 1/4 deductible
- Rounding tolerance ±0.05

---

## Skill #4: je-validator
**Priority**: Phase 1 | **Effort**: 1-2 days

### תפקיד
10 בדיקות לפני export. Returns reason codes for failures.

### Interface
```ts
export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];      // block
  warnings: ValidationWarning[];  // info, don't block
}

export interface ValidationError {
  code: string;        // e.g. "BALANCE_MISMATCH"
  message: string;     // user-facing Hebrew
  field?: string;
  suggestion?: string;
}

export function validateJournalEntry(
  entry: JournalEntry,
  context: ValidationContext  // company config, dates, master data
): ValidationResult;
```

### 10 Checks
1. Balance: DR = CR
2. VAT rate matches date
3. Account exists in chart
4. Supplier matched
5. Date plausibility
6. Allocation required if needed
7. Allocation valid (Tax Authority — Phase 2)
8. Duplicate fingerprint
9. OCR confidence
10. Currency code valid

---

## Skill #5: supplier-matcher
**Priority**: Phase 2 | **Effort**: 2-3 days

### תפקיד
5-layer cascade matching with learning loop.

### Interface
```ts
export interface MatchResult {
  layer: 1 | 2 | 3 | 4 | 5;
  confidence: number;  // 0-1
  supplierId: string | null;
  candidates: SupplierCandidate[];  // L4-L5 only
  needsHumanReview: boolean;
}

export async function matchSupplier(
  invoice: InvoiceCanonical,
  context: MatcherContext
): Promise<MatchResult>;

export async function learnFromConfirmation(
  alias: string,
  supplierId: string,
  context: MatcherContext
): Promise<void>;
```

### Layers
- L1: Exact tax_id (auto, 1.0)
- L2: Alias match learned (auto, 0.95)
- L3: Normalized name (auto if unique, 0.85)
- L4: Fuzzy trigram > 0.7 (review, 0.7-0.95)
- L5: AI assist via Claude API (always review)

---

## Skill #6: account-mapper (Rule Engine)
**Priority**: Phase 2 | **Effort**: 2 days

### תפקיד
Configurable rules: supplier/category → expense account.

### Interface
```ts
export interface AccountRule {
  id: string;
  priority: number;
  matchSupplier?: string;
  matchCategory?: string;
  matchAmountRange?: [number, number];
  outputs: {
    expenseAccount: string;
    vatAccount: string;
    costCenter?: string;
  };
}

export function findMatchingRule(
  invoice: InvoiceCanonical,
  rules: AccountRule[]
): AccountRule | null;
```

---

## Skill #7: scenario-detector
**Priority**: Phase 2 | **Effort**: 1 day

### תפקיד
בוחר תרחיש JE מתוך 12 (per playbook).

### Interface
```ts
export type Scenario =
  | 'STANDARD'
  | 'FOREIGN_CURRENCY'
  | 'WITH_ALLOCATION'
  | 'MULTI_EXPENSE'
  | 'WITH_COST_CENTER'
  | 'MIXED_DEDUCTION'
  | 'WITH_DISCOUNT'
  | 'CREDIT_NOTE'
  | 'WITH_WITHHOLDING'
  | 'IMMEDIATE_PAYMENT'
  | 'DIFFERENT_DATES'
  | 'AGGREGATOR'
  | 'MISSING_ALLOCATION';  // ERROR — block

export function detectScenario(
  invoice: InvoiceCanonical,
  context: DetectorContext
): Scenario;
```

---

## Skill #8: fx-engine
**Priority**: Phase 2 | **Effort**: 2 days

### תפקיד
ניהול מטבע חוץ + שערי חליפין.

### Interface
```ts
export interface FxRate {
  currency: string;
  rate: number;
  date: string;
  source: 'BoI' | 'manual' | 'override';
}

export async function getDailyRate(
  currency: string,
  date: string
): Promise<FxRate>;

export function convertToILS(
  amount: number,
  currency: string,
  rate: number
): number;

export function buildFxJournalEntry(
  invoice: InvoiceCanonical,
  rate: FxRate
): JournalEntry;  // dual-currency lines
```

---

## Skill #9: priority-instructions
**Priority**: Phase 2 | **Effort**: 1 day

### תפקיד
Generates step-by-step Priority configuration instructions per scenario.

### Interface
```ts
export interface Instruction {
  step: number;
  title: string;
  description: string;
  screenshot?: string;
  priorityVersion?: string;
  confirmationCheck?: string;  // "click to verify"
}

export function getInstructions(
  topic: 'parameters_setup' | 'first_load' | 'bank_account' | 'fx_setup' | 'pcn874',
  context: { priorityVersion: string; companyType: string }
): Instruction[];
```

---

## Skill #10: audit-logger
**Priority**: Phase 1 | **Effort**: 1 day

### תפקיד
Append-only audit trail. Compliance requirement.

### Interface
```ts
export interface AuditEvent {
  ts: string;
  companyId: string;
  userId: string;
  action: string;        // 'invoice.create' | 'je.edit' | 'batch.export' | ...
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  metadata?: { ip?: string; userAgent?: string };
}

export async function logEvent(event: AuditEvent): Promise<void>;
export async function queryEvents(
  filter: AuditQuery
): Promise<AuditEvent[]>;
```

### תכונות
- Append-only (no UPDATE / DELETE on table)
- Encrypted at rest
- Indexed: companyId, action, ts
- Retention: 7 years (Israeli tax requirement)

---

## Build Order Recommended

**Phase 1** (sequential — each unblocks the next):
1. invoice-schema (foundation for all)
2. israeli-vat-logic
3. je-validator
4. movein-generator
5. audit-logger (cross-cutting, parallel)

**Phase 2**:
6. supplier-matcher
7. account-mapper
8. scenario-detector
9. fx-engine
10. priority-instructions

---

## Conventions

### File structure per skill
```
skills/<skill-name>/
├── src/
│   ├── index.ts          # Public API
│   ├── types.ts          # Type definitions
│   └── internal/         # Helpers, not exported
├── tests/
│   ├── unit.test.ts
│   ├── integration.test.ts
│   └── fixtures/
├── README.md             # Quick start, examples
└── package.json          # If we go monorepo
```

### Tests
- Unit: each public function
- Integration: real workflows (e.g., invoice → MOVEIN.DAT byte match POC)
- Snapshot tests for byte-level output

### Code Style
- TypeScript strict mode
- No `any`
- Explicit return types
- Zod for runtime validation
- Comments in English (lang of code)
- User-facing strings in Hebrew (separate i18n file)
