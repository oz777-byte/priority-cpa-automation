# Strategic Specification — מערכת אוטומציית פקודות יומן לרואי חשבון

**תאריך**: 01/05/2026
**סטטוס**: מסמך אסטרטגי — בסיס לפיתוח ב-Claude Code
**הוקם על בסיס**: POC שעבד (MOVEIN.DAT → Priority), 12 תרחישי JE שתועדו

---

## 1. חזון ומטרה

**חזון**: רו"ח ישראלי (כמו שני) שמטפל בעשרות עד מאות חברות מקבל מהן חשבוניות ספק, ומבזבז שעות ידניות בהזנה לפריוריטי. המערכת **מבטלת את ההזנה הידנית** — קולטת חשבוניות אוטומטית, מייצרת פקודות יומן מדויקות לפי כללי הנהלת חשבונות, מציגה לרו"ח לאישור, ומפיקה קובץ MOVEIN.DAT שנטען לפריוריטי בלחיצה.

**המודל העסקי**: SaaS לרואי חשבון. תמחור per company או per invoice.

**הצעת ערך**:
- **לרו"ח**: 90% פחות זמן הזנה. שגיאות ידניות נעלמות. מעקב מסודר.
- **לבעלי עסקים**: דיווחי מע"מ במועד. אין צורך לשלוח חשבוניות מספר פעמים.
- **לרגולטור**: PCN874 חתום אוטומטית.

---

## 2. פרסונות

| פרסונה | תיאור | יעד עיקרי |
|---|---|---|
| **רו"ח עצמאי** | מטפל ב-10-50 חברות | אוטומציה מסיבית לזמן צוות |
| **משרד רו"ח** | 5-50 רואי חשבון | סטנדרטיזציה של תהליכים, multi-user |
| **מנהל כספים בחברה** | מטפל בחברה אחת | פלטפורמה internal, אינטגרציה עם פריוריטי שלהם |
| **בעל עסק קטן** | יזם, סטארטאפ | פתרון self-service כשאין רו"ח |

**פרסונת על למסמך זה**: רו"ח עצמאי / משרד קטן.

---

## 3. User Journeys

### 3.1 Onboarding — חברה חדשה ברו"ח

```
1. רו"ח בורר חברה חדשה ב-dashboard → "הוסף חברה"
2. Wizard שלב 1: פרטי חברה (שם, ע.מ, כתובת, גרסת Priority)
3. Wizard שלב 2: חיבור לפריוריטי
   - אופציה A: API credentials (אם יש רישיון API)
   - אופציה B: כתיבה דרך MOVEIN.DAT (POC הנוכחי)
   - הוראות מפורטות עם screenshots
4. Wizard שלב 3: ייבוא נתוני בסיס מפריוריטי
   - כרטסת חשבונות
   - רשימת ספקים
   - מרכזי עלות
   - סוגי תנועה
   - יחסי מטבע (עם בנק ישראל)
5. Wizard שלב 4: מיפוי חשבונות (Account Mapping)
   - "כל ספק מסוג X → חשבון הוצאה Y"
   - חוקים אוטומטיים + אפשרות override
6. Wizard שלב 5: הגדרת משתמש Priority לטעינות
   - יצירת user מיוחד "automation" עם הרשאות מוגבלות
   - מסמך הוראות step-by-step
7. סיום: "טעינת ניסיון" — חשבונית בודקת לוודא שהכל עובד
```

### 3.2 Workflow יומיומי

```
1. בוקר: רו"ח פותח dashboard
2. רואה: 23 חשבוניות חדשות מ-7 חברות שונות (קלטו אוטומטית בלילה)
3. לוחץ על חברה אחת → רואה רשימה של 5 חשבוניות
4. כל חשבונית מציגה:
   - תצוגה מקדימה של ה-PDF
   - JE מוצע (3 שורות מאוזנות)
   - דגלי validation (✓ ירוק / ⚠️ צהוב / 🚫 אדום)
   - סטטוס supplier match (auto / manual / new)
5. הרו"ח עובר חשבונית-חשבונית, מאשר, עורך, או דוחה
6. לחיצה אחת: "אשר את כל הירוקים" → batch approve
7. ב-end-of-day: "הפק MOVEIN.DAT" → קובץ מורד
8. רו"ח טוען לפריוריטי (או המערכת עושה אוטומטית אם API מחובר)
9. אישור הצלחה → ה-JE מסומנים "נטענו", logs נכתבים
```

