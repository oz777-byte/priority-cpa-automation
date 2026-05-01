# 360-Degree Areas — מה שלא חשבת עליו (אבל צריך)

מסמך זה מכסה אזורים שעלולים להיות מוחמצים בתכנון ראשוני. עבור בכל סעיף בעת תכנון ה-MVP, החלט אם **In-Scope** או **Out-of-Scope** ל-Phase 1.

---

## 1. Multi-Firm Hierarchy

**הצורך**: משרד רו"ח של 10 רואי חשבון, 200 חברות. צריך:
- Organization (firm) → Users (CPAs) → Companies (clients)
- Permissions per layer
- "Account manager" אחד אחראי על חברה
- Workload distribution

**Phase 1**: יחיד-CPA mode. מבנה DB מוכן ל-firm-level אך UI לא מציג.
**Phase 2**: Firm UI מלא.

---

## 2. Permission Model

**Roles**:
- **Firm Admin** — מנהל המשרד, רואה הכל
- **Senior CPA** — רואה את החברות שלו + הן של זוטרים
- **Junior CPA / Bookkeeper** — רואה רק את החברות שלה
- **Client User** — בעל החברה, רואה רק את החברה שלו (read-only)
- **Auditor** — read-only על הכל לתקופת ביקורת

**Phase 1**: Owner + Member ראשוני.
**Phase 2-3**: מבנה מלא.

---

## 3. Audit Trail (חוקי במס)

**דרישות**:
- כל יצירה/עריכה/מחיקה של JE מתועדת
- מי, מה, מתי, איזה ערך לפני/אחרי
- Immutable (append-only)
- Retention 7 שנים (חוק רשות המסים)
- Export ל-CSV / PDF לרשות המסים

**חובה ב-MVP**. שכחת = החזרת חברות.

---

## 4. Data Retention & Privacy (חוק הגנת הפרטיות 1981)

**ישראל**:
- מאגר מידע — חובת רישום ברשם מאגרי המידע
- DPO (Data Protection Officer)
- זכות עיון, תיקון, מחיקה (with limits)

**גלובלי**:
- GDPR (אם נרחיב EU)
- CCPA (אם נרחיב CA)

**Phase 1**:
- Privacy Policy + Terms of Service
- Cookie consent
- Data deletion process (within 30 days of customer request)
- Encryption at rest (Supabase default)
- Encryption in transit (TLS 1.3)

---

## 5. Backup & Disaster Recovery

**RPO** (Recovery Point Objective): אובדן עד שעה
**RTO** (Recovery Time Objective): שחזור תוך 4 שעות

**Implementation**:
- Supabase point-in-time recovery (default)
- Off-site weekly snapshots (S3/GCS)
- Quarterly DR drill
- Documented runbook

**Phase 1**: Supabase default + weekly export → S3.

---

## 6. Security — Multi-Layered

| Layer | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Auth | Email + password | + 2FA SMS/TOTP | + SSO |
| Network | TLS 1.3, HTTPS only | + IP allowlist per firm | + WAF |
| Application | RLS in Postgres | + permission middleware | + advanced threat detection |
| Data | Encryption at rest | + field-level encryption for PII | + tokenization |
| Audit | Application-level audit log | + DB-level triggers | + SIEM integration |
| Compliance | Privacy Policy | SOC2 prep | SOC2 Type II |

---

## 7. Pricing & Billing

**Tiers** (per `business_model.md`).

**Billing**:
- Monthly subscriptions
- Charge in NIS (Israeli IS)
- Stripe או Tranzila או Cardcom (Israeli payment processor)
- Receipts auto-generated (חשבונית מס מקור)
- VAT 18% included
- Failed payment → 3 retries → grace period 7 days → suspend

**Trials**:
- 14-day free trial, no credit card required for first 3 invoices
- Demo company pre-loaded

---

## 8. Customer Success & Support

**Tier 1**: Self-service (knowledge base + chatbot)
**Tier 2**: Email support (response < 24h business)
**Tier 3**: Phone support (Pro+ only)
**Tier 4**: Dedicated CSM (Firm tier)

**Onboarding**:
- 30-min onboarding call (free for first month)
- Setup wizard guided
- Sample data pre-loaded

**Documentation**:
- In-app help (contextual)
- Knowledge base (searchable)
- Video tutorials (5-10 min each)
- Webinars monthly

