# Priority CPA Automation — Code

Monorepo of TypeScript packages implementing the Priority CPA Automation product.

The architecture, domain knowledge, and product spec live in the parent directory (`../`). This folder contains only code.

## Layout

```
code/
├── package.json             # workspace root
├── tsconfig.base.json       # shared TS config
├── packages/
│   └── skills/              # standalone, pure-logic skills
│       ├── invoice-schema/      # Zod schemas + OCR mappers (foundation)
│       ├── israeli-vat-logic/   # VAT rate by date, allocation, mixed deductions
│       ├── je-validator/        # 10-check validation gate
│       ├── audit-logger/        # append-only audit trail
│       └── movein-generator/    # 180-char MOVEIN.DAT (POC byte-exact)
└── supabase/
    └── migrations/
        └── 0001_initial_schema.sql  # multi-tenant schema with RLS
```

## Quick start

```bash
cd code
npm install
npm test          # run all skill test suites
npm run typecheck # strict TS check across the monorepo
```

## M1 status (Phase 1 — skills foundation)

| Skill                | State | Tests | Notes                                                     |
| -------------------- | ----- | ----- | --------------------------------------------------------- |
| `invoice-schema`     | done  | 9     | Canonical Zod + JE schema + OCR mapper signatures         |
| `israeli-vat-logic`  | done  | 16    | 17/18%, allocation 25K/20K, mixed deductions, rounding    |
| `je-validator`       | done  | 12    | All 10 checks; error codes + Hebrew/English messages      |
| `audit-logger`       | done  | 9     | In-memory store; DB-backed lands with M2                  |
| `movein-generator`   | done  | 8     | Byte-exact match against POC `movein_working.dat`         |

## M2 status (Phase 1 — data layer)

- Schema migration drafted: [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)
- Not yet applied — needs an actual Supabase project to run against.

## Conventions

- Node ≥ 20, TypeScript strict mode, ESM
- Vitest for tests, Zod for runtime validation
- No build step — packages export `src/index.ts` directly. A build pipeline will be added when the first deployable consumer (Edge Functions / Next.js app) needs it.
- Hebrew strings only as data/UX content. Code, comments, error codes — English.

## Roadmap (next)

- M3 — Edge Functions (REST endpoints): requires Supabase project URL + service role
- M4 — Next.js web app (auth + invoice queue + JE editor + batch export)
- M5 — Azure Document Intelligence integration (real OCR)
- M6 — Pilot with Tari + Shani