### 3.3 Edge case — חשבונית חריגה

```
1. חשבונית במט"ח (USD)
2. המערכת מזהה: scenario = FOREIGN_CURRENCY
3. דוחפת ל-FX engine:
   - מביאה שער יומי מבנק ישראל
   - ממירה ל-ש"ח
   - מחשבת שורות JE כפולות (ש"ח + מט"ח)
4. מציגה לרו"ח עם דגל "FX — בדוק שער"
5. רו"ח מאשר/מעדכן שער → ממשיך ל-export
```

---

## 4. ארכיטקטורה — Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      INPUT LAYER                            │
│  ┌──────────┐  ┌─────────┐  ┌────────────┐  ┌────────────┐  │
│  │  Google  │  │  Email  │  │ Web Upload │  │ External   │  │
│  │  Drive   │  │  Parser │  │            │  │ APIs       │  │
│  │  Watcher │  │         │  │            │  │ (Finbot..) │  │
│  └────┬─────┘  └────┬────┘  └─────┬──────┘  └─────┬──────┘  │
│       └─────────────┴──────┬──────┴───────────────┘         │
│                            ▼                                │
│                  ┌─────────────────┐                        │
│                  │  Inbox Queue    │                        │
│                  │  (Supabase)     │                        │
│                  └─────────────────┘                        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  EXTRACTION LAYER                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐     │
│  │ OCR Engine           │  │ External Pull Engine     │     │
│  │  - Azure DI prebuilt │  │  - Finbot API            │     │
│  │  - Google DI         │  │  - other accounting tools│     │
│  │  - Hebrew tuning     │  │                          │     │
│  └──────────┬───────────┘  └──────────┬───────────────┘     │
│             └─────────────┬─────────────┘                   │
│                           ▼                                 │
│                ┌──────────────────────┐                     │
│                │   Canonical JSON     │                     │
│                │   (invoice schema)   │                     │
│                └──────────────────────┘                     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  PROCESSING LAYER                           │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │ Supplier Matcher │  │ Account Mapper   │  │ Scenario  │  │
│  │  5-layer cascade │  │ Rule-based       │  │ Detector  │  │
│  └──────────────────┘  └──────────────────┘  └─────┬─────┘  │
│           │                    │                    │       │
│           └────────┬───────────┴────────┬───────────┘       │
│                    ▼                    ▼                   │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │ JE Constructor       │  │ FX Engine            │         │
│  │  - 12 scenarios      │  │  - BoI rates         │         │
│  │  - balanced rows     │  │  - multi-currency    │         │
│  └──────────────────────┘  └──────────────────────┘         │
│                    │                    │                   │
│                    └─────────┬──────────┘                   │
│                              ▼                              │
│                  ┌──────────────────────┐                   │
│                  │   Draft JE Records   │                   │
│                  │   (Supabase)         │                   │
│                  └──────────────────────┘                   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  VALIDATION LAYER                           │
│  10-Check Validation Gate                                   │
│  ✓ Balance ✓ VAT rate ✓ Account exists ✓ Supplier matched   │
│  ✓ Date plausible ✓ Allocation ✓ Duplicate ✓ etc.           │
│                                                             │
│  Block: 🚫 / Warn: ⚠️ / Pass: ✓                              │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  REVIEW LAYER (CPA UI)                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Lovable / React Dashboard                            │   │
│  │  - Multi-company switcher                            │   │
│  │  - Invoice queue per company                         │   │
│  │  - Inline JE editing (table view)                    │   │
│  │  - Bulk approve / reject                             │   │
│  │  - PDF preview side-by-side                          │   │
│  │  - Validation flag indicators                        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
                       Approve ▼
