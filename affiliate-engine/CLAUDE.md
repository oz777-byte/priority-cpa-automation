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

- ✅ **M1 Skills Foundation** — 7 skills, 202 טסטים עוברים, typecheck נקי
- ✅ סכמות DB עם RLS: `0001_affiliate_schema.sql` (ליבה) + `0002_catalog.sql` (חנות) — **טרם הורצו מול Supabase**
- ✅ אב-טיפוס ויזואלי: `06_storefront/prototype.html`
- ✅ **M3 Redirect** — `/go/{token}` בנוי ונבדק מקצה לקצה (`06_storefront/redirect_service.md`)
- ⬜ M2 Data Layer · M4 Ingest · M5 Dashboard

**המוצר (31/07/2026)**: חנות אביזרי סלולר לאייפון וסמסונג בשם **OS Tech Ventures** — AliExpress Choice בלבד, מחנויות מדורגות, SEO אורגני בעברית, אפילייט טהור ללא מלאי.
האפיון: `06_storefront/storefront_spec.md` · `06_storefront/api_integration.md` · `05_implementation/validation_sprint.md`.

**התזה שמכתיבה את הארכיטקטורה**: ~$0.60 עמלה להזמנה ⇒ ₪2,000/חודש דורש ~28,000 קליקים. זה בלתי אפשרי עם 10 עמודים ידניים ואפשרי עם ~300 עמודי long-tail אוטומטיים. הערך הוא בצנרת, לא בעמוד.

⚠️ **אזהרות שחייבות להישמר בכל שינוי קוד:**
1. **מרקטפלייס מוכיח צנרת, לא כלכלה.** `classifyOffer()` מסמן הצעות כאלה `validation_only`. אל תשנה את הסיווג ואל תרכך את `DEFAULT_FIT_CRITERIA` כדי ש"יעבור" — הרף הנמוך חי ב-`VALIDATION_FIT_CRITERIA` בנפרד, וזו כל הנקודה.
2. **פרופיל הרשת `aliexpress` לא אומת.** שם פרמטר ה-SubID הוא placeholder. `assertProfileVerified()` חוסם תנועה אמיתית עד שנקרא מלינק חי ועודכן.
3. **slug של עמוד הוא לטיני, לא עברי.** ה-slug הופך למקטע הראשון ב-SubID שחייב להתאים ל-`[a-z0-9-]`. slug עברי הופך כל קליק בעמוד לבלתי ניתן לייחוס.
4. **אין דירוג מוצר ב-JSON-LD.** למרקטפלייס יש דירוג *מוכר*. הצגתו כדירוג מוצר היא הפרת structured data וגם טענה שקרית לקונה.
5. **אין מפתחות API?** `createMockTransport()` — כל הצנרת נבנית ונבדקת בלעדיהם.
6. **קליק של בוט נזרק, לא נשמר עם דגל.** שאילתה שתשכח לסנן תדווח EPC מדולל שמצדיק להרוג עמוד עובד.
7. **הרישום קורה ב-`after()`, אחרי התשובה.** כישלון ברישום עולה שורת דיווח; המתנה של המבקר עולה את המכירה.

**חוסם את שלב 2**: D1 (הנישה הכלכלית) עדיין פתוחה ב-`open_decisions.md`.