---

## 9. Integrations Beyond Priority (Future)

- **חשבשבת H-ERP** — direct (we already have MOVEIN format)
- **SAP Business One** — via DTW (Data Transfer Workbench)
- **NetSuite** — via REST API
- **QuickBooks Online** — via API (if expanding international)
- **Xero** — via API (international)
- **Greeninvoice** — pull issued invoices
- **Cardcom / Tranzila** — pull credit card transactions
- **Banks (Open Banking Israel)** — bank reconciliation

**Phase 1**: Priority בלבד.
**Phase 2-3**: חשבשבת direct, Greeninvoice pull.

---

## 10. Bank Reconciliation (Future Product Extension)

ערך נוסף: התאמת תשלומים לחשבוניות.

- Pull bank transactions (via Open Banking — חוק מיוחד בישראל)
- Match to invoices automatically
- Flag discrepancies
- Generate JE for payments

**Future product** — Phase 4+.

---

## 11. Tax Filing Automation (Future)

- **PCN874** — דיווח מע"מ דו-חודשי
- **874M** — דיווח חד-חודשי
- **125** — דיווח שנתי

הכל יוצא אוטומטית מהמערכת. הרו"ח רק מאשר ומגיש.

**Phase 4+**.

---

## 12. Year-End Closing

- מאזן בוחן
- סגירת שנה
- העברת יתרות פתיחה
- חישוב מסים

**Phase 4+**.

---

## 13. Mobile App / PWA

**Use cases**:
- CPA on the go: מאשר חשבונית מתוך נסיעה
- Client uploads invoice via phone (snap photo of paper receipt)
- Push notifications

**Phase 1**: Responsive web app (works on mobile)
**Phase 2**: PWA (installable, offline support)
**Phase 3**: Native apps (אם הצורך גדול)

---

## 14. Notification System

**Channels**:
- In-app
- Email (default)
- SMS (urgent only)
- WhatsApp Business API (Israeli context)

**Events**:
- New invoice ingested
- Validation error needs attention
- Batch ready for export
- Approval pending > 24h
- Tax filing deadline approaching
- System maintenance

---

## 15. Search & Filtering

UI requirement at scale:
- Search invoices: by supplier name, date range, amount, status, OCR text
- Bulk filter: all USD invoices, all > 10K, all unmatched suppliers
- Saved searches
- Advanced query language (אופציונלי)

**Phase 1**: Basic search.
**Phase 2**: Advanced filtering + saved searches.

---

## 16. Tags & Categorization

CPAs love organizing. Add tags to:
- Invoices (e.g., "to-review", "tax-deductible-50%", "client-asked-receipt")
- Suppliers (e.g., "regular", "occasional", "one-off")
- JEs (e.g., "audited", "reviewed-by-senior")

---

## 17. Approval Workflows (Multi-Level)

For larger firms:
- Junior CPA enters → Senior CPA reviews → Firm admin approves → Export
- Or: simpler 2-step
- Or: bypass for trusted user

Configurable per firm.

**Phase 1**: Single-step (CPA approves themselves).
**Phase 3**: Multi-level workflows.

---

## 18. Data Export (Migration / Audit)

CPAs need to export:
- All JEs in MOVEIN format (for migration)
- All JEs in CSV
- All invoices PDF + metadata as ZIP
- Audit log
- Reports

**Phase 1**: MOVEIN export, basic CSV.
**Phase 2**: Full export with all artifacts.

---

## 19. API for Custom Integrations

Eventually customers will want to build on us:
- Receive notifications via webhooks
- Push invoices via API
- Pull JEs via API

**Phase 3**: Public API (REST) with API keys per firm.

---

## 20. White Label

Firms want their own brand:
- Custom domain (cpa.example.com)
- Custom logo, colors
- Custom email sender

**Phase 4+**.

---

## 21. Customer Portal (For Clients)

ל-CFO של החברה ללקוח לראות:
- חשבוניות חודשיות
- סטטוס דיווח מע"מ
- מאזן בוחן
- הוצאות לפי קטגוריה

**Phase 3+**.

---

## 22. Reports & Analytics

For CPAs:
- Revenue per company
- Hours saved
- Error rate
- Top suppliers per company

For management:
- Active companies
- Churn rate
- Feature usage

**Phase 1**: Basic counts.
**Phase 2**: Charts + insights.