┌────────────────────────────▼────────────────────────────────┐
│                  EXPORT LAYER                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ MOVEIN.DAT Generator                               │     │
│  │  - 180-char DETAILED engine                        │     │
│  │  - 90-char SHORT engine (rare)                     │     │
│  │  - FLEXIBLE engine (movein.doc + movein.prm)       │     │
│  │  - Auto-select per scenario complexity             │     │
│  │  - CP1255 encoding, CR+LF, exact byte format       │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  PRIORITY INTEGRATION                       │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Manual Path (POC):                                 │     │
│  │   CPA downloads MOVEIN.DAT → uploads to Priority   │     │
│  │   Step-by-step in-app instructions                 │     │
│  ├────────────────────────────────────────────────────┤     │
│  │ Automated Path (Phase 4):                          │     │
│  │   Priority REST API direct                         │     │
│  │   File upload via SFTP/share                       │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

           ┌─────────────────────────────────────┐
           │  CROSS-CUTTING                      │
           │  - Audit Log (immutable)            │
           │  - Multi-tenant (RLS)               │
           │  - Configuration store              │
           │  - Knowledge base / instructions    │
           │  - Notifications (email, SMS)       │
           │  - Analytics                        │
           └─────────────────────────────────────┘
```

---

## 5. Modules / Engines — מפרט מודולרי

### 5.1 Input Layer

#### 5.1.1 Google Drive Watcher
- **תפקיד**: מנטר תיקייה ב-Drive, מזהה קבצי PDF חדשים, מורד ל-inbox queue.
- **Inputs**: OAuth token, folder ID
- **Outputs**: רשומה ב-`invoices_inbox` table, סטטוס `received`, link לקובץ
- **תלות**: Google Drive API
- **תכונה**: per-company folder mapping, soft-delete after import

#### 5.1.2 Email Parser
- **תפקיד**: מקבל מייל ל-`<company>@inbox.<domain>.com`, מחלץ קבצים מצורפים, מטפל ב-PDF.
- **Inputs**: SMTP/IMAP, או webhook (SendGrid Inbound)
- **Outputs**: רשומה ב-inbox queue
- **תכונה**: parsing of email body for context (date, supplier hint)

#### 5.1.3 Web Upload UI
- **תפקיד**: drag-drop של PDF ב-dashboard
- **Outputs**: רשומה ב-inbox queue
- **תכונה**: bulk upload, preview before submit

#### 5.1.4 External Tool Integrators (פינבוט וכד')
- **תפקיד**: pull invoices מ-3rd party (Finbot, Greeninvoice, ICount)
- **Inputs**: API keys per company
- **Outputs**: canonical JSON (skip OCR)
- **רלוונטי**: ללקוחות שכבר משתמשים בכלי OCR/invoice software

---

### 5.2 Extraction Layer

#### 5.2.1 OCR Engine — Azure Document Intelligence (Primary)
- **תפקיד**: מחלץ שדות מובנים מחשבונית Hebrew
- **Inputs**: PDF file
- **Outputs**: structured JSON (vendor name, tax_id, invoice number, date, items, totals, VAT)
- **Configuration**:
  - Custom-trained model on Hebrew invoices (+10K training samples)
  - Fallback to prebuilt-invoice
- **Confidence handling**: < 80% → flag for human review

#### 5.2.2 OCR Engine — Google Document AI (Fallback)
- **תפקיד**: alternative אם Azure נכשל / לא זמין
- **תכונה**: Hebrew RTL handling

#### 5.2.3 Canonical JSON Schema
```json
{
  "invoice": {
    "number": "4427930",
    "date": "2026-02-10",
    "currency": "ILS",
    "allocation_number": "1I4427930"
  },
  "supplier": {
    "name": "שיווק והספקה וירטהיים בע\"מ",
    "tax_id": "510847064",
    "country": "IL"
  },
  "totals": {
    "subtotal": 484.78,
    "vat_rate": 18.0,
    "vat_amount": 87.22,
    "total": 572.00
  },
  "lines": [
    {"description": "...", "qty": 0.14, "price": 95.00, "total": 190.00, "category": "raw_materials"}
  ],
  "metadata": {
    "ocr_confidence": 0.94,
    "source": "drive",
    "ingested_at": "2026-05-01T10:30:00Z"
  }
}
```

---

### 5.3 Processing Layer

#### 5.3.1 Supplier Matcher (5-Layer Cascade)
- **L1**: Exact tax_id match → auto-confirm (score 1.0)
- **L2**: Alias match (learned) → auto (0.95)
- **L3**: Normalized name match (לאחר הסרת "בע"מ", רווחים, ניקוד, lowercase) → auto if unique (0.85)
- **L4**: Fuzzy trigram > 0.7 → human review (0.7-0.95)
- **L5**: AI assist (Claude API with context) → always review
- **תכונה**: learning loop (אישור 3 פעמים → alias נוצר אוטומטית)

#### 5.3.2 Account Mapper (Rule Engine)
- **Input**: canonical invoice + supplier profile
- **Rules** (data-driven, לא קוד):
  - Priority order
  - Match conditions (supplier_id, item_category, total_range)
  - Output (expense_account, vat_account, cost_center)
- **Output**: mapped accounts ready for JE construction
- **UI**: rule editor — CPA can add/edit rules without dev

#### 5.3.3 Scenario Detector
- **Input**: invoice + supplier + accounts mapping
- **Logic**: per playbook decision tree
  - Foreign currency? → Scenario.FX
  - Has allocation? → Scenario.WITH_ALLOCATION
  - Multi-expense category? → Scenario.MULTI_EXPENSE
  - etc.
- **Output**: scenario enum + parameters

#### 5.3.4 JE Constructor
- **Input**: invoice + scenario + accounts
- **Per scenario**: builds 1+ MOVEIN records, balanced
- **Output**: draft `journal_entry` records

#### 5.3.5 FX Engine
- **תפקיד**: ניהול מטבע חוץ end-to-end
- **Sources**:
  - Bank of Israel daily rates API
  - Per-invoice rate override (user input)
- **Conversions**: USD/EUR/GBP → ILS automatic
- **JE creation**: dual-currency (ש"ח + מט"ח fields ב-MOVEIN)
- **תכונות מתקדמות**: 
  - Hedging account tracking
  - FX gain/loss calculation
  - Period-end revaluation

---

### 5.4 Validation Layer

#### 5.4.1 Validation Gate (10 Checks)
| # | Check | Block / Warn |
|---|---|---|
| 1 | Balance (DR=CR ±0.05) | Block |
| 2 | VAT rate matches date (17/18%) | Warn |
| 3 | Account exists in mapping | Block |
| 4 | Supplier matched (L1-L3) or human-approved | Block if L4-L5 unconfirmed |
| 5 | Invoice number not duplicate (supplier+number+date+amount fingerprint) | Block |
| 6 | Date plausible (not future > 30d, not past > 1yr) | Warn |
| 7 | Allocation required if total > threshold | Block |
| 8 | Allocation valid (Tax Authority API check) | Warn |
| 9 | OCR confidence > 80% | Warn |
| 10 | Currency code valid | Block |

- **Output**: `reason_codes[]` per failed check
- **תכונה**: rule overrides (CPA can override warnings, document reason)

---

### 5.5 Review Layer (CPA UI)

#### 5.5.1 Dashboard
- Multi-company switcher (top bar)
- KPI tiles: pending invoices, ready for export, errors blocking
- Quick filters: by company, by status, by supplier

#### 5.5.2 Invoice Queue View
- Table with: PDF thumbnail, supplier, invoice#, date, amount, JE preview, validation flags
- Inline expand → full JE editor
- Bulk actions: approve all green, hold for review, reject

#### 5.5.3 JE Editor (per invoice)
- Side-by-side: PDF preview | JE table
- 3 rows of JE shown editable:
  - Account (autocomplete from mapping)
  - Debit / Credit
  - Amount
- Add/remove rows for complex scenarios
- Validation flags inline
- "Save draft" / "Approve"

#### 5.5.4 Knowledge Panel
- Side panel showing context:
  - Why this scenario was detected
  - Tax rules applied
  - Similar past invoices
  - Audit trail of edits

---

### 5.6 Export Layer

#### 5.6.1 MOVEIN-180 Engine (Primary, POC-proven)
- Input: approved JEs
- Output: movein.dat file, 180 chars per record, CP1255, CR+LF
- **Usage**: standard, FX, immediate-payment, simple multi-account scenarios

#### 5.6.2 MOVEIN-FLEXIBLE Engine
- Input: approved JEs
- Output: movein.doc + movein.prm pair
- **Usage**: complex scenarios needing 3+ accounts, allocation numbers > 5 chars, cost centers, withholding tax

#### 5.6.3 Engine Selector
- Examines complexity per JE
- Routes to appropriate engine
- Allows mixed batch (some 180, some FLEXIBLE) if Priority supports

---

### 5.7 Priority Integration Layer

#### 5.7.1 Manual Path (POC, current)
- User downloads MOVEIN.DAT
- In-app step-by-step guide:
  1. Open Priority → navigate to load menu
  2. Configure parameters (תוכנת מקור = HASH, ✓ לחשב סכום בדולרים)
  3. Load file → enter batch number
  4. Review staging table
  5. Transfer to journal
  6. Verify in journal report
- Screenshots, video walkthrough

#### 5.7.2 Automated Path (Future Phase)
- Priority REST API direct integration
- Or: SFTP upload to Priority server's `system/load` directory
- Triggered on "approve all" → background job loads to Priority
- Webhook on completion → status update in dashboard

---

### 5.8 Cross-Cutting Concerns

#### 5.8.1 Audit Log
- Immutable append-only table
- Records: every JE creation/edit/delete, supplier match decision, user override, export action
- Retention: 7 years (Israeli tax requirement)

#### 5.8.2 Multi-Tenant (Day 1)
- Every table has `company_id`
- Postgres Row-Level Security (RLS)
- Per-CPA-firm grouping (multiple companies under one firm)

#### 5.8.3 Configuration Store
- Per-company:
  - Account mapping rules
  - VAT rates and codes
  - Allocation threshold
  - Default cost center
  - Supplier preferences
  - User permissions
- Versioned (track changes)

#### 5.8.4 Knowledge Base / Instructions Engine
- **תפקיד**: מסמכי הדרכה דינמיים בתוך האפליקציה
- **תוכן**:
  - "How to set up Priority user for automation loads"
  - "How to define bank account in Priority"
  - "How to enable foreign currency"
  - "How to configure cost centers"
  - "How to setup PCN874 reporting"
- **Format**: markdown + screenshots + embedded videos
- **Customization**: per Priority version, per company config

---

## 6. Data Model — Supabase Schema

```sql
-- Companies (tenants)
companies (id, name, tax_id, priority_version, settings_jsonb, created_at)

