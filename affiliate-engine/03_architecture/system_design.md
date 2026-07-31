# System Design — Affiliate Engine

---

## Stack

זהה ל-stack של הפרויקט האב — כדי לא לתחזק שתי ערימות טכנולוגיה.

| שכבה | טכנולוגיה | נימוק |
|---|---|---|
| שפה | TypeScript בלבד | עקביות עם הפרויקט האב |
| DB + Auth + Storage | Supabase (Postgres) | RLS מובנה, free tier, multi-tenant טבעי |
| Redirect service | Vercel Edge Function | latency נמוך — קריטי, זה בנתיב הקליק |
| App / Dashboard | Next.js + Tailwind | זהה ל-`code/apps/web` באב |
| Jobs / ingest | Supabase Edge Functions + pg_cron | אין צורך בשרת נפרד |
| AI (Phase 2) | Claude API | סיוע בתוכן |
| אתרי תוכן | Next.js סטטי / Astro | SSG, מהירות, SEO |

---

## תרשים מערכת

```
                        ┌──────────────────────────┐
   מבקר ──► אתר תוכן ──►│  /go/{slug}?p={placement}│   Vercel Edge
                        │      Redirect Service     │   (p95 < 50ms)
                        └────────┬─────────────────┘
                                 │ 1. buildTrackingUrl()
                                 │ 2. INSERT click (async)
                                 │ 3. 302 → יעד + SubID
                                 ▼
                        ┌──────────────────┐
                        │  רשת השותפים      │
                        └────────┬─────────┘
                                 │ המרה
                    ┌────────────┴────────────┐
                    ▼                         ▼
          Report CSV/API              S2S Postback (Phase 2)
                    │                         │
                    └───────────┬─────────────┘
                                ▼
                    ┌────────────────────────┐
                    │   Ingest + Attribution  │
                    │   parseSubId() → join   │
                    └───────────┬────────────┘
                                ▼
                    ┌────────────────────────┐
                    │  Supabase (source of    │
                    │  truth) + RLS           │
                    └───────────┬────────────┘
                                ▼
                    ┌────────────────────────┐
                    │  Economics → Decisions  │
                    │  EPC / RPM / TimeROI    │
                    └───────────┬────────────┘
                                ▼
                         Dashboard (Next.js)
                    "על מה לעבוד בשעתיים הבאות"
```

---

## החלטות ארכיטקטוניות

### AD-1: Redirect ב-Edge, לא ב-Serverless רגיל
הקליק הוא בנתיב הקריטי של חוויית המשתמש. השהיה של 300ms מעלה נטישה.
**מימוש**: פרטי הלינק נטענים מ-KV/cache; כתיבת ה-click היא fire-and-forget ולא חוסמת את ה-302.
**Trade-off**: במקרה קיצון נאבד רישום קליק. עדיף מלאבד מבקר.

### AD-2: Supabase הוא source of truth — לא הרשת
דוחות הרשתות משתנים למפרע (reversals, אישורים מאוחרים). אנחנו שומרים כל snapshot של דוח עם `imported_at`, ומחשבים דלתא.
**נובע מזה**: `conversions` מכיל `status` (pending/approved/reversed) והיסטוריית שינויים, לא רק מצב אחרון.

### AD-3: Multi-tenant מהיום הראשון
כל טבלה עם `account_id`, RLS על כל טבלה, ללא יוצא דופן. גם עם משתמש אחד.
**נימוק**: המרה מ-single ל-multi tenant בדיעבד היא ריפקטור של חודש. עלות עכשיו: יום.

### AD-4: Skills עצמאיים ללא תלות ב-DB
`link-builder`, `economics`, `offer-schema` הם פונקציות טהורות. מקבלים נתונים, מחזירים נתונים.
**נימוק**: בדיקות ללא DB, אפשרות להריץ ב-Edge, ואפשרות למכור אותם כספרייה בהמשך.

### AD-5: כל סכום כספי ב-minor units (אגורות/סנטים) כמספר שלם
`amount_minor: number` + `currency: string`. אין floats לכסף.
**נימוק**: שגיאות עיגול בצבירת אלפי המרות. הפרויקט האב כבר למד את זה.

### AD-6: אין מחיקה — soft delete + audit
כל טבלה עם `deleted_at`. כל פעולת write נרשמת ב-`audit_log`.
**נימוק**: מחיקת נכס בטעות מוחקת גם היסטוריית EPC.

### AD-7: ייבוא דוחות דרך adapter interface אחיד
כל רשת = adapter שמממש `NetworkAdapter`. ה-core לא יודע על Impact או CJ.
**נימוק**: הוספת רשת = קובץ אחד, לא ריפקטור.

---

## תקציבי ביצועים

| פעולה | יעד | תקרה |
|---|---|---|
| Redirect (p95) | < 50ms | 150ms |
| טעינת דשבורד | < 1.5s | 3s |
| ייבוא דוח 10K שורות | < 30s | 2min |
| חישוב EPC לכל הנכסים | < 2s | 10s |

---

## אבטחה

- מפתחות API של רשתות ב-Supabase Vault. **לעולם לא בקוד ולא ב-DB רגיל.**
- Postback חתום ב-HMAC-SHA256 לכל רשת. ללא חתימה — 403.
- RLS על כל טבלה, נבדק בטסט אוטומטי (ניסיון גישה חוצה-חשבון חייב להיכשל).
- Rate limiting על `/go/*` ועל `/api/postback`.
- אין PII בלוגים. `ip_hash` בלבד.
- 2FA ב-Supabase Auth מיום ראשון.

---

## מה נדחה בכוונה ל-Phase 3

מסונן החוצה כדי לא לנפח את ה-MVP: קניית מדיה ואוטומציית קמפיינים, ניהול צוות והרשאות מדורגות, מודל ייחוס רב-נגיעתי, ניוזלטר ורשימות תפוצה, אפליקציית מובייל, i18n.