---

## 23. Performance & Scale

**Targets**:
- Process 1000 invoices/day across all customers
- < 30 seconds OCR per invoice
- < 5 seconds JE generation
- < 2 seconds page load
- 99.5% uptime

**Architecture choices**:
- OCR async (queue + worker)
- DB indexes on company_id, supplier_id, date
- CDN for static assets
- Caching for read-heavy endpoints

---

## 24. Localization

**Phase 1**: Hebrew only.
**Phase 2**: English UI option (some Israeli firms have international clients).
**Phase 4**: Full i18n (אנגלית, ערבית, רוסית — שוקים בישראל).

---

## 25. Compliance: PCI-DSS

If we handle credit card data: required.
**Avoid**: use Stripe / Cardcom — they handle PCI compliance.

---

## 26. Localization of UI for RTL

Hebrew is RTL. Critical:
- Mirror layouts
- Text direction handling
- Bidirectional text in tables (mixed Hebrew/English)
- RTL-aware component library (Tailwind has RTL plugin)

---

## 27. Mobile Capture / WhatsApp Forwarding

Israeli small businesses send invoices via WhatsApp 90% of the time.
Solution: WhatsApp Business API integration to ingest forwards.
"Send invoice to +972-XX-XXXXX → auto-categorized to your account"

**Phase 2** (high value for retention).

---

## 28. Email Forwarding Setup

Each company gets an email like `tari-114390@inbox.priority-cpa.com`.
Forwarded invoices automatically processed.

**Phase 1**: Manual setup with SendGrid Inbound.
**Phase 2**: Auto-provisioning.

---

## 29. Internal Tooling

For us (the team):
- Admin panel: see all customers, override
- Support: read-only access to specific tickets
- Analytics: usage, errors, conversion
- Billing: subscription state, refunds

**Phase 1**: Direct DB access (Supabase Studio).
**Phase 2**: Internal admin dashboard.

---

## 30. Disaster Scenarios — How Do We Recover?

| Scenario | Plan |
|---|---|
| Supabase outage | Status page, customer comm, retry processing when up |
| Azure DI outage | Fallback to Google DI, queue invoices |
| Priority API outage (Phase 4) | Customer keeps using manual export |
| Data breach | IR plan, customer notification within 72h (GDPR) |
| Bug deletes data | Restore from backup, communicate, post-mortem |
| Founder hit by bus | Documentation in this folder, code in Git, knowledge transferable |

---

## אזורים שלא הוזכרו (בנייה עתידית)

- **AI Coach** — chatbot שעוזר לרו"ח לפתור edge cases
- **Voice control** — "אישור כל החשבוניות מאתמול עד 1000 ש"ח"
- **AR Mode** — סורק חשבונית במצלמה ומראה JE על ה-AR
- **Marketplace plugins** — צד שלישי יכול לבנות אינטגרציות
- **CPA Network** — communities, forums, peer help
- **Accounting Education** — courses, certifications

חלקם נשמעים מוגזמים, אבל אם גדלים מספיק — relevant.

---

## Phase 1 — In-Scope Decision Matrix

| אזור | In/Out Phase 1 |
|---|---|
| Multi-firm hierarchy | OUT (DB ready, UI later) |
| Permission model | IN — basic (owner/member) |
| Audit trail | IN — חובה |
| Privacy compliance | IN — בסיסי |
| Backup/DR | IN — Supabase default |
| Security 2FA | OUT (Phase 2) |
| Pricing/Billing | IN — Stripe basic |
| Customer support | IN — email only |
| Integrations beyond Priority | OUT |
| Bank reconciliation | OUT |
| Tax filing | OUT |
| Mobile | IN — responsive web |
| Notifications | IN — email + in-app |
| Search | IN — basic |
| Tags | OUT (Phase 2) |
| Approval workflows | OUT — single-step |
| Export | IN — MOVEIN + CSV |
| API | OUT |
| White label | OUT |
| Client portal | OUT |
| Reports | IN — basic counts |
| Performance | IN — meet targets |
| Localization | IN — Hebrew only |
| RTL UI | IN — חובה |
| WhatsApp ingest | OUT (Phase 2) |
| Email ingest | IN — SendGrid manual setup |
| Internal tooling | IN — Supabase Studio |
| DR plan | IN — documented |