-- Users (CPAs and clients)
users (id, email, role, firm_id)
user_companies (user_id, company_id, permissions)

-- Invoices ingested
invoices_inbox (
  id, company_id, source, source_id,
  pdf_path, ocr_status, ocr_confidence, ocr_data_jsonb,
  status, -- received, processing, classified, queued, approved, exported, error
  created_at, processed_at
)

-- Suppliers master
suppliers (
  id, company_id, internal_code, name, tax_id,
  default_expense_account, default_cost_center,
  payment_terms, normalized_name
)
supplier_aliases (supplier_id, alias, confidence, learned_at)

-- Account mapping rules
account_mapping_rules (
  id, company_id, priority,
  match_supplier, match_category, match_amount_range,
  expense_account, vat_account, cost_center
)

-- Journal entries (drafts and finalized)
journal_entries (
  id, company_id, invoice_id, scenario,
  status, -- draft, validated, approved, exported, error
  movein_format, -- 180, 90, FLEXIBLE
  validation_results_jsonb, batch_id
)
journal_entry_lines (
  je_id, line_no, account, debit, credit,
  reference_1, reference_2, reference_3, details
)

-- Exports / batches
movein_batches (
  id, company_id, batch_number, file_path,
  scenario_breakdown_jsonb, exported_at, exported_by,
  priority_load_status -- pending, loaded, transferred_to_journal, error
)

