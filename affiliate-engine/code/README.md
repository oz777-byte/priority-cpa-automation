# affiliate-engine / code

npm workspace עצמאי. אין תלות בקוד של הפרויקט האב — ניתן לחתוך לריפו נפרד.

```bash
npm install
npm test          # vitest על כל ה-skills
npm run typecheck
```

## Packages

| Package | תפקיד |
|---|---|
| `@affiliate/offer-schema` | מודל קנוני של תוכנית שותפים, נירמול, קריטריון קבלה |
| `@affiliate/link-builder` | בניית ופענוח SubID לפי אילוצי רשת (ליבת ה-attribution) |
| `@affiliate/economics` | EPC / CR / RPM / TimeROI + כללי kill·hold·scale |
| `@affiliate/network-adapters` | interface אחיד לייבוא דוחות + adapter גנרי ל-CSV |
| `@affiliate/aliexpress-api` | לקוח חתום לגייטוויי של AliExpress + transport של fixtures |
| `@affiliate/catalog` | נירמול מוצרים, סינון Choice ואיכות חנות, טקסונומיה, SEO עברי |

כל ה-skills הם **פונקציות טהורות** — ללא DB, ללא רשת, ללא זמן מערכת בקלט מרומז.
תאריכים מוזרקים תמיד כפרמטר, כדי שהטסטים יהיו דטרמיניסטיים.

## Supabase

`supabase/migrations/0001_affiliate_schema.sql` — סכמה multi-tenant מלאה עם RLS.
