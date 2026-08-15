# Phase 1 — MVP

> **הערת סטטוס (יוני 2026):** מסמך זה הוא תוכנית מקורית ואינו משקף את המצב
> העדכני. חלקים שסומנו כאן Out of Scope כבר נבנו (PCN874, התאמות בנק,
> דוחות, שכר, נכסים, ייבוא מבנה אחיד). מקור האמת העדכני: `MVP_SPEC.md`.

**מטרה**: מערכת end-to-end עם CPA אחד אמיתי (שני / טארי) שמשתמש בפועל.
**משך**: 4-6 שבועות (אם פיתוח full-time עם Claude Code)
**Definition of Done**: שני מטמיעה 50 חשבוניות חודש דרך המערכת בלי לחזור להזנה ידנית.

---

## Milestones

### M1: Skills Foundation (שבוע 1-2)
4 skills עצמאיים עם tests:

#### Skill #1: movein-generator
- **Inputs**: array of canonical JSON invoices + company config (accounts, transaction type)
- **Outputs**: movein.dat file (CP1255, 180-char records, CR+LF)
- **Tests**: 
  - Round-trip על 2 חשבוניות ה-POC
  - בייט-לבייט match למה שעבד
  - Edge cases: long invoice numbers, Hebrew chars, FX

#### Skill #2: invoice-schema (canonical)
- **תפקיד**: Zod/TypeBox schema + validators + mappers
- **Mappers**: Azure DI output → canonical, Google DI → canonical
- **Outputs**: typed TypeScript types

#### Skill #3: israeli-vat-logic
- **תפקיד**:
  - VAT rate per date (17/18%)
  - Allocation threshold check
  - Mixed deduction calculation
  - Rounding tolerance
- **Tests**: per scenario מ-`05_domain/je_scenarios_playbook.md`

#### Skill #4: je-validator
- **תפקיד**: 10 validation checks
- **Outputs**: `{passed: bool, errors: [], warnings: []}`
- **Tests**: per check, both passing and failing cases

### M2: Data Layer (שבוע 2-3)
- Supabase schema (per `04_architecture/data_model.md`)
- RLS policies for multi-tenant
- Migrations
- Seed data (test company + sample invoices)

### M3: API / Edge Functions (שבוע 3)
- POST /invoices — ingest
- GET /invoices — list
- POST /invoices/:id/approve — approve
- POST /batches — create batch from approved
- GET /batches/:id/movein — download MOVEIN.DAT

### M4: UI — Critical Screens Only (שבוע 4-5)
Lovable או React build (החלטה pending):
- Auth (login + signup)
- Dashboard (basic)
- Invoice queue
- JE editor
- Batch & export

לא בPhase 1: Settings UI מלא, mobile, reports.

### M5: OCR Integration (שבוע 5)
- Azure Document Intelligence
- Hebrew prebuilt-invoice
- Confidence-based routing
- Fallback to manual (for low confidence)

### M6: First Customer Pilot (שבוע 6)
- שני נכנסת למערכת
- מעלה 5 חשבוניות אמיתיות
- מאשרת JEs
- מורידה MOVEIN.DAT
- טוענת לפריוריטי של טארי
- מאשרת שזה עובד
- ✅ MVP done

---

## Stack Definitions

```
Frontend:
  - Lovable (אם מאושר) או Next.js + Tailwind + shadcn/ui
  - Supabase JS client
  - React Hook Form + Zod
  - TanStack Query (server state)
  - Vitest + Playwright

Backend:
  - Supabase Postgres (multi-tenant via RLS)
  - Supabase Edge Functions (Deno + TypeScript)
  - Supabase Storage (PDFs)

Integrations:
  - Azure Document Intelligence
  - Resend / SendGrid (transactional emails)
  - Stripe / Cardcom (billing — Phase 1 minimal)

Observability:
  - Sentry (errors)
  - PostHog (analytics)
  - Supabase logs

DevOps:
  - GitHub repo
  - Vercel (frontend deploys)
  - Supabase Cloud (backend)
  - GitHub Actions (CI/tests)
```

---

## Daily Workflow Recommendations

**Morning** (1-2 hours):
- פתח Claude Code
- קרא phase_1_mvp.md למיקום עצמך
- בחר משימה אחת
- תן ל-Claude prompt ממוקד

**Afternoon** (1-2 hours):
- Code review של מה שעוז כתב
- Tests verification
- Push to GitHub

**End of Day**:
- Update progress log
- Plan tomorrow's task

---

## Gates / Checkpoints

לפני המעבר ל-Phase 2:

- [ ] 4 skills עוברים tests מקיפים
- [ ] שני מצליחה לעבד 5 חשבוניות end-to-end
- [ ] 80%+ auto-validation pass rate
- [ ] No critical bugs in production for 2 weeks
- [ ] Documentation updated based on learnings

---

## Risks for Phase 1

| Risk | Mitigation |
|---|---|
| OCR לא מספיק מדויק | Confidence threshold + manual review queue |
| Supabase complexity overwhelming | Start with Supabase Studio, add Edge Functions only when needed |
| Too many features creep in | Stick to checklist. Defer to Phase 2. |
| First user (שני) blocked | Daily standup, weekly demo, fast iteration |

---

## Out of Scope (Phase 1)

- Multi-firm support
- 2FA
- Advanced reporting
- Bank reconciliation
- Mobile app (responsive web only)
- White label
- API for external integrations
- WhatsApp ingestion
- PCN874 export
- Automated allocation API integration
- Customer portal

---

## Success Metrics

After 4 weeks of pilot:
- Time per invoice: < 1 minute (from CPA receiving to JE approved)
- Auto-approval rate: > 70%
- Errors per 100 invoices: < 5
- שני NPS: > 50 ("יותר מדי ההמלצתי לחברים")
- 0 data loss incidents
- < 5 P1 bugs total
