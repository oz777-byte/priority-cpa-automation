# CLAUDE.md — Affiliate Engine

קובץ הקשר לסשן Claude Code בתת-הפרויקט הזה. **בנוסף** ל-CLAUDE.md ברוט (עקרונות התקשורת והקוד שם חלים גם כאן).

---

## מה זה

תת-פרויקט עצמאי בתוך `priority-cpa-automation`: מערכת הפעלה לפורטפוליו אפילייט.
**לא** קשור להנהלת חשבונות, לא ל-MOVEIN.DAT, לא לפריוריטי. אל תערבב הקשרים.

---

## קריאה בתחילת סשן

1. `01_strategy/reality_check.md` — למה המודל הזה קשה, ומה כן עובד
2. `04_domain/tracking_and_attribution.md` — ליבת המערכת
3. `05_implementation/phase_1_mvp.md` — איפה אנחנו עומדים

---

## כללים נעולים

1. **SubID taxonomy הוא חוזה**: `{asset}.{placement}.{campaign}.{variant}`
2. **אין truncation ל-SubID** — hash דטרמיניסטי + `subid_map`
3. **Multi-tenant + RLS מהיום הראשון** — `account_id` בכל טבלה
4. **גילוי נאות נאכף ב-DB** — CHECK constraint, לא תזכורת ב-UI
5. **כסף = minor units שלמים** בקוד, `numeric(14,4)` + `currency` ב-DB
6. **תאריכים מוזרקים כפרמטר** — אף skill לא קורא את השעון
7. **skills הם פונקציות טהורות** — ללא DB, ללא רשת
8. **אין קניית מדיה ב-Phase 1**
9. **ישראל בלבד** — אין i18n
10. **אנגלית בקוד**, עברית בתיעוד וב-UI

---

## עבודה עם הקוד

```bash
cd affiliate-engine/code
npm install
npm test              # vitest — כל ה-skills
npm run typecheck
```

מבנה: `packages/skills/<name>/{src,tests}` — כל אחד עם `package.json` ו-`exports` ל-`src/index.ts`.
תלות בין skills דרך `@affiliate/<name>` (npm workspaces).

---

## אנטי-דפוסים

- ❌ ייבוא מ-`@priority-cpa/*` — שובר את העצמאות (ראה `05_implementation/extraction_plan.md`)
- ❌ קיצור SubID כדי "שייכנס" — hash, לא חיתוך
- ❌ סטטוס לא מוכר → `approved` — תמיד `pending`
- ❌ המלצת `kill` על מדגם קטן — `insufficient_data`
- ❌ זריקת שורת דוח שלא נפענחה — ל-`unattributed` עם סיבה
- ❌ IP גולמי, PII בלוגים
- ❌ ספים קשיחים בקוד — configuration
- ❌ לקפוץ ל-Phase 2 (מנוע תוכן) לפני שהלולאה של Phase 1 סגורה

---

## מצב נוכחי

- ✅ **M1 Skills Foundation** — 4 skills, 103 טסטים עוברים, typecheck נקי
- ✅ סכמת DB מלאה עם RLS (`code/supabase/migrations/0001_affiliate_schema.sql`) — **טרם הורצה מול Supabase**
- ⬜ M2 Data Layer · M3 Redirect · M4 Ingest · M5 Dashboard

**חוסם**: 7 החלטות פתוחות ב-`05_implementation/open_decisions.md`. D1 (נישה) חוסמת הכל.