-- Audit log
audit_log (id, company_id, user_id, action, entity_type, entity_id, payload_jsonb, ts)

-- Knowledge base / instructions
kb_articles (id, scope, title, body_md, screenshots_urls, version)
```

---

## 7. Integration Points

| מערכת | סוג | תפקיד |
|---|---|---|
| **Priority** | Output / API | היעד הסופי. MOVEIN.DAT + REST API לשלב 2 |
| **Azure DI** | OCR | חילוץ חשבוניות עברית |
| **Google Drive** | Input | שאיבת קבצים |
| **Gmail / SendGrid** | Input | קבלת חשבוניות במייל |
| **Bank of Israel** | FX | שערי חליפין יומיים |
| **Tax Authority API** | Validation | אימות מספר הקצאה |
| **Finbot / similar** | Input alternative | חילוץ חשבוניות חיצוני |
| **Banks (Open Banking)** | Reconciliation | התאמת תשלומים לחשבוניות |
| **Anthropic Claude API** | AI assist | matching מורכב, suggestions |
| **Make.com** | Orchestration | אם נבחר במקום Edge Functions |

---

## 8. Onboarding Wizard Flow (Detail)

### Phase 1: Account & Company Setup (5 דקות)
- שם חברה, ע.מ
- כתובת
- גרסת Priority
- בעל חברה / איש קשר
- שיטת חיבור (manual/API)

### Phase 2: Priority Connection (10 דקות)
**אם API**:
- API URL
- API user + token
- בדיקת חיבור
**אם MOVEIN.DAT (POC)**:
- הצגת מסמך step-by-step:
  1. צור user "automation" בפריוריטי
  2. תן הרשאות: כספים → תחזוקת כספים → ממשקים
  3. הגדר תוכנת מקור = HASH
  4. סמן ✓ לחשב סכום בדולרים
  5. וודא שיש גישה ל-טעינה מתוכנות אחרות (פורמט MOVEIN.DAT)
- video walkthrough
- אישור: "סיימתי" → המערכת מאמתת שהוא מסוגל לטעון

### Phase 3: Master Data Import (15 דקות)
- ייבוא כרטסת חשבונות מפריוריטי
  - אופציה A: דרך API
  - אופציה B: ידני — CPA מוריד xlsx ומעלה
- ייבוא רשימת ספקים
- ייבוא מרכזי עלות (אם קיים)
- ייבוא סוגי תנועה

### Phase 4: Mapping Setup (15 דקות)
- "כל חשבונית מספק X → חשבון הוצאה Y"
- AI suggests rules based on past Priority data (אם זמין)
- CPA reviews and approves
- Default fallback: "כל חשבונית לא ממופה → חשבון 502-0 (קניות)"

### Phase 5: First Test Load (10 דקות)
- העלאת חשבונית בודקת
- מעבר full pipeline
- ייצוא MOVEIN.DAT
- טעינה לפריוריטי
- אישור הצלחה
- "החברה מוכנה לעבודה"

### Phase 6: Bank Accounts & FX (אופציונלי, 10 דקות)
- הגדרת חשבונות בנק (לתשלומים מיידיים)
- הגדרת חשבונות אשראי
- הגדרות מטבע חוץ:
  - מטבעות פעילים (USD, EUR)
  - חשבונות מט"ח לכל מטבע
  - מקור שערי חליפין

### Phase 7: PCN874 (אופציונלי)
- חיבור לרשות המיסים
- הגדרת רף הקצאה
- קוד מע"מ (V18 וכד')
- בדיקת validation

---

## 9. Tech Stack (אומץ מהאפיון המקורי + עדכונים)

| שכבה | בחירה | למה |
|---|---|---|
| Frontend | Lovable / React + Tailwind | מהיר לפיתוח, רספונסיבי, multi-tenant |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, RLS) | source of truth, multi-tenant native |
| OCR | Azure Document Intelligence | best Hebrew support |
| AI | Claude API | matching, suggestions, edge cases |
| Orchestration | Supabase Edge Functions (preferred) או Make.com | logic close to data |
| Hosting | Vercel (frontend), Supabase Cloud | scalable |
| Monitoring | Sentry, PostHog | errors + analytics |
| Email ingest | SendGrid Inbound | reliable |

**הכרעה**: לזנוח את Make.com שהיה באפיון המקורי לטובת Edge Functions. סיבה: TypeScript native, vendor lock-in מועט, קל יותר לדבג. Make.com יישאר אופציה כ-no-code admin tools.

---

## 10. Skills/Modules לפיתוח ב-Claude Code

ב-Claude Code, נבנה את אלו כ-skills (חבילות עצמאיות):

1. **`movein-generator`** — הפקת MOVEIN.DAT (180 + FLEXIBLE)
2. **`israeli-vat-logic`** — 17/18%, מספר הקצאה, מע"מ מעורב
3. **`supplier-matcher`** — 5-layer cascade
4. **`je-validator`** — 10 בדיקות, reason codes
5. **`invoice-schema`** — Canonical JSON, mapping מ-Azure/Google/Finbot
6. **`fx-engine`** — שערי חליפין, המרות
7. **`priority-instructions`** — מחולל הוראות ספציפיות לפי גרסה+תרחיש
8. **`scenario-detector`** — בוחר תרחיש JE (12 תרחישים)
9. **`account-mapper`** — Rule engine
10. **`audit-logger`** — append-only events

כל skill = פונקציה / class עם interface ברור. ניתן לבדוק בנפרד.

---

## 11. Roadmap

### Phase 1 — POC ✓ (סגור)
- [x] OCR של 2 חשבוניות
- [x] MOVEIN.DAT 180 → טעינה לפריוריטי
- [x] תרחיש 1 (standard) עובד

### Phase 2 — MVP (חודש 1)
- [ ] Skills: movein-generator, israeli-vat-logic, je-validator, invoice-schema
- [ ] Supabase schema
- [ ] Web upload UI (פשוט)
- [ ] Azure DI integration
- [ ] תרחישים: standard, immediate-payment, foreign-currency, dates
- [ ] Manual export → manual load
- [ ] **Pilot עם טארי + 1 רו"ח חיצוני**

### Phase 3 — Beta (חודש 2-3)
- [ ] Skills: supplier-matcher, account-mapper, scenario-detector, fx-engine
- [ ] Lovable UI מלא (queue, JE editor, dashboard)
- [ ] Drive watcher + Email parser
- [ ] תרחישים: allocation, multi-expense, cost-center, withholding
- [ ] Onboarding wizard
- [ ] **5 רואי חשבון משתמשים**

### Phase 4 — V1 (חודש 4-6)
- [ ] FLEXIBLE engine
- [ ] Skills: priority-instructions, audit-logger
- [ ] תרחישים: mixed deductions, credit notes
- [ ] PCN874 export
- [ ] Tax Authority allocation API
- [ ] Priority REST API direct (אם API license קיים)
- [ ] **20+ רואי חשבון, 100+ חברות**

### Phase 5 — Scale (חודש 6+)
- [ ] Multi-firm orgs (משרדי רו"ח גדולים)
- [ ] Banking integration (reconciliation)
- [ ] Mobile app (CPA on-the-go)
- [ ] White label לחבילות חברות גדולות
- [ ] Marketplace plugins (Finbot, etc.)

---

## 12. Risks & Mitigations

| סיכון | סבירות | השפעה | mitigation |
|---|---|---|---|
| OCR לא מדויק לעברית | בינוני | גבוה | Custom-trained model, fallback ל-Google DI, human review trigger ב-confidence < 80% |
| Priority גרסאות שונות → MOVEIN שונה | בינוני | בינוני | Version detection + per-version templates |
| מספר הקצאה > 5 תווים → 180 לא תומך | גבוה | בינוני | FLEXIBLE engine — מובנה בארכיטקטורה |
| רגולציה משתנה (רף הקצאה, מע"מ rate) | בינוני | גבוה | Configuration-driven, lo update מהיר |
| ספק חדש לא נמצא במאסטר | גבוה | בינוני | Human review queue + learning loop |
| לקוח הרגיש לפרטיות | בינוני | גבוה | RLS, encryption at rest, audit logs |
| תלות ב-Priority (vendor lock) | נמוך | גבוה | Architecture supports multiple ERPs (חשבשבת direct, SAP, etc.) |
| תחרות (Greeninvoice, Finbot) | גבוה | בינוני | Differentiator: end-to-end Priority focus + CPA-first UX |

---

## 13. Success Metrics

### Per-Customer (לרו"ח)
- **Time saved per invoice**: יעד 5 דקות → 30 שניות
- **Error rate**: יעד < 1% של הזנות שגויות שדורשות תיקון
- **Auto-approval rate**: יעד > 70% של חשבוניות עוברות validation בלי human edit

### Business
- **Companies onboarded**: יעד שנה 1 = 50, שנה 2 = 250, שנה 3 = 1000
- **Invoices processed/month**: שנה 1 = 5K, שנה 2 = 50K, שנה 3 = 250K
- **MRR**: שנה 1 = 25K ₪, שנה 2 = 125K, שנה 3 = 500K
- **Churn**: < 5% חודשי

---

## 14. Open Decisions

| החלטה | נטוי כלפי | מה צריך כדי לסגור |
|---|---|---|
| API license של Priority? | חוסך POC manual loads ל-customers | תמחור Priority + decision per company |
| Lovable או React build? | Lovable מהיר, React גמיש יותר | מהירות time-to-market vs ארכיטקטורה |
| Make.com או Edge Functions? | Edge Functions עדיף | ניסיון בצוות עם TypeScript |
| מודל תמחור: per company / per invoice / per CPA / hybrid? | per company + tier | benchmark מתחרים |
| First public market: Israel only או Global? | Israel | פוקוס |
| White label מוקדם או מאוחר? | מאוחר (V1+) | first revenue priority |

---

## 15. Next Steps לפיתוח

**שבוע הקרוב**:
1. סגירת POC (קובץ MOVEIN.DAT הנוכחי טעון בהצלחה לפריוריטי) — **סגור** ✓
2. תיעוד מסמכי POC כ-knowledge base entries
3. הקמת Supabase project (אם לא קיים)
4. בחירה: Lovable או React
5. הקמת skill `movein-generator` ב-Claude Code

**שבוע 2**:
6. הקמת skill `invoice-schema` + `israeli-vat-logic`
7. POC חוזר על 5 חשבוניות נוספות (להוכיח consistency)
8. הקמת UI ראשוני (queue + approve)

**שבוע 3-4**:
9. Pilot CPA #1 (שני? או רו"ח אחר במעגל הקרוב)
10. iterations לפי feedback

---

## נספח A — מילון מונחים

| מונח | תרגום / הסבר |
|---|---|
| MOVEIN.DAT | פורמט קובץ של חשבשבת לייבוא תנועות יומן |
| PCN874 | קוד דיווח מע"מ מקוון של רשות המיסים |
| מספר הקצאה | מזהה ייחודי שניתן ע"י רשות המיסים לחשבוניות גבוהות (מ-2024) |
| ע.מ | מספר עוסק (Tax ID) |
| חשבונית ספק | invoice from a supplier |
| תנועת יומן | journal entry |
| כרטסת | ledger / sub-ledger |
| חובה / זכות | debit / credit |
| תשומות | input VAT |
| מט"ח | foreign currency (Matach) |
| רו"ח | רואה חשבון = CPA / accountant |

---

**סוף המסמך** — מסמך אסטרטגי גרסה 1.
