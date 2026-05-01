# Decisions Log

ההחלטות שננעלו לפי כרונולוגיה. **מסמך source of truth להכרעות**.

---

## נעולות (אל תשנה ללא דיון)

### D-01: MOVEIN.DAT הוא הצינור לפריוריטי
**תאריך**: 01/05/2026
**הקשר**: לאחר 13 סבבי ניסיונות TSV ישיר ל-Priority's "ממשק תנועות יומן" — נכשלו.
**החלטה**: לעבור לנתיב MOVEIN.DAT 180-char דרך תפריט "טעינה מתוכנות אחרות". תוכנת מקור = HASH.
**נימוק**: פורמט ציבורי מתועד, יציב 30 שנה, לא תלוי בקונפיג ספציפי של לקוח.
**הוכחה**: 2 חשבוניות נטענו נקי לפריוריטי של טארי.

### D-02: Supabase = Source of Truth
**תאריך**: באפיון מקורי
**החלטה**: כל הנתונים נשמרים ב-Supabase. Priority = יעד בלבד.
**נימוק**: multi-tenant native, RLS, Auth, Storage, Edge Functions — מסביב לדאטה אחד.

### D-03: Multi-Tenant מהיום הראשון
**תאריך**: באפיון מקורי
**החלטה**: כל טבלה עם `company_id` + RLS.
**נימוק**: refactor מ-single-tenant ל-multi-tenant הוא pain. בנייה נכונה מההתחלה.

### D-04: TypeScript בלבד (לא Python)
**תאריך**: 02/05/2026
**הקשר**: POC ב-Python. Phase 1+ ב-TypeScript.
**נימוק**: Supabase Edge Functions = Deno + TS. Frontend = TS. Stack אחד = פחות חיכוך.
**יוצא דופן**: POC artifacts ב-Python נשארים כ-reference.

### D-05: CPA-First Persona
**תאריך**: 02/05/2026
**החלטה**: רואה חשבון הוא הפרסונה הראשית. בעל עסק/CFO = secondary.
**נימוק**: שוק B2B SaaS, רו"ח מוכנים לשלם, יש לו 50 לקוחות = leverage.

### D-06: Israeli Market First
**תאריך**: 02/05/2026
**החלטה**: שנה ראשונה: ישראל בלבד. אין i18n.
**נימוק**: שוק שלא נכבש, חוקי מס ספציפיים, MOVEIN/PCN874 לא רלוונטיים בחו"ל. פוקוס > רוחב.

### D-07: Encoding = CP1255 (Hebrew Windows ANSI)
**תאריך**: 01/05/2026
**הקשר**: UTF-16 LE BOM נכשל ב-MOVEIN. CP1255 הצליח.
**החלטה**: כל קבצי MOVEIN.DAT ב-CP1255, ללא BOM, CR+LF.

### D-08: Currency Code = ILS (אנגלית)
**תאריך**: 01/05/2026
**הקשר**: `ש"ח` עם מירכאות שובר parsers.
**החלטה**: להשתמש בקודי ISO 4217 — ILS, USD, EUR, GBP.

### D-09: Transaction Type = "מ" (Single Char)
**תאריך**: 01/05/2026
**הקשר**: "חס" עם 2 תווים נקרא "סח" (RTL flip). נכשל.
**החלטה**: להשתמש ב-"מ" (תנועה מורכבת). תו אחד = אין כיוון.

### D-10: 180-char DETAILED Format ל-MVP
**תאריך**: 01/05/2026
**החלטה**: Phase 1 = 180-char בלבד. Phase 2 = הוספת FLEXIBLE.
**נימוק**: מכסה ~80% מהמקרים. FLEXIBLE = יותר מורכב לפתח.

### D-11: Azure DI = Primary OCR
**תאריך**: באפיון מקורי
**החלטה**: Azure Document Intelligence (prebuilt-invoice + custom Hebrew) = primary. Google DI = fallback.
**נימוק**: Azure בעל תמיכה הכי טובה בעברית בענני enterprise.

### D-12: Test-Driven מהיום הראשון
**תאריך**: 02/05/2026
**החלטה**: כל skill עם unit tests + integration tests.
**נימוק**: חשבונאות = 0% טולרנטיות לבאגים. Tests מגנים מ-regressions.

---

## פתוחות (חייבות הכרעה לפני קוד)

### O-01: Lovable או React Custom?
**אופציות**:
- **Lovable**: AI-first, מהיר ל-MVP, RTL support, פחות גמיש
- **React + Tailwind + shadcn/ui**: גמיש מלא, אבל איטי יותר

**טיעון ל-Lovable**: time-to-market קריטי. MVP ב-3 שבועות במקום 6.
**טיעון ל-React**: long-term flexibility, easier to find devs, no vendor lock.

**ההמלצה שלי לעוז**: Lovable ל-MVP, React rebuild בשנה 1 אם נכנסנו ל-traction.
**סטטוס**: ממתין להחלטת עוז.

### O-02: Priority API License?
**אופציות**:
- **כן**: לקנות רישיון API לקריאה (וכתיבה?). אוטומציה מלאה.
- **לא**: MOVEIN.DAT manual upload. CPA מוריד וטוען.

**עלות**: רישיון Priority API ~5K-15K ₪/שנה (תלוי באופי).
**ROI**: חוסך ~5 דקות per batch לכל לקוח. עם 100 לקוחות = שווה.

**ההמלצה**: לא לרכוש בשנה ראשונה. תכנון מאוד נכון של manual flow → POC נסגר. ב-Phase 4 — לרכוש לאוטומציה מלאה כשיש justified ROI.
**סטטוס**: ממתין להחלטת עוז (אבל ההמלצה ברורה).

### O-03: Edge Functions או Make.com?
**אופציות**:
- **Supabase Edge Functions (Deno + TS)**: אחיד עם stack
- **Make.com**: no-code, קל לשנות, vendor-locked

**ההמלצה**: Edge Functions. Make.com נחמד אבל vendor lock + הוצאה רצה.
**סטטוס**: ממתין להחלטת עוז.

### O-04: מודל תמחור
**אופציות**:
- per-company (NIS 290 / חברה / חודש)
- per-invoice (NIS 5 / חשבונית מעובדת)
- per-CPA (NIS 990 / רו"ח / חודש, ללא הגבלה)
- hybrid

**ההמלצה**: per-company tiers (Starter / Pro / Firm) — predictable revenue.
**סטטוס**: ממתין להחלטת עוז.

### O-05: שם מותג
**אופציות מוצעות**:
- LedgerPilot
- BookFlow
- AccountAir
- פסקה (פותח חזותי בעברית)
- מטריה (אחזקה / כיסוי)
- ClearBooks IL
- OneClick

**ההמלצה**: לא להחליט עכשיו. השוק יבחר לנו.
**סטטוס**: דחיינות OK עד MVP.

### O-06: White Label — מתי?
**אופציות**:
- Phase 1 — לא
- Phase 3 — אופציה
- Phase 4+ — בעיקר

**ההמלצה**: Phase 4+ כש-ARR > 5M ₪.
**סטטוס**: לא דחוף.

---

## Decision Format

### Locked decision template
```
### D-XX: <Title>
**תאריך**: ...
**הקשר**: ...
**החלטה**: ...
**נימוק**: ...
```

### Open decision template
```
### O-XX: <Question>
**אופציות**: ...
**ההמלצה שלי**: ...
**סטטוס**: pending עוז
```
