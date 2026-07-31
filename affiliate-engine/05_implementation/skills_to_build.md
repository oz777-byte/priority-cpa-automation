# Skills to Build

כל skill הוא יחידה עצמאית עם I/O contract ברור וטסטים משלו. ארבעה בנויים, חמישה לפניך.

---

## בנויים ✅

### `@affiliate/offer-schema`
מודל קנוני של תוכנית שותפים + כסף ב-minor units + קריטריון קבלה לפורטפוליו.
```ts
normalizeOffer(input): Offer                      // ולידציה — מדווחת על כל השגיאות יחד
assertCanActivate(offer): void                    // חוסם הפעלה ללא בדיקת tracking
evaluateOfferFit(offer, criteria): OfferFitResult // accept | reject | insufficient_data
expectedCommissionMinor(offer, aov?): number|null // null במקום ניחוש
toMinor / fromMinor / percentOfMinor / formatMinor
```
**החלטה מעניינת**: `expectedCommissionMinor` מחזיר `null` ל-revshare בלי הנחת AOV, במקום להמציא מספר משכנע.

### `@affiliate/link-builder`
ליבת ה-attribution — קידוד ופענוח SubID.
```ts
buildCanonicalSubId(parts): string     // {asset}.{placement}.{campaign}.{variant}
encodeSubId(parts, profile): EncodedSubId  // plain | sanitized | hashed
buildTrackingLink(input): TrackingLink
resolveSubId(raw, profile, lookup?): ResolvedSubId
getNetworkProfile(slug): NetworkProfile
```
**החלטה מעניינת**: כשה-SubID לא נכנס במגבלת הרשת — hash דטרמיניסטי באורך קבוע (16 תווים), לא חיתוך. חיתוך היה ממזג בשקט שני נכסים עם prefix משותף.

### `@affiliate/economics`
מדדים + כללי החלטה.
```ts
computeAssetMetrics(input): AssetMetrics       // EPC, CR, RPM, TimeROI, approval/reversal
recommendAction(metrics, ctx): Recommendation  // scale | hold | investigate | kill | insufficient_data
rankRecommendations(recs): Recommendation[]
```
**החלטה מעניינת**: הרבה קליקים עם אפס המרות מסווג `investigate` ולא `kill` — זו כמעט תמיד תקלת tracking, ולהרוג עמוד בגלל אינסטלציה שבורה הוא הרס נכס.

### `@affiliate/network-adapters`
ייבוא דוחות מכל רשת לסכמה אחת.
```ts
getAdapter(slug): NetworkAdapter
adapter.parseReport(csv, ctx): ImportResult   // conversions | unattributed | errors
parseMoney / parseDate / mapStatus
```
**החלטה מעניינת**: סטטוס לא מוכר ממופה ל-`pending`, לא ל-`approved`. אופטימיות כאן מנפחת EPC ומייצרת החלטות שגויות.

---

## לבנייה

### `@affiliate/click-recorder` — M3
רישום קליק ממוזער-פרטיות בתוך ה-redirect.
```ts
recordClick(request, link, config): ClickRecord
hashIp(ip, dailySalt): string
normalizeUserAgent(ua): { device, browser, isBot }
```
**דרישות**: לא חוסם את ה-302 · `ip_hash` בלבד · מכבד DNT/GPC · סינון בוטים.

### `@affiliate/attribution` — M4
הצמדת המרות מיובאות לנכסים, כולל idempotency.
```ts
attributeImport(result, ctx): AttributionOutcome
reconcileStatuses(existing, incoming): StatusChange[]
```
**דרישות**: ייבוא כפול לא מכפיל · כל שינוי סטטוס נרשם ב-`conversion_events` · שורה לא מוצמדת מקבלת סיבה.

### `@affiliate/postback` — Should Have
קליטת S2S בזמן אמת.
```ts
verifySignature(params, secret): boolean   // HMAC-SHA256, ללא חתימה → 403
ingestPostback(params, ctx): Conversion
```
**דרישות**: idempotency לפי `txid` · מיזוג מול הדוח הרשמי בייבוא הבא.

### `@affiliate/fx` — Should Have
המרת מט"ח לפי שער יציג לתאריך האירוע.
> הפרויקט האב כבר מכיל `boi-rates` — לשקול שימוש חוזר במקום לבנות מחדש.

### `@affiliate/content-brief` — Phase 2
בריף תוכן מונחה-נתונים דרך Claude API.
```ts
suggestTopics(portfolio, gaps): TopicSuggestion[]
buildBrief(topic, offers): ContentBrief
```
**דרישה קשיחה**: לא מייצר תוכן סופי לפרסום. בריף ומבנה בלבד — תוכן מיוצר בסקייל ללא ערך מוסף מוביל לדה-אינדוקס.

---

## כללי כתיבה ל-skill

1. **פונקציות טהורות** — ללא DB, ללא רשת, ללא `Date.now()` מרומז. תאריכים מוזרקים כפרמטר.
2. **טסטים לפני מיזוג** — כולל edge cases, לא רק ה-happy path.
3. **שגיאות actionable** — "no transaction id column found (looked for: action_id, id)" ולא "invalid row".
4. **ספים כ-configuration** — `DEFAULT_THRESHOLDS` ניתן לדריסה, לא קבוע בקוד.
5. **כסף ב-minor units שלמים** — לעולם לא float.
6. **אנגלית בקוד ובהערות** — עברית ב-UI ובתיעוד בלבד.
