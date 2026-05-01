# Market Analysis — מתחרים, שוק, פערים, Positioning

## גודל השוק (TAM/SAM/SOM)

### TAM — Total Addressable
- ~10,000 רואי חשבון ומשרדים בישראל
- ~300,000 עסקים קטנים-בינוניים שמקבלים שירותי הנה"ח חיצוניים
- ARPU פוטנציאלי: NIS 5,000-15,000 לרו"ח/שנה
- **TAM**: NIS 50-150M שנה

### SAM — Serviceable Addressable
- רואי חשבון שעובדים עם Priority (בלבד או חלקית): ~3,000 משרדים
- עיקרי שוק: SMB (5-50 חברות תחת רו"ח)
- **SAM**: NIS 15-45M שנה

### SOM — Serviceable Obtainable (3 שנים)
- 5-10% מ-SAM = 150-300 משרדים
- ARR יעד שנה 3: NIS 5-12M
- **SOM**: NIS 5-12M

---

## מתחרים — ניתוח מעמיק

### קטגוריה 1: ERP ישראליים (היעדים, לא מתחרים ישירים)

| מערכת | חברה | מיצוב | רלוונטיות |
|---|---|---|---|
| **Priority** | Priority Software | ERP מוביל בישראל | היעד שלנו |
| **חשבשבת H-ERP** | Hashavshevet | ERP/הנה"ח מקדים מ-DOS | פורמט MOVEIN שלנו |
| **SAP Business One** | SAP | Enterprise SMB | אופציה להרחבה עתידית |
| **NetSuite (ישראל)** | Oracle | Mid-market | לא תכנון לטווח קרוב |
| **רב-מערכות** | רב-מערכות | חשבונאות נישתי | קטן |

**מסקנה**: Priority הוא היעד הראשוני. חשבשבת המקור של MOVEIN.DAT = הצינור הציבורי. שניהם מתועדים, יציבים.

---

### קטגוריה 2: כלי OCR לחשבוניות (מתחרים פוטנציאליים)

#### Finbot (ישראל) — המתחרה הקרוב ביותר
- **מי הם**: Israeli startup, OCR לחשבוניות
- **למי**: בעיקר בעלי עסקים, גם רו"ח
- **מה עושים**: חילוץ נתונים → JSON → אינטגרציה לחשבונאות
- **חוזקות**: OCR טוב לעברית, מותג מוכר
- **חולשות**: לא מותאם CPA workflow, אינטגרציות גנריות
- **תמחור**: ~99 ₪/חודש per business
- **GAP שלנו**: ה-CPA-first מודל + פריוריטי-deep + תרחישי JE מורכבים

#### Greeninvoice (חשבונית ירוקה) — ישראל
- **מי הם**: כלי הנפקת חשבוניות ירוקות + OCR יוצא
- **למי**: בעלי עסקים
- **GAP**: לא מתאים ל-CPA שמרכז 50 חברות. תפוקה אישית בלבד.

#### Iconto / Receipto / Krista — ישראל
- **מי הם**: OCR קבלות
- **GAP**: מתמקדים ב-קבלות לא חשבוניות מלאות, לא JE generation

#### Receipt Bank / Dext — בינלאומי
- **מי הם**: גלובלי, OCR + integration ל-Xero/QuickBooks
- **GAP**: אין תמיכה בעברית ב-deep level, אין אינטגרציה לפריוריטי

#### Veryfi / Mindee / Rossum — בינלאומי
- **מי הם**: APIs ל-OCR
- **GAP**: APIs בלבד, אין אפליקציה ל-CPA

---

### קטגוריה 3: כלי הנה"ח לרו"ח (כלי-עבודה כלליים)

| כלי | תיאור | רלוונטיות |
|---|---|---|
| **חשבשבת** | תוכנת הנה"ח עיקרית בישראל | חלק מהשוק שלנו |
| **ריווחית** | תחרות לחשבשבת | לא Priority |
| **כספית** | קלאסי, נישתי | קטן |
| **מנג'ר** | ENTERPRISE small | לא Priority |

---

### קטגוריה 4: AP Automation גלובליים

| כלי | חברה | ב"דה" | רלוונטיות |
|---|---|---|---|
| **AvidXchange** | US, AP automation | מוכוון enterprise | לא רלוונטי לישראל |
| **Bill.com** | US, $1.2B revenue | SMB AP | לא בישראל |
| **Stampli** | ישראל-בינלאומי, AP automation | enterprise | לא בפריוריטי הדומה |
| **Tipalti** | ישראלי-בינלאומי, AP+payments | Enterprise | overkill ל-SMB |

**שני האחרונים (Stampli, Tipalti) הוקמו ע"י ישראלים** — מצביע על שוק bekanntgegeben שיש לנו.

---

## SWOT שלנו

### Strengths
- ✓ POC הוכח טכנית (MOVEIN.DAT עובד)
- ✓ מומחיות עמוקה ב-Priority (לא מובן מאליו)
- ✓ הבנה תרבותית ועסקית של רו"ח ישראלים
- ✓ AI-powered מהיום הראשון
- ✓ תיעוד מלא של 12 תרחישים (POC value)

### Weaknesses
- ✗ אין צוות עדיין (רק עוז + AI)
- ✗ אין הון משמעותי
- ✗ אין מותג
- ✗ אין משתמשים פעילים מעבר ל-טארי

### Opportunities
- ★ שוק ספציפי לא נכבש (CPA × Priority × Israel)
- ★ רגולציית 2024 דוחפת לאוטומציה
- ★ AI/OCR בשלים
- ★ רואי חשבון מוכנים לשלם 1,000+ ₪ לחודש לכלי שחוסך 12 שעות

### Threats
- ⚠ Finbot יכול להוסיף CPA-first features
- ⚠ Priority עצמה עלולה לבנות פתרון כזה (אבל היסטורית הם איטיים)
- ⚠ Stampli / Tipalti עלולים להוריד ל-SMB
- ⚠ AI commoditization — OCR יהפוך זול וזמין

---

## Positioning

### Tag Line מוצע
**"רואה החשבון שאוטומציית עצמה. POS לחשבוניות ספק שמכניס לפריוריטי בלחיצה."**

### Differentiation
| מה שאנחנו | מה שמתחרים |
|---|---|
| CPA-first design | Business-owner first |
| Priority deep integration | Generic accounting integrations |
| Hebrew + Israeli compliance built-in | Hebrew bolted-on |
| End-to-end JE construction | OCR בלבד, מסירה ידנית להמשך |
| Multi-company per CPA mindset | Single business mindset |
| MOVEIN.DAT mastery | רובם לא מודעים אפילו לקיומו |

### Messaging לסגמנטים

**לרו"ח עצמאי**:
"עוד בלילות לפני 15 לחודש? המערכת קולטת את כל החשבוניות, מציעה JE מאוזן, ומפיקה קובץ שאתה טוען לפריוריטי בלחיצה. 12 שעות בחודש בחזרה לחיים."

**למשרד רו"ח**:
"5 רואי חשבון, 200 חברות, אלפי חשבוניות. כל אחת בידיים שלכם. Standardize את התהליך. ראו עומס בזמן אמת. הוסיפו לקוחות בלי להוסיף מקלידים."

**ל-CFO בחברה**:
"50% מהזמן של מנהל הכספים שלך הולך על הזנת חשבוניות. כל זה הולך לאוטומציה. הוא יכול להתפנות לאנליטיקה ותכנון."

---

## Go-to-Market — תוכנית

### Phase 1 (חודשים 1-3): Pilot
- 5 רואי חשבון בקרוב — מעגל הבית, חינם / בעלות סמלית
- focus: feedback, edge cases, content
- success: 80% retention, NPS > 40

### Phase 2 (חודשים 4-6): Beta paying
- 25 רואי חשבון
- מודל תמחור freemium או trial
- מעגל ראשון: השפעה ישירה (תפוצה דרך טארי, שני, רואי חשבון בעיר)

### Phase 3 (חודשים 7-12): Growth
- 100+ רואי חשבון
- שיווק ב-LinkedIn, פייסבוק (קבוצות רואי חשבון), תוכן SEO
- שותפויות עם Priority partners (חברות ייעוץ)
- כנסים: סדנאות לרואי חשבון

### Phase 4 (שנה 2): Scale
- 500+ רואי חשבון
- Inside sales, SDR
- אינטגרציות נוספות (חשבשבת, אולי Greeninvoice)
- White label למשרדי רו"ח גדולים

---

## תמחור (טיוטה)

מודל מוצע: **per-company subscription**

| Tier | מספר חברות | תכונות | מחיר |
|---|---|---|---|
| Starter | 1-5 חברות | Core OCR + JE + MOVEIN export | NIS 290/חודש |
| Pro | 6-20 חברות | + Drive watcher, FX, multi-user | NIS 990/חודש |
| Firm | 21-50 חברות | + multi-CPA, audit, reports | NIS 2,490/חודש |
| Enterprise | 50+ | Custom, SLA, white label | Custom |

**Top-ups**:
- AI auto-categorization premium: +30%
- Priority API automation (no manual upload): +20%
- Premium support: +50%

**ARPU יעד**: NIS 800/לקוח/חודש (mix of tiers)

---

## Competitive Threats — Mitigation

1. **Finbot מוסיף CPA**: כבר יש להם משתמשים, אבל אנחנו עמוקים יותר בפריוריטי. לבנות moat דרך MOVEIN expertise + content + community.

2. **Priority בונה internal**: היסטורית הם איטיים. אנחנו 18-24 חודשים לפני שהם יחליטו. עד אז — המותג שלנו מבוסס.

3. **Stampli SMB**: דורש שינוי מודל גדול אצלם. נאיים אותם רק כשנגיע ל-1000+ לקוחות.

4. **AI commoditizes OCR**: OK, זה לא ה-moat שלנו. ה-moat הוא: workflow לרו"ח + JE expertise + פריוריטי deep.
