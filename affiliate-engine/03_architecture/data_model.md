# Data Model

**מקור האמת הוא ה-SQL**: `code/supabase/migrations/0001_affiliate_schema.sql`. המסמך הזה מסביר *למה* הסכמה נראית כך.

---

## מפת ישויות

```
accounts (tenant root)
  ├── account_members            מי רשאי לגשת
  ├── networks                   Impact / PartnerStack / direct
  │     └── offers               תוכנית ספציפית + תנאי עמלה
  ├── assets                     נכסי תוכן — יחידת המדידה
  ├── links  ──► offer + asset   לינק מעקב עם SubID
  │     └── subid_map            שחזור SubID שעבר hash
  ├── clicks                     נפח גבוה, ממוזער-פרטיות
  ├── report_imports             כל ייבוא דוח = snapshot
  │     ├── conversions          מצב נוכחי של המרה
  │     │     └── conversion_events   כל תצפית היסטורית
  │     └── unattributed_conversions  מה שלא הצלחנו להצמיד
  ├── payouts                    כסף שהתקבל בפועל
  └── audit_log                  append-only
```

---

## שבע החלטות סכמה שחשוב להבין

### 1. `assets` הוא יחידת המדידה, לא הדומיין
נכס = פיסת תוכן אחת. עמוד השוואה, סרטון, פוסט. **כל השאלות הכלכליות נשאלות ברמת הנכס** — כי זו רזולוציית ההחלטה ("לשכתב את העמוד הזה? למחוק?").

### 2. `conversions` + `conversion_events` — היסטוריה, לא רק מצב
רשתות משנות דוחות למפרע: המרה שאושרה יכולה להתהפך חודשיים אחרי. `conversions` מחזיק את המצב הנוכחי; `conversion_events` מחזיק כל תצפית עם `observed_at`.
**למה זה חשוב**: בלי זה אי אפשר לענות "מה היה ה-EPC שעל בסיסו החלטתי בפברואר".

### 3. `unattributed_conversions` — כישלון גלוי
המרה שלא נפענחה **לא נזרקת**. היא נכנסת לטבלה עם `reason`. אם היא גדלה — ה-tracking שבור, וזה חייב להיות גלוי לעין.

### 4. `subid_map` — hash במקום חיתוך
כשרשת מגבילה אורך, שולחים טוקן קצר דטרמיניסטי ושומרים את המיפוי. חיתוך היה יוצר התנגשויות שקטות בין נכסים.

### 5. אין IP גולמי
`clicks.ip_hash` בלבד = SHA-256 של IP + סולט יומי. הסולט מתחלף כל יום ← אי אפשר לקשר מבקר בין ימים. `referrer_host` ולא referrer מלא.

### 6. כסף = `numeric` + `currency` + `fx`
`numeric(14,4)` (מדויק ב-Postgres, לא float) עם `currency`, ובנוסף `fx_rate` + `fx_date` + `commission_ils`. חובה לדיווח לרשות המסים.
בקוד ה-TypeScript החישובים נעשים ב-minor units שלמים (סנטים/אגורות) כדי למנוע שגיאות עיגול בצבירה.

### 7. `assets_published_requires_disclosure` — קומפליינס ברמת ה-DB
CHECK constraint: אי אפשר לסמן נכס כ-`published` בלי `disclosure_ok`. גילוי נאות הוא לא תזכורת ב-UI — הוא אילוץ במסד.

---

## RLS

כל טבלה עם `account_id` מקבלת מדיניות אחידה:
```sql
using (is_account_member(account_id)) with check (is_account_member(account_id))
```
`audit_log` חורגת: קריאה + הוספה בלבד, ו-trigger חוסם UPDATE/DELETE.

**חובת טסט**: ניסיון גישה מחשבון A לנתוני חשבון B חייב להיכשל. הטסט הזה רץ ב-CI ולא מסומן כ-skip.

---

## מדיניות שמירה

| טבלה | שמירה |
|---|---|
| `clicks` | 24 חודשים גולמי, אח"כ אגרגציה יומית |
| `visitor_hash` | 90 יום ואז NULL |
| `conversions` | לצמיתות (חובת ארכיון מס — 7 שנים לפחות) |
| `audit_log` | לצמיתות |
| `report_imports.errors` | 12 חודשים |

---

## חסר בכוונה מ-Phase 1

`content_briefs` ו-`content_versions` (Phase 2), `experiments` ל-A/B פורמלי (Phase 2), `keywords` ו-`serp_snapshots` (Phase 2 — תלוי בהחלטה על כלי SEO), `media_campaigns` (Phase 3).
