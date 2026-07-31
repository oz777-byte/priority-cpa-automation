# Affiliate Engine — מערכת לניהול אפילייט מרקטינג

**Owner**: עוז
**סטטוס**: תשתית הוקמה — טרם אופיין MVP סופי
**מיקום**: תת-פרויקט עצמאי בתוך `priority-cpa-automation`, בנוי כך שניתן לחתוך אותו לריפו נפרד ביום אחד (ראה `05_implementation/extraction_plan.md`)

---

## מה זה?

מערכת הפעלה אישית לפורטפוליו אפילייט. לא "אתר נישה" אחד — **מנוע** שמנהל N נכסי תוכן × M תוכניות שותפים, מודד EPC לכל נכס, ומחליט לאן ללכת הזמן הבא.

הבעיה שהיא פותרת: אפילייט נכשל לא בגלל חוסר תנועה — אלא בגלל **חוסר attribution**. בלי לדעת איזה עמוד הביא איזו עמלה, כל שעת עבודה היא הימור. המערכת סוגרת את הלולאה: לינק → קליק → המרה → עמלה → EPC לכל נכס → החלטת kill/scale.

---

## התחלה מהירה

```bash
cd affiliate-engine/code
npm install
npm test          # כל ה-skills
npm run typecheck
```

---

## מבנה

```
affiliate-engine/
├── README.md                       ← אתה כאן
├── CLAUDE.md                       ← context לסשן Claude Code בתת-פרויקט הזה
│
├── 01_strategy/
│   ├── vision.md                   חזון + מודל הרווח
│   ├── reality_check.md            ★ קרא ראשון — למה רוב האפילייט נכשל
│   ├── business_model.md           יחידות כלכליות, יעדים, break-even
│   └── networks_landscape.md       רשתות ותוכניות רלוונטיות לישראלי ב-2026
│
├── 02_product/
│   ├── personas.md                 מי משתמש (שלב 1: עוז. שלב 2: SaaS)
│   ├── user_journeys.md            5 מסעות ליבה
│   └── feature_backlog.md          backlog מתועדף MoSCoW
│
├── 03_architecture/
│   ├── system_design.md            ארכיטקטורה, זרימות, החלטות טכניות
│   ├── data_model.md               סכמת DB מלאה + RLS
│   └── modules.md                  9 מודולים עם interface ברור
│
├── 04_domain/
│   ├── glossary.md                 EPC, RPM, cookie window, postback...
│   ├── tracking_and_attribution.md ★ ליבת המערכת — SubID taxonomy
│   └── compliance_israel.md        מס, מע"מ, גילוי נאות, GDPR
│
├── 05_implementation/
│   ├── phase_1_mvp.md              5 milestones, DoD מדיד
│   ├── skills_to_build.md          9 skills עם I/O contract
│   ├── open_decisions.md           החלטות שעוז צריך להכריע
│   └── extraction_plan.md          איך חותכים לריפו נפרד
│
└── code/
    ├── package.json                npm workspace עצמאי
    ├── packages/skills/
    │   ├── offer-schema/           מודל קנוני של תוכנית/הצעה + נירמול
    │   ├── link-builder/           בניית לינקים עם SubID + cloaking
    │   ├── economics/              EPC, RPM, ROI, כללי kill/scale
    │   └── network-adapters/       adapter interface + ייבוא דוחות
    └── supabase/migrations/        סכמה multi-tenant + RLS
```

---

## כללים נעולים (לא לשנות בלי אישור עוז)

1. **SubID taxonomy הוא חוזה** — `{asset}.{placement}.{campaign}.{variant}`. כל לינק בלי SubID תקין = נזרק.
2. **Multi-tenant מהיום הראשון** — `account_id` בכל טבלה + RLS. גם כשיש משתמש אחד.
3. **Attribution לפני תוכן** — לא מייצרים נכס תוכן לפני שיש מדידה עליו.
4. **גילוי נאות אוטומטי** — כל נכס מקבל disclosure. לא אופציונלי (FTC + חוק הגנת הצרכן).
5. **אין קניית תנועה ב-Phase 1** — organic/owned בלבד עד שיש EPC מוכח.
6. **TypeScript בלבד**, Supabase, Vercel — זהה ל-stack של הפרויקט האב.

---

## הצעד הבא

קרא `01_strategy/reality_check.md` → `05_implementation/open_decisions.md` → הכרע 4 החלטות → מתחילים MVP.
