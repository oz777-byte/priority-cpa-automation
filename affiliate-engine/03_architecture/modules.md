# Modules — 9 מודולים

כל מודול הוא יחידה עם interface ברור. `[S]` = skill עצמאי בקוד, `[A]` = חלק מהאפליקציה.

---

## M1 · offer-registry `[S]`
**תפקיד**: מקור אמת לתוכניות שותפים — תנאים, עמלות, חלון קוקי, כללי תשלום.
**In**: קלט ידני / ייבוא מרשת
**Out**: `Offer` מנורמל + `OfferFitVerdict`
**כללי מפתח**: קריטריון קבלה (`≥$25` או `recurring`, cookie `≥30` ימים, מקור אימות).
**מימוש**: `packages/skills/offer-schema`

## M2 · link-builder `[S]`
**תפקיד**: בניית URL עם SubID מקודד לפי פרופיל הרשת, ופענוח חזרה.
**In**: `Offer` + `SubIdParts` + `NetworkProfile`
**Out**: `TrackingLink { url, subid, encoding, mapKey? }`
**כללי מפתח**: אין truncation — במקום זה hash דטרמיניסטי + `subid_map`.
**מימוש**: `packages/skills/link-builder`

## M3 · redirect-service `[A]`
**תפקיד**: `/go/{slug}` → רישום קליק → 302.
**In**: HTTP request
**Out**: 302 + שורת `click`
**כללי מפתח**: p95 < 50ms; כתיבה לא חוסמת; מכבד DNT/GPC; `ip_hash` בלבד.

## M4 · network-adapters `[S]`
**תפקיד**: הבאת דוחות המרות מכל רשת לסכמה אחת.
**In**: CSV / API response
**Out**: `NormalizedConversion[]` + `ImportReport`
**כללי מפתח**: idempotency לפי `(network, external_id)`; שורות פגומות נצברות ב-`errors`, לא מפילות את הייבוא.
**מימוש**: `packages/skills/network-adapters`

## M5 · attribution `[A]`
**תפקיד**: הצמדת המרות לנכסים דרך פענוח SubID.
**In**: `NormalizedConversion[]` + טבלת clicks
**Out**: `conversions` עם `asset_id`, `placement`, `campaign`, `variant`
**כללי מפתח**: המרה שלא נפענחה נכנסת ל-`unattributed` עם סיבה — לעולם לא נזרקת בשקט.

## M6 · economics `[S]`
**תפקיד**: EPC, CR, RPM, TimeROI, וכללי kill/hold/scale.
**In**: clicks + conversions + שעות עבודה + ספי החלטה
**Out**: `AssetPerformance` + `Recommendation`
**כללי מפתח**: מבחין בין `gross` ל-`approved`. אין החלטה על מדגם מתחת ל-`minClicks`.
**מימוש**: `packages/skills/economics`

## M7 · asset-registry `[A]`
**תפקיד**: רישום נכסי תוכן — URL, נישה, שעות שהושקעו, סטטוס גילוי נאות.
**In**: קלט ידני / סריקת sitemap
**Out**: `Asset`
**כללי מפתח**: אין פרסום ללא `disclosure_ok = true`.

## M8 · payouts `[A]`
**תפקיד**: התאמת עמלות מול תשלומים בפועל, המרת מט"ח, ייצוא לרו"ח.
**In**: conversions מאושרות + הודעות תשלום
**Out**: `payout` + דוח הכנסות חודשי (מטבע מקורי, שער, ₪)
**כללי מפתח**: כל סכום עם `currency` + `fx_rate` + `fx_date`. עמלה שלא שולמה 60+ יום מסומנת לבירור.

## M9 · decision-dashboard `[A]`
**תפקיד**: המסך היחיד שנפתח בבוקר — "על מה לעבוד עכשיו".
**In**: פלט M6
**Out**: רשימת פעולות מדורגת לפי impact צפוי
**כללי מפתח**: כל שורה = פעולה, לא נתון.

---

## מפת תלויות

```
M1 offer-registry ──┐
                    ├──► M2 link-builder ──► M3 redirect ──► clicks
M7 asset-registry ──┘                                          │
                                                               ▼
M4 network-adapters ──► M5 attribution ◄───────────────────────┘
                              │
                              ▼
                        M6 economics ──► M9 dashboard
                              │
                              ▼
                          M8 payouts
```

**נתיב קריטי ל-MVP**: M1 → M2 → M3 → M4 → M5 → M6. M7 יכול להיות טבלה ידנית בהתחלה, M8 ו-M9 דוחים לסוף.
