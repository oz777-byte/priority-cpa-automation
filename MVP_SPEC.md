# Priority CPA Automation — מפרט אב לתחילת ה-MVP

**תאריך:** 03/05/2026  
**סטטוס:** Phase 13 הושלם · 19 מיגרציות · 13 פאזות · 256+ בדיקות · מערכת מוכנה לפיילוט  
**הנעה:** עוז (יזם סולו, עפולה) · רו"ח פיילוט: שני (לקוחות יעד: וירטהיים, צרפתי, ועוד)

---

## תוכן עניינים

1. [סיכום מנהלים](#1-סיכום-מנהלים)
2. [חזון ואסטרטגיה](#2-חזון-ואסטרטגיה)
3. [ארכיטקטורת המערכת](#3-ארכיטקטורת-המערכת)
4. [מודל הנתונים — 19 מיגרציות](#4-מודל-הנתונים--19-מיגרציות)
5. [המוח החשבונאי — 57 חוקי אוטומציה](#5-המוח-החשבונאי--57-חוקי-אוטומציה)
6. [Skills (Packages פנימיים)](#6-skills-packages-פנימיים)
7. [מסכים ומודולים](#7-מסכים-ומודולים)
8. [תאימות חוקית — מע"מ ישראלי](#8-תאימות-חוקית--מעמ-ישראלי)
9. [שילובים חיצוניים](#9-שילובים-חיצוניים)
10. [זרימות משתמש (User Journeys)](#10-זרימות-משתמש-user-journeys)
11. [סטטוס פיתוח: מה הוטמע · מה נדחה](#11-סטטוס-פיתוח-מה-הוטמע--מה-נדחה)
12. [מטריקות פיילוט](#12-מטריקות-פיילוט)

---

## 1. סיכום מנהלים

**המוצר:** SaaS לרואי חשבון ישראלים שמאוטומציית הזנת חשבוניות ספק (וגם מכירות, משכורות, נכסי קבע, דיווח מע"מ) לתוכנת **פריוריטי** דרך פורמט **MOVEIN.DAT** של חשבשבת.

**הבעיה:** רו"ח ישראלי טיפוסי מנהל 5-30 חברות לקוח. כל חודש הוא מקבל ~50 חשבוניות לחברה (ב-PDF, מייל, או צילום). ההזנה הידנית לפריוריטי (עם כל הסיווגים החשבונאיים, מע"מ מעורב, ניכוי במקור, מספר הקצאה, וכו') אורכת ~5 דקות לחשבונית = **125 שעות עבודה חודשיות** לרו"ח שמטפל ב-25 חברות.

**הפתרון:** PDF נכנס למערכת → OCR מחלץ → המוח החשבונאי בונה JE אוטומטית לפי תרחיש (מתוך 57 תרחישים) → רו"ח מאשר או מתקן → קובץ MOVEIN.DAT נוצר → הרו"ח טוען לפריוריטי. **יעד: פחות מדקה לחשבונית.**

**ערך עסקי לרו"ח:** חיסכון של 100+ שעות חודשיות = יכולת לטפל בפי 3 לקוחות, או הפחתת תעריף תחרותי, או רווח שעתי גבוה יותר.

**המודל העסקי המוצע:** מנוי SaaS (תמחור טרם הוכרע — pending: per-company / per-invoice / per-CPA / hybrid).

**גודל שוק (ישראל):** ~9,000 רו"ח עצמאיים, ~3,000 משרדי רו"ח. שוק ראשוני: רו"ח-יחיד-מטפל-ב-עסקים-קטנים (פרסונת שני).

---

## 2. חזון ואסטרטגיה

### 2.1 חזון
**"רו"ח ישראלי לא צריך לדעת מה זה JE. המערכת בונה לו את כל הפקודות לפי החוק, והוא רק מאשר או חורג."**

### 2.2 עקרונות מוצר
1. **CPA-first UX** — כל החלטת ממשק נמדדת ב"זמן שחוסך לרו"ח". לא לבעלי עסק (אופציה עתידית).
2. **Multi-tenant מהיום הראשון** — RLS על כל טבלה, `firms → user_firms → companies` היררכיה.
3. **חוקיות לפני נוחות** — כל אוטומציה תעבור לפי חוק מע"מ הישראלי, גם אם UX מתסבך.
4. **Hebrew-first** — כל ה-UI בעברית. שמות חשבונות, סוגי תנועה, פרטים — עברית.
5. **MOVEIN.DAT הוא הצינור** — לא TSV ישיר, לא API לפריוריטי (אלא אם תקנה רישיון).

### 2.3 פרסונה ראשית — שני (רו"ח עצמאית)
- **גיל:** 35-50  
- **לקוחות:** 15-25 חברות בע"מ קטנות (עסקי שירות, מסחר קטן, חופשיים)  
- **כלים נוכחיים:** פריוריטי + Excel + WhatsApp + מייל  
- **כאב מרכזי:** הזנה ידנית של חשבוניות (5 דק׳ × 50 חשבוניות × 25 חברות = 100+ שעות חודשיות)  
- **מודעות טכנית:** בינונית — יודעת להעלות PDF, להוריד CSV, לשלוח אישור ב-WhatsApp  
- **ערך:** חיסכון של 80-100 שעות חודשיות = ₪10K-15K שכר חודשי שמתפנה

### 2.4 שלבי שוק
- **Phase 1 (MVP):** פיילוט עם שני על 2-3 חברות אמיתיות. אימות שכל חשבונית באמת חוסכת זמן.
- **Phase 2:** הרחבה ל-5 רו"ח דרך המלצות שני. תמחור פר-חברה (~₪50-200 חודשי).
- **Phase 3:** White label / שילוב עם ספקי תוכנה אחרים (חשבשבת? מערכת רמדור?).

### 2.5 החלטות אסטרטגיות נעולות
| החלטה | רציונל |
|---|---|
| MOVEIN.DAT הוא נתיב הייצוא לפריוריטי | בדוק ועובד; API דורש רישיון יקר |
| HASH הוא קוד תוכנת מקור ב-Priority parameters | מוסכם עם פריוריטי |
| Supabase = source of truth (לא Priority) | פריוריטי = יעד בלבד |
| Multi-tenant מהיום | קשה לשדרג single-tenant אחר כך |
| ישראל בלבד שנה ראשונה | לא לבנות i18n כרגע |
| חברות בע"מ בלבד | לא מטפלים בעוסק פטור / מלכ"ר / מוסד כספי |

---

## 3. ארכיטקטורת המערכת

### 3.1 Stack טכנולוגי

| שכבה | טכנולוגיה | סיבה |
|---|---|---|
| Frontend Framework | **Next.js 14 (App Router)** | SSR לדפי דשבורד עם Auth, RSC לביצועים |
| UI Library | **React 18 + Tailwind CSS** | Component-driven, RTL נטיב |
| Language | **TypeScript strict mode** + `exactOptionalPropertyTypes` | Type-safety ב-100% מהקוד |
| Hosting Frontend | **Vercel** | Auto-deploy מ-GitHub main, edge functions |
| Backend / DB | **Supabase Postgres** | RLS multi-tenancy מובנה, Auth, Storage, Realtime |
| Auth | **Supabase Auth** + 2FA (TOTP) | פתרון מקיף, MFA נטיב |
| Storage | **Supabase Storage** + bucket `invoice_pdfs` | אחסון קבצי OCR מקוריים |
| OCR | **Azure Document Intelligence** (Hebrew prebuilt-invoice) | המודל הטוב ביותר לחשבוניות עברית |
| FX Rates | **בנק ישראל** (API ציבורי, cached יומי) | חוקי, רשמי |
| Audit Logger | מותאם — `audit_log` table | חובה רגולטורית, גם לגילוי באגים |
| Tests | **Vitest** | מהיר, אינטגרציה native עם TypeScript ESM |
| Code Style | npm workspaces + monorepo | Skills מבודדים, reusable |

### 3.2 מבנה Repo

```
priority-cpa-automation/
├── 00-08_*/                          # תיעוד אסטרטגי (vision, market, modules)
├── code/                             # הקוד הפעיל
│   ├── apps/web/                     # אפליקציית Next.js
│   │   ├── app/                      # App Router pages
│   │   │   ├── api/                  # API routes (movein, pcn874, reports CSVs)
│   │   │   ├── dashboard/
│   │   │   │   ├── companies/
│   │   │   │   ├── accounting-rules/  # ספריית חוקים — 57 חוקים
│   │   │   │   ├── admin/             # users, rule-notes, ocr-quality
│   │   │   │   └── c/[companyId]/
│   │   │   │       ├── invoices/      # ספק (AP)
│   │   │   │       ├── sales-invoices/ # לקוחות (AR)
│   │   │   │       ├── journal-entries/ # עורך JE
│   │   │   │       ├── bank-reconciliation/ # 8 תרחישי בנק
│   │   │   │       ├── payroll/
│   │   │   │       ├── assets/        # נכסי קבע + פחת
│   │   │   │       ├── periods/       # תקופות + נעילה
│   │   │   │       ├── pcn874/        # דיווח מע"מ + תיקון רטרואקטיבי
│   │   │   │       ├── reports/       # 5 דוחות + CSV
│   │   │   │       ├── suppliers/     # מאסטר ספקים
│   │   │   │       ├── customers/
│   │   │   │       ├── items/         # קטלוג מוצרים
│   │   │   │       ├── accounts/      # תרשים חשבונות
│   │   │   │       ├── account-mapping/ # חוקי מיפוי חשבונות
│   │   │   │       ├── exports/       # היסטוריית MOVEIN
│   │   │   │       └── settings/
│   │   ├── components/                # data-table, sidebar, je editor, etc.
│   │   └── lib/                       # auth, company-context, supabase admin, fx, reports
│   ├── packages/skills/               # ה-Skills כ-monorepo packages
│   │   ├── invoice-schema/            # Zod schemas (canonical AP + Sales)
│   │   ├── israeli-vat-logic/         # שיעורי מע"מ, ניכוי מעורב, רף הקצאה, חוק 6 חודשים
│   │   ├── je-validator/              # 11 בדיקות ולידציה
│   │   ├── scenario-detector/         # זיהוי תרחיש מ-canonical
│   │   ├── je-constructor/            # 46 builders (AP + AR + Bank + Payroll + Assets)
│   │   ├── movein-generator/          # 180-char + FLEXIBLE
│   │   ├── pcn874-builder/            # Sha'am-spec, Win1255
│   │   ├── ocr-azure/                 # Document Intelligence wrapper
│   │   ├── boi-rates/                 # BoI FX cache
│   │   └── audit-logger/              # SupabaseAuditStore
│   └── supabase/migrations/           # 19 קבצי SQL רציפים (0001..0019)
└── MVP_SPEC.md                        # ← המסמך הזה
```

### 3.3 Multi-Tenancy

**היררכיה:**
```
firms (משרד רו"ח)
  ↓ (1:N)
user_firms (חברות במשרד)
  ↓ (1:N)
companies (לקוחות הרו"ח)
  ↓ (1:N)
invoices_inbox / sales_invoices / journal_entries / ...
```

**RLS pattern (חוזר על כל טבלה tenant-scoped):**
```sql
create policy "tenant read X"
on X for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);
```

**Admin access:** משתמשים עם `users.role = 'admin'` יכולים לראות חוצה-tenant (ל-OCR quality dashboard וכו').

### 3.4 Auth Flow

1. משתמש נכנס דרך `/login` (Supabase Auth — email + password)
2. אם 2FA מופעל — מעבר ל-`/login/mfa` עם TOTP challenge
3. Session-cookie נשמר על-ידי Supabase SSR
4. Middleware (`apps/web/middleware.ts`) — חוסם גישה לאזורי dashboard ללא session
5. Bootstrap (אם קיים auth.user אבל אין `public.users` row) — `ensure_user_firm()` + יצירת firm חדש

### 3.5 Deployment
- **Auto:** push ל-GitHub `main` → Vercel build & deploy תוך ~90 שניות
- **Migrations:** ידני — העתקה מקובץ ל-Supabase SQL Editor (הופץ אוטומטית בעתיד דרך Supabase CLI)
- **Env vars:** Vercel project + `.env.local` לפיתוח. סודות ב-Supabase Vault.

---

## 4. מודל הנתונים — 19 מיגרציות

### 4.1 רשימת מיגרציות בסדר ביצוע

| # | שם | תוכן עיקרי |
|---|---|---|
| 0001 | initial_schema | `firms`, `users`, `user_firms`, `companies`, `suppliers`, `supplier_aliases`, `invoices_inbox`, `journal_entries`, `journal_entry_lines`, `movein_batches`, `audit_log` |
| 0002 | admin_security | `app_role` enum (`admin`/`member`), `users.role`, RLS policies לאדמין |
| 0003 | user_bootstrap | פונקציה `ensure_user_firm()` ליצירת משרד אוטומטית |
| 0004 | link_shany_to_oz_firm | data fix — לא מבני |
| 0005 | invoice_pdfs_bucket | Storage bucket + RLS לקבצי PDF |
| 0006 | bank_transactions | טבלה לתנועות בנק (CSV import עתידי) |
| 0007 | company_inbox_token | `companies.inbox_token` — כתובת מייל ייחודית פר-חברה |
| 0008 | boi_fx_rates | `fx_rates` table — cache שערי בנק ישראל |
| 0009 | customers_items_accounts | מאסטר לקוחות, פריטים, ותרשים חשבונות. `account_type` enum |
| 0010 | sales_invoices | `sales_invoices` table + `journal_entries.sales_invoice_id` |
| 0011 | payroll | `payroll_entries` + `journal_entries.payroll_entry_id` |
| 0012 | periods_and_je_numbering | `accounting_periods` (open/locked/closed), `journal_entries.je_number` (חוק ישראלי — מספור רץ ייחודי), period-check trigger לחסימת JE בתקופה נעולה |
| 0013 | rule_improvement_notes | טבלה למשוב משתמשים על חוקי המוח |
| 0014 | pcn874_exports | היסטוריית ייצוא דיווח 874 |
| 0015 | fixed_assets | `fixed_assets`, `fixed_asset_depreciation_runs`, `journal_entries.fixed_asset_id`. enum קטגוריות (computers/vehicles/buildings/...) |
| 0016 | vat_compliance_enhancements | `companies.vat_basis` (accrual/cash), `vat_filing_frequency`, `suppliers.dealer_status` (registered/exempt/foreign), `journal_entries.vat_reporting_date` (תיקון late invoice bug), `vat_rates_history` table (15.5/16/17/18% לפי תאריך), `get_vat_rate_for_date()` SQL function |
| 0017 | pcn874_corrections | `pcn874_exports.is_correction/correction_of_id/correction_sequence/correction_reason`, `period_reopens` audit table |
| 0018 | workflow_improvements | `invoices_inbox.reviewed_at/reviewed_by` (bulk review), `suppliers.learned_from_count/last_learned_at` (auto-learning) |
| 0019 | ocr_feedback | `ocr_corrections` table (field-level), `companies.auto_approve_ocr_threshold` |

### 4.2 טבלאות-ליבה — סקירה

#### `firms` + `user_firms` + `companies`
- `firms` — משרד רו"ח (אחד פר רו"ח)
- `user_firms` — מיפוי משתמשים למשרדים
- `companies` — חברות לקוח, scoped ל-firm
- שדות חברה חשובים: `tax_id` (ע.מ 9 ספרות), `priority_version`, `vat_basis`, `vat_filing_frequency`, `auto_approve_ocr_threshold`, `inbox_token`, `settings` (jsonb)

#### `suppliers` + `customers`
- מאסטר ספקים/לקוחות פר-חברה
- שדות חשובים: `internal_code` (קוד פריוריטי), `tax_id`, `dealer_status` (`registered`/`exempt`/`foreign`), `default_expense_account`, `default_cost_center`, `learned_from_count`
- `supplier_aliases` — שמות חלופיים לזיהוי OCR (וירטהיים בע"מ ↔ Wertheim Ltd)

#### `invoices_inbox`
- כל החשבוניות הנכנסות (ספק)
- `canonical` (jsonb) — Schema validated ב-Zod
- `status` enum: `received` / `processing` / `classified` / `queued` / `approved` / `exported` / `error`
- `pdf_path` — pointer ל-Storage bucket
- `fingerprint` — hash דה-דופ
- `reviewed_at` / `reviewed_by` — bulk review tracking
- `source` enum: `upload` / `email` / `manual` / `ocr_bulk`

#### `journal_entries` + `journal_entry_lines`
- ה-General Ledger
- עמודות: `company_id`, `invoice_id`, `sales_invoice_id`, `payroll_entry_id`, `fixed_asset_id` (back-references מכל המקורות)
- `scenario` (text) — לאיזה תרחיש מהמוח שייך
- `movein_format` enum: `180` / `flexible`
- `status` enum: `draft` / `approved` / `exported` / `cancelled` / `error`
- **`je_number`** — מספור רץ פר-חברה (חוק ישראלי, אין חוסרים), נוצר ע"י trigger
- **`vat_reporting_date`** — תאריך הדיווח ב-PCN874 (יכול להיות שונה מ-`document_date` עבור late invoices)
- שורות (`journal_entry_lines`): `account`, `debit`, `credit`, `debit_fx`, `credit_fx`, `details`. constraint: `debit = 0 OR credit = 0`

#### `accounting_periods`
- פר-חברה × (year, month)
- `status`: `open` / `locked` / `closed`
- `locked_at`, `locked_by`, `notes`
- מנגנון: trigger `check_period_open_for_je()` חוסם insert של JE בתקופה נעולה
- אוטומציה: בעת הפקת PCN874 → התקופה ננעלת

#### `pcn874_exports`
- היסטוריה של כל הפקה
- snapshot של סיכומים: `total_inputs_subtotal`, `total_inputs_vat`, `total_sales_subtotal`, `total_sales_vat`, `vat_to_pay`
- `file_content` (text), `file_md5` (לאימות), `file_byte_size`
- `is_correction` + `correction_of_id` + `correction_sequence` (תיקונים רטרואקטיביים)
- `period_locked_by_this` — האם ההפקה גרמה לנעילת התקופה

#### `period_reopens`
- audit log של פתיחות תקופה לתיקון 874
- `reason` (חובה, מינ' 10 תווים), `reopened_by`, `closed_at`, `resulting_export_id`

#### `fixed_assets` + `fixed_asset_depreciation_runs`
- מאסטר נכסי קבע: `category` enum, `purchase_amount`, `depreciation_rate_annual`, `useful_life_months`, `salvage_value`, `accumulated_depreciation`
- `status`: `active` / `sold` / `disposed` / `inactive`
- `depreciation_runs` — idempotent log של ריצות פחת חודשיות (asset, year, month — UNIQUE)

#### `payroll_entries`
- תלוש שכר חודשי פר-עובד
- שדות מפורטים: `gross`, `ni_employee`, `income_tax`, `pension_employee`, `study_fund_employee`, `ni_employer`, `pension_employer`, `study_fund_employer`, `severance_employer`
- מייצר 3 JEs: `PAYROLL_MONTHLY`, `PAYROLL_EMPLOYER`, `PAYROLL_PAYMENT`

#### `bank_transactions`
- תנועות בנק (CSV import — Phase עתידי)
- `cash_bank_scenario` enum: 8 תרחישים (BANK_FEE / INTEREST_INCOME / INTER_ACCOUNT_TRANSFER / ...)
- בעת בחירת תרחיש → JE נוצר אוטומטית

#### `accounts` (תרשים חשבונות)
- `code`, `name`, `type` (asset/liability/income/expense/equity), `parent_account_id`, `is_active`, `is_system`
- ירושה לחברה — בעת יצירת חברה ייטענו ~30 חשבונות-בסיס

#### `vat_rates_history`
- 5 רשומות: 15.5% (2009), 16% (2010), 18% (2013), 17% (2015), 18% (2025)
- function `get_vat_rate_for_date(date)` מחזירה את שיעור המע"מ הנכון לתאריך

#### `ocr_corrections`
- field-level corrections מ-Phase 13
- `field_path` (e.g. "totals.total"), `original_value`, `corrected_value`, `corrected_by`, `corrected_at`
- בסיס לכוונון מודל בעתיד

#### `audit_log`
- כל פעולת write נרשמת
- `action` (e.g. `je.create`, `period.reopen_for_correction`)
- `entity_type`, `entity_id`, `payload` (jsonb), `user_id`, `created_at`

#### `rule_improvement_notes`
- משוב משתמשים על חוקי המוח
- `rule_id`, `rule_code`, `rule_title`, `note`, `status` (`open`/`reviewing`/`planned`/`shipped`/`rejected`/`duplicate`)

---

## 5. המוח החשבונאי — 57 חוקי אוטומציה

### 5.1 ארכיטקטורה — איך JE נבנה

```
PDF נכנס
   ↓ (Azure OCR)
Extracted JSON
   ↓ (mappers)
CanonicalInvoice (Zod-validated)
   ↓ (scenario-detector)
Scenario חזק + Overlays חלשים
   ↓ (je-constructor)
JERecord[] (1+ records, balanced)
   ↓ (validator)
ValidationResult (errors + warnings)
   ↓ (DB insert)
journal_entries + journal_entry_lines
   ↓ (movein-generator)
180-char records OR FLEXIBLE
   ↓ (file)
movein.dat
   ↓ (CPA imports manually)
Priority ERP
```

### 5.2 הקטגוריות (8 ב-UI)

| קטגוריה | חוקים | סטטוס |
|---|---|---|
| צד הספקים (AP) | 16 | כולם auto / auto-with-warning |
| צד הלקוחות (AR) | 16 | כולם auto / auto-with-warning |
| בנק · אשראי · מזומן | 8 | כולם auto |
| משכורות | 3 | כולם auto |
| נכסי קבע ופחת | 3 | כולם auto |
| מלאי | 3 | coming-soon |
| התאמות סוף תקופה | 4 | 1 auto-with-warning, 3 coming-soon |
| סגירת שנה | 4 | coming-soon |
| **סה"כ** | **57** | **44 auto · 13 coming-soon** |

### 5.3 16 תרחישי ספק (AP)

| # | קוד | סטטוס | תיאור קצר | מבנה JE |
|---|---|---|---|---|
| 1 | STANDARD | auto | חשבונית רגילה תשלום שוטף | DR הוצאה + DR מע"מ / CR ספק |
| 2 | WITH_ALLOCATION | auto-warn | מספר הקצאה (חוק 2024+) | זהה ל-STANDARD + warning אורך > 5 |
| 3 | IMMEDIATE_PAYMENT | auto | תשלום מיידי במקום | DR הוצאה + DR מע"מ / CR בנק/אשראי/מזומן |
| 4 | CREDIT_NOTE | auto | זיכוי | הפוך מ-STANDARD |
| 5 | WITH_WITHHOLDING | auto | ניכוי במקור | 4 שורות: DR הוצ' + DR מע"מ / CR ספק (נטו) + CR רשות מסים |
| 6 | MULTI_EXPENSE | auto | חשבונית עם 2+ קטגוריות הוצאה | רשומה פר-קטגוריה (עד 2 ב-180, עד 8 ב-FLEXIBLE) |
| 7 | WITH_COST_CENTER | auto | מרכז עלות (פרויקט) | זהה + שדה cost_center בכל שורת DR. דורש FLEXIBLE לייצוא |
| 8 | MIXED_DEDUCTION | auto-warn | קיזוז חלקי לפי חוק (12 קטגוריות) | 2 רשומות (מנוכה + לא מנוכה) |
| 9 | FOREIGN_CURRENCY | auto-warn | מטבע זר | זהה + שדות FX (`debit_fx`, `credit_fx`) + שער מ-BoI |
| 10 | DIFFERENT_DATES | auto | תאריך ערך ≠ תאריך חשבונית | זהה + value_date שונה |
| 11 | WITH_DISCOUNT | auto | הנחה מסחרית בתוך חשבונית | סכומים כבר מקופלים, רק הערה |
| 12 | AGGREGATOR | auto | חשבונית מרוכזת (Tranzila / Pelecard) | זהה ל-STANDARD |
| 13 | MISSING_ALLOCATION | auto-warn | מעל הרף ללא הקצאה | JE נבנה אבל ייצוא חסום |
| 14 | SELF_INVOICE | auto-warn | חשבונית עצמית (שירות זר) | 4 שורות: DR הוצ' + DR מע"מ תשומ' / CR מע"מ עסק' + CR ספק זר |
| 15 | PRIVATE_SUPPLIER | auto-warn | יחיד בלי ע.מ (ניכוי 30%) | 3 שורות בלי מע"מ |
| 16 | PREPAID | auto | הוצאה לתקופות (ביטוח שנתי) | DR הוצ' מראש (102-0) + DR מע"מ / CR ספק. הכרה חודשית עתידית |

#### Overlays (תוספי-תרחיש)
- WITH_ALLOCATION, WITH_COST_CENTER, DIFFERENT_DATES, WITH_DISCOUNT — יכולים להופיע **בנוסף** לתרחיש ראשי
- מפעילים אזהרות / שדות נוספים / שינוי פורמט ייצוא

### 5.4 16 תרחישי לקוח (AR)

| # | קוד | סטטוס | תיאור קצר |
|---|---|---|---|
| 1 | AR_STANDARD | auto | חשבונית מס B2B |
| 2 | AR_INVOICE_RECEIPT | auto | חשבונית מס-קבלה |
| 3 | AR_PROFORMA | auto | חשבונית עסקה (proforma) |
| 4 | AR_RECEIPT | auto | קבלה כנגד חשבונית קיימת |
| 5 | AR_CREDIT_NOTE | auto | זיכוי לקוח |
| 6 | AR_CASH_SALE | auto | מכירה במזומן ישירה |
| 7 | AR_CARD_SALE | auto | מכירה באשראי (סליקה עתידית) |
| 8 | AR_POSTDATED_CHECK | auto | צ'ק דחוי |
| 9 | AR_INSTALLMENTS | auto | תשלומים (3/6/12) |
| 10 | AR_EXPORT | auto | ייצוא (0% מע"מ) |
| 11 | AR_VAT_EXEMPT | auto | פטור מע"מ (אילת, תיירים) |
| 12 | AR_FOREIGN_CURRENCY | auto | מכירה ב-USD/EUR/GBP |
| 13 | AR_WITH_WITHHOLDING | auto | לקוח B2G מנכה במקור |
| 14 | AR_ADVANCE | auto | מקדמה מלקוח לפני הנפקת חשבונית |
| 15 | **AR_BAD_DEBT** | auto-warn | חוב אבוד **+ השבת מע"מ עסקאות** (סעיף 39א) |
| 16 | **AR_POST_INVOICE_DISCOUNT** | auto | הנחה לאחר חשבונית — חלקי (≠ זיכוי מלא) |

### 5.5 8 תרחישי בנק/אשראי/מזומן

| # | קוד | תיאור |
|---|---|---|
| 1 | BANK_FEE | עמלת ניהול / שורה / כרטיסים |
| 2 | INTEREST_INCOME | ריבית זכות |
| 3 | INTEREST_EXPENSE | ריבית חובה (אוברדרפט) |
| 4 | INTER_ACCOUNT_TRANSFER | העברה בין חשבונות פנימיים |
| 5 | CASH_DEPOSIT | הפקדת מזומן לבנק |
| 6 | CASH_WITHDRAWAL | משיכת מזומן |
| 7 | BOUNCED_CHECK | צ'ק שחזר (DR לקוח + DR עמלה / CR בנק) |
| 8 | CARD_CLEARING_FEE | עמלת סליקה (Tranzila/CardCom) |

### 5.6 3 תרחישי משכורות

| קוד | תיאור |
|---|---|
| PAYROLL_MONTHLY | תלוש: DR שכר ברוטו / CR ניכויים (ביטוח, מס, פנסיה, השתלמות) + נטו |
| PAYROLL_EMPLOYER | הפרשות מעביד: DR הוצאות סוציאליות / CR התחייבויות |
| PAYROLL_PAYMENT | תשלום בפועל: DR נטו לעובד / CR בנק |

### 5.7 3 תרחישי נכסי קבע

| קוד | תיאור |
|---|---|
| ASSET_PURCHASE | רכישה — קפיטליזציה (DR נכס + DR מע"מ / CR ספק) |
| ASSET_DEPRECIATION | פחת חודשי קו ישר (DR הוצ' פחת / CR פחת מצטבר). idempotent |
| ASSET_SALE | מכירה / הסרה — חישוב רווח/הפסד הון אוטומטי |

### 5.8 12 קטגוריות מע"מ מעורב (MIXED_DEDUCTION)

| קטגוריה | שיעור קיזוז |
|---|---|
| רכב פרטי M1 | 2/3 |
| רכב מסחרי N1 / טנדר | 100% |
| אופנוע ≤125 סמ"ק | 100% |
| אופנוע >125 סמ"ק | 2/3 |
| נייד עסקי בלבד | 100% |
| נייד מעורב — רוב עסקי | 2/3 |
| נייד מעורב — רוב פרטי | 1/3 |
| ארוחות אש"ל רגילות | 1/4 |
| ארוחות אחרי 8 שעות | 100% |
| מתנות מעל הרף (~210₪/שנה) | 0% |
| נסיעות חו"ל | 0% |
| לא מנוכה כלל | 0% |

### 5.9 PCN874_EXPORT (תרחיש מיוחד — לא JE אלא קובץ)

- מקבץ את כל ה-JEs בחודש שמע"מ_reporting_date שלהם בטווח
- בונה רשומות O (כותרת) · S1/S2/L (עסקאות, כולל הפרדת 0%) · T/Y/I/M (תשומות) · X (סיכום)
- Encoding: Windows-1255, line terminator: CR+LF
- אופציה: תיקון רטרואקטיבי — פתיחת תקופה נעולה, הוספת JE, הפקה חוזרת מסומנת כתיקון

---

## 6. Skills (Packages פנימיים)

10 חבילות במונורפו, כל אחת עם interface ברור + tests:

### 6.1 `@priority-cpa/invoice-schema`
- `CanonicalInvoiceSchema` — Zod schema לחשבונית ספק (16 שדות-תרחיש: `is_credit_note`, `allocation_number`, `payment_method`, `withholding_percent`, `mixed_deduction_category` (12 ערכים), `cost_center`, `expense_splits[]`, `is_self_invoice`, `prepaid_period_months`, `is_private_supplier`, `bad_debt_original_invoice`, `post_discount_original_invoice`)
- `SalesInvoiceSchema` — מקביל לצד AR
- `mappers/` — Azure DI → canonical, Google DI → canonical (Phase עתידית)

### 6.2 `@priority-cpa/israeli-vat-logic`
- `getVatRateForDate(date)` — מחזיר 15.5/16/17/18 לפי תאריך אספקה
- `VAT_RATE_HISTORY` — 5 רשומות עם `from`+`rate`
- `applyMixedDeduction(category, expense, vat)` — 12 קטגוריות + `MixedDeductionResult`
- `DEDUCTION_RATES` + `DEDUCTION_LABELS` (עברית)
- `isWithinSixMonthRule(invoiceDate, recordingDate)` — סעיף 38א
- `daysSinceInvoice(...)` — helper
- `getAllocationThreshold(date)` — רף הקצאה (25K ב-2024, ~20K מ-2025)
- `reconcileRounding({subtotal, vat, total})` — toleance ±0.05₪
- **31 בדיקות**

### 6.3 `@priority-cpa/scenario-detector`
- פונקציה ראשית: `detectScenario(invoice, context)` → `{scenario, reason, overlays[]}`
- מזהה תרחיש ראשי (בלעדי) + overlays (יכולים להיות מספר)
- 16 בדיקות

### 6.4 `@priority-cpa/je-constructor`
- 4 קונסטרקטורים ראשיים:
  - `constructJE(invoice, config, ctx)` — AP (16 builders)
  - `constructARJE(sale, config)` — AR (16 builders)
  - `constructCashBankJE(input, config)` — Bank (8 builders)
  - `constructPayrollJEs(entry, config)` — 3 JEs מכל תלוש
  - `constructAssetPurchaseJE / constructAssetDepreciationJE / constructAssetSaleJE` — נכסי קבע
- כל builder מחזיר `JERecord[]` מאוזן
- **102+ בדיקות**

### 6.5 `@priority-cpa/je-validator`
- 11 checks:
  - `checkRequiredTaxInvoiceFields` (חדש — שם, ע.מ, מספר, תאריך, סכומים)
  - `checkTotalsConsistent` (subtotal + vat ≈ total)
  - `checkVatRateMatchesDate` (היסטורי)
  - `checkVatAmountMatchesRate`
  - `checkAccountsConfigured`
  - `checkSupplierKnown`
  - `checkDatePlausibility`
  - `checkAllocation`
  - `checkDuplicate` (fingerprint)
  - `checkOcrConfidence`
  - `checkCurrency`
- `ValidationResult` = `{passed, errors[], warnings[]}`
- **15 בדיקות**

### 6.6 `@priority-cpa/movein-generator`
- `generateMoveIn(invoices, config)` — 180-char records, CP1255, CR+LF
- `generateMoveInFlex(...)` — FLEXIBLE format לתרחישים מורכבים (מרכז עלות, הקצאה > 5 תווים, > 4 שורות)
- Byte-exact match לקובץ ה-POC המקורי (`movein_working.dat`) — **20 בדיקות**

### 6.7 `@priority-cpa/pcn874-builder`
- `buildPcn874(input)` → `{text, summary, buffer}`
- רשומות: O (header) · S1/S2/L (sales) · T/Y/I/M (inputs) · X (trailer)
- ENC: Windows-1255 (`iconv-lite`)
- **17 בדיקות** (חישוב agorot, פדינג, סוגי רשומות, חתימת trailer)

### 6.8 `@priority-cpa/ocr-azure`
- Wrapper ל-Azure Document Intelligence (Hebrew prebuilt-invoice)
- מחזיר extracted JSON + per-field confidence
- **9 בדיקות** (extract logic)

### 6.9 `@priority-cpa/boi-rates`
- שליפה יומית משער BoI
- Cache ב-`fx_rates` table
- Fallback ל-shared rate אם ה-API נופל

### 6.10 `@priority-cpa/audit-logger`
- `SupabaseAuditStore` — `log({companyId, userId, action, entityType, entityId, payload})`
- כתיבה ל-`audit_log` table
- שימוש בכל server action שכותב ל-DB

---

## 7. מסכים ומודולים

### 7.1 Layout כללי
- **Sidebar קבוע** משמאל (RTL → ימין logically): `BrandLogo` למעלה, נתיב נוכחי, רשימת חברות עם expanders, Help & Privacy, פרופיל משתמש למטה
- **Main content** ימינה — עמוד נוכחי
- כל עמוד company-scoped — נכנסים דרך `/dashboard/c/[companyId]/...`

### 7.2 Dashboard Pages

#### `/dashboard` — לוח בקרה ראשי
- KPIs: סך חברות, סך JEs פתוחים, אזהרות, תקופות נעולות
- Quick links לחברות אחרונות

#### `/dashboard/companies` — ניהול חברות
- CRUD חברות (שם, ע.מ, גרסת פריוריטי, סטטוס)
- בעת יצירה — `inbox_token` נוצר אוטומטית (לכתובת מייל ייעודית)

#### `/dashboard/accounting-rules` — ספריית חוקים
- כל **57 החוקים** עם:
  - מספור סידורי (#1..#57)
  - קטגוריה (8) — מסונן בכרטיסיות
  - סטטוס (auto / auto-with-warning / manual / coming-soon)
  - תיאור מורחב, triggers, jeStructure, דוגמה מספרית, חוקים, perCompanyOverrides
- חיפוש לפי שם / קוד / תיאור
- **טופס "הצע שיפור"** לכל חוק — נשמר ב-`rule_improvement_notes`

#### `/dashboard/admin/*` (אדמין בלבד)
- `users` — ניהול משתמשים במשרד
- `rule-notes` — צפייה במשוב וטיפול בו (סטטוסים: open/reviewing/planned/shipped/rejected/duplicate)
- `ocr-quality` — דשבורד תיקוני OCR (לפי שדה, טעויות חוזרות, feed)

#### `/dashboard/c/[companyId]` — דף בית של חברה
- KPIs פר-חברה
- Quick actions

#### `/dashboard/c/[companyId]/invoices` — חשבוניות ספק
- **Bulk dropzone** — drag & drop של PDFs → OCR → אוטו-יצירה
- **טבלה עם checkboxes** + bulk approve ("סמן N כנבדקים")
- חיפוש inline, סינון סטטוס, toggle הצג/הסתר נבדקים

#### `/dashboard/c/[companyId]/invoices/[id]` — פרטי חשבונית
- 7 שדות-עריכה inline עם פנסיל-on-hover
- ConfidenceBadge בכותרת
- Validation results
- תצוגה גולמית של רשומת MOVEIN
- "ערוך פקודת יומן" → שולח לעורך JE

#### `/dashboard/c/[companyId]/invoices/new` — הזנה ידנית
- 80+ שדות לפי תרחיש: ספק (with auto-search ממאסטר), חשבונית (number, date, currency, allocation), payment_method, withholding, mixed_deduction (12 אופציות), expense_splits (עד 2)

#### `/dashboard/c/[companyId]/sales-invoices` + `/new` — לקוחות
- מקבילי לצד AP
- בחירת doc_type: tax_invoice / invoice_receipt / proforma / receipt / credit_note
- טופס שורות (qty, unit_price, line_total, vat_category)

#### `/dashboard/c/[companyId]/journal-entries` — עורך JE
- שני sections: Drafts (לעריכה) + Exported (read-only)
- עריכת inline לכל שורה (account / debit / credit / details)
- **Supplier auto-learning** מופעל אוטומטית בעריכת חשבון
- כפתור "הפק MOVEIN" → batch → קובץ הורדה

#### `/dashboard/c/[companyId]/bank-reconciliation` — תנועות בנק
- ייבוא תנועות (CSV — Phase עתידי)
- Modal "בחר תרחיש" עם 8 אופציות
- בחירה → JE נוצר אוטומטית, הקישור ל-bank_transactions נשמר

#### `/dashboard/c/[companyId]/payroll`
- טבלת עובדים-חודשים
- modal הוספה/עריכה — שכר ברוטו + 8 שדות ניכוי
- בעת שמירה: 3 JEs נוצרים אוטומטית

#### `/dashboard/c/[companyId]/assets` — נכסי קבע
- 3 KPI cards (עלות / פחת מצטבר / NBV)
- 3 modals: הוסף נכס · הרץ פחת חודשי · מכור/הסר
- שיעורי פחת ברירת-מחדל לפי קטגוריה (מחשבים 33% / רכבים 15% / מבנים 4% / ציוד משרדי 7% / תוכנה 33%)

#### `/dashboard/c/[companyId]/periods` — תקופות
- כל החודשים שיש בהם JE (אוטומטית)
- סטטוס: פתוחה / נעולה / סגורה
- כפתור "נעל" ו-"פתח מחדש" ידני
- תקופות נעולות חוסמות JE חדש (trigger DB)

#### `/dashboard/c/[companyId]/pcn874` — דיווח 874
- בורר תקופה (שנה+חודש)
- "תצוגה מקדימה" — 5 שורות + סיכום
- "הפק והורד" — שמירת history + נעילת תקופה + הורדת קובץ
- **תיקון רטרואקטיבי:** כפתור "פתח לתיקון" על תקופות נעולות עם דיווח קודם → modal סיבה → התקופה נפתחת → אחרי תיקון, הפקה חוזרת מסומנת אוטומטית כ-"CORRECTION-N"

#### `/dashboard/c/[companyId]/reports` — 5 דוחות
- **מאזן בוחן** (default tab) — קיבוץ לפי סוג חשבון, בדיקת איזון
- **כרטסת חשבון** — picker חשבון + יתרה רצה
- **רווח והפסד** — הכנסות vs הוצאות בקבוצות (COGS / תפעוליות / שכר / פיננסיות)
- **מאזן** — נכון לתאריך, יתרת רווחים מצטברת אוטומטית
- **VAT** — פירוט חודשי + ייצוא CSV
- כל דוח: בורר תקופה (שנה / חודש / טווח חופשי), ייצוא CSV, **Print-friendly CSS** (Ctrl+P → PDF נקי)

#### `/dashboard/c/[companyId]/exports` — היסטוריית MOVEIN
- כל ה-batches שהופקו, עם batch_number, exported_at, JE count
- הורדה חוזרת

#### `/dashboard/c/[companyId]/suppliers`
- טבלה: שם, קוד פנימי, ע.מ, **dealer_status** (registered/exempt/foreign), חשבון הוצאה ברירת מחדל, **תג "נלמד N×"**
- CRUD + supplier_aliases

#### `/dashboard/c/[companyId]/customers` + `/items` + `/accounts` + `/account-mapping`
- מאסטרים נוספים פר-חברה
- `accounts` — תרשים חשבונות עם hierarchy
- `account-mapping` — חוקים פר-חברה לעקיפת ברירות מחדל (e.g. ספק X תמיד הולך לחשבון 511-2)

#### `/dashboard/c/[companyId]/settings` — הגדרות חברה
- זהות (קריאה בלבד — שם, ע.מ, גרסה)
- inbox email address
- **3 sections של JE defaults** (חשבונות, payment accounts, special accounts)
- **section מע"מ ודיווח** — vat_basis, vat_filing_frequency
- **section אישור OCR אוטומטי** — auto_approve_ocr_threshold

#### `/dashboard/help` + `/dashboard/settings` (משתמש)
- מדריך הפעלה (placeholder)
- הגדרות חשבון (אימייל, סיסמה, 2FA)

---

## 8. תאימות חוקית — מע"מ ישראלי

### 8.1 19 הפערים שטופלו (Phase 11 — P0 + P1)

#### P0 (חוקיות בסיסית)
1. **תיקון תאריך דיווח 874** — לפי `journal_entries.vat_reporting_date`, לא תאריך החשבונית. תיקון bug קריטי לחשבוניות מאוחרות (סעיף 38א מאפשר עד 6 חודשים)
2. **חוק 6 חודשים (סעיף 38א)** — JE נבנה ללא שורת מע"מ אם החשבונית > 180 יום + warning
3. **בסיס מזומן vs דיווח** — flag פר-חברה (`vat_basis`)
4. **שיעורי מע"מ היסטוריים** — טבלה (15.5/16/17/18) + `getVatRateForDate(date)`
5. **הפרדת 0% ב-PCN874** — מכירות 0%/פטורות נשלחות עם record code 'L'
6. **ולידציה של שדות חובה** בחשבונית מס — `checkRequiredTaxInvoiceFields`
7. **ספק עוסק פטור** — flag במאסטר ספקים, JE ללא שורת מע"מ, לא נכלל בתשומות 874
8. **AR_VAT_EXEMPT** — לא יוצר שורת מע"מ עסקאות

#### P1A (extension של MIXED_DEDUCTION + חוב אבוד)
9. **השבת מע"מ על חוב אבוד (סעיף 39א)** — AR_BAD_DEBT JE 3 שורות: DR חוב אבוד + DR מע"מ עסקאות / CR לקוח
10. **תת-סוגי רכב** — N1 100%, אופנוע ≤125 100%, וכו'
11. **טלפון נייד** — 3 רמות (100% / 2/3 / 1/3)
12. **מתנות מעל הרף** — 0%
13. **ארוחות אחרי 8 שעות** — 100%
14. **נסיעות חו"ל** — 0%

#### P1B (תיקון רטרואקטיבי + הנחה לאחר חשבונית)
15. **תיקון 874 רטרואקטיבי** — מנגנון מלא: פתיחת תקופה נעולה → audit log (period_reopens) → הפקה חוזרת אוטומטית מסומנת כתיקון
16. **AR_POST_INVOICE_DISCOUNT** — תרחיש חדש להפחתה חלקית של חשבונית קיימת
17. **UI ל-12 קטגוריות MIXED_DEDUCTION** ב-`/invoices/new`

### 8.2 פערים שטרם נסגרו (P2 דחוי)

| # | פער | מורכבות |
|---|---|---|
| Capital goods adjustment (שינוי שימוש בנכס) | התאמת מע"מ פרופורציונלית | Edge case |
| חשבונית מס מתוקנת (≠ זיכוי מלא) | מנגנון תיקון פרט אחד | בינוני |
| אימות API מספר הקצאה מול שע"מ | דורש רישוי | חיצוני |
| שער חליפין רשמי שע"מ (לא BoI middle rate) | source חדש | בינוני |
| דיווחים 856/1126/1301 | לא 874 | בינוני |
| מלכ"ר + מס שכר | סיווג אחר של חברה | חוץ-תחום (מבנה משפטי) |

### 8.3 חוקים מרכזיים ישראליים מוטמעים

| חוק | יישום במערכת |
|---|---|
| **חוק מע"מ סעיף 38(א)** — 6 חודשים | `isWithinSixMonthRule` + JE ללא מע"מ |
| **חוק מע"מ סעיף 39א** — חוב אבוד | AR_BAD_DEBT עם DR מע"מ עסקאות |
| **חוק 2024+ מספר הקצאה** | `getAllocationThreshold(date)` + warning |
| **תקנות פחת (מס הכנסה)** | קטגוריות נכסים + שיעורים ברירת-מחדל |
| **PCN874** | builder מלא + תיקון רטרואקטיבי |
| **ניכוי מעורב (תקנות מס הכנסה)** | 12 קטגוריות + שיעורים קבועים |
| **חוק ישראלי — מספור JE רץ** | `je_number` trigger + אין חוסרים |
| **שמירה ארוכת-טווח 7 שנים** | DB persistence + audit_log (TBD: archival policy) |

---

## 9. שילובים חיצוניים

### 9.1 פעילים

| שילוב | שימוש | קונפיג |
|---|---|---|
| **Priority ERP** | יעד MOVEIN.DAT | HASH = source program code, פר-חברה ב-Priority parameters |
| **Azure Document Intelligence** | OCR Hebrew | מודל `prebuilt-invoice`, key ב-Vercel env |
| **Supabase** | DB / Auth / Storage / RLS | project URL + anon + service-role keys |
| **Bank of Israel API** | שערי חליפין | public, no auth, daily fetch |
| **Vercel** | hosting | auto-deploy מ-GitHub |
| **GitHub** | source control + CI | tests on PR |

### 9.2 לעתיד (לפי החלטות עוז)

| שילוב | תועלת | חוסם |
|---|---|---|
| **Priority API license** | אוטומציה מלאה (לא MOVEIN) | עלות רישיון |
| **Open Banking ישראל** | תנועות בנק אוטומטיות | רישיון AISP בנק ישראל (6-12 חודשים) או אגרגטור (Open Finance Israel / Riseup) |
| **רשות המסים API — אימות הקצאה** | בדיקה רשמית | רישיון מקצועי |
| **שע"מ — הגשת 874 ישירות** | חיסכון בהורדה ידנית | רישוי |
| **Make.com / Zapier** | אוטומציות לקוח (העברה מ-Gmail וכו') | תכנון |
| **Lovable** | UI מהיר יותר (חלופה ל-Next.js) | החלטה pending |

### 9.3 פרוטוקולים ופורמטים

- **MOVEIN.DAT 180**: רשומה 180 תווים, `transactionType` (1) + `reference1` (15) + שדות סכום + ... + value_date + ... | CR+LF | CP1255
- **MOVEIN.DAT FLEXIBLE**: עד 8 שורות פר-רשומה, תומך ב-cost_center + allocation > 5 תווים
- **PCN874**: רשומות O / S1 / S2 / L / T / Y / I / M / X | Windows-1255 | line terminator CR+LF
- **CSV ייצוא**: UTF-8 with BOM (Excel-friendly Hebrew)

---

## 10. זרימות משתמש (User Journeys)

### 10.1 Journey ראשי — הזנת חשבונית ספק

```
[1] שני מקבלת PDF במייל
[2] גוררת ל-/dashboard/c/<companyId>/invoices Bulk Dropzone
[3] OCR (Azure) → extracted JSON עם confidence
[4] createInvoiceFromOcrAction:
    - dedup לפי fingerprint (tax_id|number|date|total)
    - ספק חדש? יצירת stub אוטומטית במאסטר
    - אם confidence ≥ auto_approve_threshold → reviewed_at = now (skip step 6)
[5] הופיעה ב-/invoices רשימה (status: queued/classified, pass/warn)
[6] (אופציונלי) שני בוחרת מספר חשבוניות → "סמן כנבדקים" 
    OR פותחת חשבונית בודדת לתיקון:
    - לוחצת על שדה → עורכת inline → submitFieldCorrectionAction
    - שמירה ב-ocr_corrections + עדכון canonical
[7] שני עוברת ל-/journal-entries
[8] ensureDraftJEsForCompany() — בונה JEs לכל חשבונית שאין לה JE עדיין:
    - scenario-detector מזהה תרחיש + overlays
    - 6-month rule check + exempt supplier check (skip VAT line if needed)
    - vat_reporting_date = today (לא תאריך החשבונית!)
    - je-constructor בונה records
    - המאסטר supplier מוקצה (default_expense_account אם נלמד)
[9] שני עורכת JE inline:
    - שינוי חשבון בשורת DR → updateLineAction
    - אם זה supplier-driven JE: maybeLearnSupplierExpenseAccount
    - default_expense_account של הספק מתעדכן + learned_from_count++
[10] לחיצה על "הפק MOVEIN" → batch נוצר → קובץ MOVEIN.DAT הורד
[11] שני עולה לפריוריטי, מייבאת את הקובץ
```

**זמן בפועל לאחר Phase 13:** 30-50 שניות לחשבונית (תלוי OCR confidence ובאם supplier קיים)

### 10.2 Journey משני — דיווח 874 חודשי

```
[1] רו"ח נכנסת ל-/dashboard/c/<companyId>/pcn874
[2] בורר חודש (default = חודש קודם)
[3] "תצוגה מקדימה" — סיכומים: עסקאות / תשומות / מע"מ לתשלום, 5 שורות ראשונות
[4] (אם הכל תקין) "הפק והורד"
[5] gather():
    - שולף JEs לפי vat_reporting_date בטווח החודש
    - מסנן ספקים פטורים (לא ב-תשומות)
    - מפריד 0%/פטור (מכירות → record code 'L')
[6] buildPcn874() → text + buffer (Win1255)
[7] שמירת history ב-pcn874_exports + נעילת התקופה אוטומטית
[8] קובץ הורד → רו"ח שולחת ל-שע"מ
```

### 10.3 Journey נדיר — תיקון 874 רטרואקטיבי

```
[1] רו"ח מגלה שגיאה בדיווח חודש קודם (חסרה חשבונית)
[2] /pcn874 → לוחץ "פתח לתיקון" על השורה הקיימת בהיסטוריה
[3] modal — סיבה (מינ' 10 תווים)
[4] reopenPeriodForCorrectionAction:
    - מאמת שיש דיווח קודם
    - period.status = 'open' (היה 'locked')
    - period_reopens row נוצר עם reason
[5] רו"ח חוזר ל-/journal-entries → מוסיף את ה-JE החסר
[6] חוזר ל-/pcn874 → אותו חודש → "הפק והורד"
[7] POST /api/reports/pcn874:
    - מזהה priorExports קיימים → isCorrection=true
    - דורש correctionReason (בלוק אם חסר)
    - יוצר רשומה חדשה ב-pcn874_exports עם is_correction=true, correction_sequence=1
    - שם הקובץ: pcn874-...-CORRECTION-1.txt
    - period_reopens.closed_at + resulting_export_id מתעדכנים
[8] רו"ח שולח את הקובץ המתוקן לשע"מ
```

### 10.4 Journey שנתי — פחת חודשי

```
[1] רו"ח רוצה לסגור את החודש החשבונאי
[2] /dashboard/c/<companyId>/assets → "הרץ פחת חודשי"
[3] modal — בחירת חודש (default = חודש קודם)
[4] runMonthlyDepreciationAction:
    - מאמת שהתקופה לא נעולה
    - שולף נכסים פעילים (in_service_date ≤ סוף חודש)
    - לכל נכס: בדיקה אם כבר רץ (idempotent) — אם כן, skip
    - calculateMonthlyDepreciation(purchase, salvage, useful_life, accumulated)
    - constructAssetDepreciationJE — JE 2 שורות
    - insert ב-DB + רישום ב-fixed_asset_depreciation_runs
    - עדכון fixed_assets.accumulated_depreciation
[5] חוזר עם {runsCreated, skipped, totalAmount}
```

---

## 11. סטטוס פיתוח: מה הוטמע · מה נדחה

### 11.1 13 הפאזות שהושלמו

| Phase | תיאור | תאריך (לערך) |
|---|---|---|
| Phase 1 | Brain hardening — overlays + 3 תרחישים חדשים (SELF_INVOICE, PRIVATE_SUPPLIER, PREPAID) | אפריל 2026 |
| Phase 2 | מאסטרים — customers + items + accounts (תרשים חשבונות) | אפריל 2026 |
| Phase 3א | AR engine — 15 תרחישי לקוח | אפריל 2026 |
| Phase 3ב | sales_invoices UI + JE pipeline | אפריל 2026 |
| Phase 4 | Cash/bank/credit JE builders — 8 תרחישים | אפריל 2026 |
| Phase 5 | Payroll — 3 JEs לעובד | אפריל 2026 |
| Phase 6 | Accounting periods + JE numbering חוקי + period locks | אפריל 2026 |
| Phase 7 | Rules library audit — 56 חוקים עם מספור סידורי + פיצ'ר הערות שיפור | מאי 2026 |
| Phase 8 | PCN874 export — skill + UI + auto period lock | מאי 2026 |
| Phase 9 | Fixed assets + monthly depreciation | מאי 2026 |
| Phase 10 | Reports suite (Trial Balance / GL / P&L / Balance Sheet / VAT) + CSV exports + Print CSS | מאי 2026 |
| Phase 11 P0 | VAT compliance core — 8 תיקונים | מאי 2026 |
| Phase 11 P1A | VAT deduction extensions + bad debt recovery | מאי 2026 |
| Phase 11 P1B | 874 retroactive correction + post-invoice discount + deduction UI | מאי 2026 |
| Phase 12 | Workflow improvements — bulk review + supplier auto-learning | מאי 2026 |
| Phase 13 | OCR feedback loop — field-level corrections + auto-approve + admin dashboard | מאי 2026 |

### 11.2 מה נדחה ל-P2 / Phase עתידי

| פריט | סיבה לדחייה |
|---|---|
| Capital goods adjustment (שינוי שימוש בנכס) | Edge case — בודד מקרים |
| חשבונית מס מתוקנת (לא זיכוי) | מנגנון פרט אחד, לא קריטי |
| 4 תרחישי year-end close (REVENUE / EXPENSE / VAT / TRANSFER_PROFIT) | פעם בשנה — לא ייבחן בפיילוט |
| 3 תרחישי inventory (PURCHASE / COGS / COUNT) | לקוחות פיילוט שני הם שירות, לא מסחר |
| API מספר הקצאה לרשות המסים | דורש רישוי |
| שער חליפין רשמי שע"מ | source חדש |
| 856 / 1126 / 1301 reports | לא 874 — פחות תכוף |
| מלכ"ר / מוסד כספי | מבנה משפטי שונה — לא חברות בע"מ |
| Open Banking | רישוי AISP / אגרגטור — נדחה ע"פ עוז |
| Lovable migration | החלטה pending — Next.js יציב |

### 11.3 מטריקות נוכחיות

| מדד | ערך |
|---|---|
| מיגרציות | 19 |
| Skills (packages) | 10 |
| בדיקות אוטומטיות | 256+ (102 je-constructor, 31 vat-logic, 17 pcn874, 20 movein, 16 detector, 15 validator, 9 ocr, 6 schema) |
| חוקי הנהלת חשבונות | 57 (44 auto, 13 coming-soon) |
| מסכים פעילים | 25+ |
| פעולות API (server actions + routes) | 40+ |
| commits ב-main | 50+ |

---

## 12. מטריקות פיילוט

### 12.1 הגדרת הצלחה

הפיילוט עם שני יצליח אם:
- ✅ שני מטמיעה לפחות 50 חשבוניות חודש דרך המערכת בלי לחזור להזנה ידנית
- ✅ זמן ממוצע לחשבונית < 1 דקה (יעד MVP)
- ✅ 70%+ אישור אוטומטי (לא דורש תיקון ידני)
- ✅ פחות מ-5 שגיאות פר-100 חשבוניות שמגיעות לפריוריטי
- ✅ 0 incidents של אובדן נתונים
- ✅ NPS של שני > 50 ("ממליצה לחברים")

### 12.2 KPI שצריך לעקוב אחריהם

| KPI | מקור הנתונים |
|---|---|
| Time per invoice (ingest → approved) | `audit_log` (frame from create to approve) |
| Auto-approval rate | `invoices_inbox` count(reviewed_at NOT NULL via auto-threshold) / total |
| OCR correction rate per field | `ocr_corrections` GROUP BY field_path |
| Most common supplier-to-account mappings | `suppliers.default_expense_account` + `learned_from_count` |
| 874 generation success rate | `pcn874_exports` count vs warnings count |
| Period locks per company per quarter | `accounting_periods.locked_at` |
| JE error rate | `journal_entries.status='error'` |
| Validation warnings per 100 invoices | `validation_results.warnings` length |

### 12.3 התרעות / בעיות לטיפול בפיילוט

- אם הפיילוט מראה > 30% תיקוני OCR — נדרש fine-tuning של Azure prompt
- אם > 20% חשבוניות מסומנות `fail` בולידציה — נדרשת בדיקת ה-checks
- אם > 5% JEs לא מאוזנים — bug בקונסטרקטור
- אם < 50% supplier auto-learning hit rate בחודש שני — heuristic לא טוב מספיק

---

## נספח A: דוגמת חשבונית POC

חשבונית וירטהיים 4427930 (חומרי חשמל):
- ע.מ ספק: 516789123
- תאריך: 2026-04-15
- סכום ביניים: 484.78 ₪
- מע"מ: 87.22 ₪ (18%)
- סך הכול: 572.00 ₪

**JE שייווצר אוטומטית (תרחיש STANDARD):**
```
DR  502-0  קניות חומרים        484.78
DR  205-2  מע"מ תשומות           87.22
CR  200087 ספק וירטהיים          572.00
```

**רשומת MOVEIN.DAT 180:**
```
מ              4427930        ...484.78...87.22...572.00...יום עסקאות מאי 26
```
(180 תווים מדויקים, CP1255)

---

## נספח B: רשימת חוקי המוח המלאה (57 חוקים)

ראה `code/apps/web/app/dashboard/accounting-rules/rules-data.ts` לפירוט המלא — קבלה ב-runtime דרך `/dashboard/accounting-rules`.

---

## נספח C: לקריאה נוספת

- [`01_executive/vision.md`](01_executive/vision.md) — חזון מוצר
- [`02_product/personas.md`](02_product/personas.md) — 4 פרסונות
- [`02_product/360_areas.md`](02_product/360_areas.md) — 360 דברים שלא חשבנו
- [`04_architecture/strategic_spec.md`](04_architecture/strategic_spec.md) — האב הארכיטקטוני
- [`05_domain/je_scenarios_playbook.md`](05_domain/je_scenarios_playbook.md) — 12 תרחישי JE מקוריים
- [`05_domain/movein_format_spec.md`](05_domain/movein_format_spec.md) — MOVEIN spec
- [`08_poc_artifacts/poc_summary.md`](08_poc_artifacts/poc_summary.md) — POC ראשוני שהצליח

---

**סוף המסמך** · **גרסה 1.0** · 03/05/2026 · עוז @ Os-Tech Ventures
