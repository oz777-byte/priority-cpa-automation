# CLAUDE.md — סביבת המחקר וה-MVP של "שיטת המכירה"

O.S Tech Ventures · הבעלים: עוז

---

## חוקים קבועים

1. **הריפו הזה (`bm-sales-method-lab`) הוא הבית.** כאן מפתחים הכל.

2. **`oz777-byte/realestate-giant-hub` (BM770 CRM) — חומר עיון בלבד.**
   מוסיפים אותו לסשן עם `add_repo`, קוראים ממנו כמה שצריך.
   **אסור באיסור מוחלט** לשנות בו קוד, לדחוף אליו, או לפתוח בו PR. אף פעם.

3. **נתוני האמת של ה-CRM — קריאה בלבד** דרך משתנה הסביבה:
   ```
   psql "$LAB_DB_URL" -c "SELECT count(*) FROM lab.leads"
   ```
   סכמת `lab`. אין ולא תתבקש שום גישת כתיבה למסד.

4. **התפקיד:** לענות לעוז על כל שאלה על הקוד והנתונים של ה-CRM,
   לחקור את שיטת המכירה, ולפתח כאן — ורק כאן — את המוצר החדש.

5. **שפה: עברית.** המלץ עם נימוק — אל תציג אפשרויות ותשאל.

---

## מפת חומר העיון (BM770 CRM)

| נושא | מיקום בריפו ה-CRM |
|---|---|
| **אפיון שיטת המכירה (ה-IP)** | `docs/SALES_METHOD_SPEC.md` |
| דוחות המיפוי שמאחוריו (8) | `docs/research/2026-08-18-sales-method/` |
| ביקורת UX (9 דוחות) | `docs/research/2026-08-18-ux-audit/` |
| אמת הליד | `docs/LEAD_TRUTH_SPEC.md` |
| משפך הלידים | `docs/lead_funnel_spec_v2.md` |
| זרימות מערכת · IA | `docs/SYSTEM_WORKFLOWS.md` · `docs/SYSTEM_IA.md` |
| סכמת DB | `supabase/migrations/` (253 מיגרציות) |
| לוגיקת שרת | `supabase/functions/` (75 Edge Functions) |
| Frontend | `src/pages/` (76 עמודים) · `src/components/` |

Stack של ה-CRM: Vite 5 · React 18 · TS · Tailwind · shadcn · TanStack Query ·
Supabase (Postgres + Auth + Storage + Edge Functions + RLS) · Vitest · Playwright.
UI עברי + RTL. פרויקט Supabase: `jlskmebyliqhsxqfsfxd`.

---

## עקרונות עבודה

- **תמציתי, מובנה, אסטרטגי** — תקציר → ניתוח → סיכונים → צעדים.
- בלי הקדמות ארוכות. עובדות והכרעות.
- **זיהית לוגיקה חלשה — תערער עליה**, אל תשתוק.
- שאלות חוסמות בלבד, מקסימום 3.
- קוד באנגלית (משתנים, comments, logs). תוכן UI בעברית.

---

## פרוטוקול התעדכנות — לבצע בפתיחת כל סשן

ה-CRM בפיתוח אינטנסיבי יומיומי. אין להסתמך על זיכרון מסשן קודם.

```
1. add_repo oz777-byte/realestate-giant-hub
2. git clone --depth 1 https://github.com/oz777-byte/realestate-giant-hub \
     /home/user/realestate-giant-hub
3. cat docs/SALES_METHOD_STATE.md      # פנקס ההחלטות — מקור האמת לסטטוס
4. git log --oneline -40               # מה זז מאז
5. psql "$LAB_DB_URL" -f queries/pulse.sql   # מדדי האינווריאנט בפרודקשן
```

**חלוקת האחריות בין שני הסשנים:**

| מי | מה |
|---|---|
| סשן ה-CRM | מיישם, ומתחזק את `docs/SALES_METHOD_STATE.md` — סטטוס G1–G17, דרגות אוטונומיה, הכרעות שהתקבלו |
| המעבדה (כאן) | קוראת קוד ונתונים, מודדת האם השיטה עובדת, מפתחת את המנוע העצמאי |

הקוד עצמו הוא מקור האמת לעובדות טכניות — את הסטטוס והכוונה קוראים מהפנקס.
פער בין השניים = ממצא לדווח לעוז, לא לתקן בשקט.

---

## היעד

השיטה היא ה-IP. היעד: להוציא אותה מ-BM770 ולבנות כאן **מנוע עצמאי** —
שירות שמקבל מצב לידים ומחזיר לכל ליד את הצעד הבא, לפי האינווריאנט:
כל ליד תמיד בעבודה / בתרדמה עם תאריך / סגור עם סיבה.
BM770 הוא הצרכן הראשון שלו, לא הבית שלו.
