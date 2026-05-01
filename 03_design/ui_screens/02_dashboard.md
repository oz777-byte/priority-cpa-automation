# Dashboard — מסך ראשי

המסך הראשון שרו"ח רואה אחרי login. **המטרה**: בתוך 5 שניות לדעת מה דחוף.

---

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [☰] Logo    [חיפוש חברה/חשבונית...]    [🔔3] [User ▼]      │  ← Top bar
├──────────────────────────────────────────────────────────────┤
│ [סלקטור חברה: כל החברות ▼] [סינון: היום | שבוע ▼] [➕ הוסף] │  ← Filters
├──────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ ⏳ ממתין │  │ ⚠️ דורש  │  │ ✅ מאושר │  │ 📤 הועלה │      │  ← KPI tiles
│  │   23     │  │ ביקורת   │  │ 145      │  │ לפריוריטי│      │
│  │  היום    │  │   8      │  │  השבוע   │  │   132    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
├──────────────────────────────────────────────────────────────┤
│  📌 דורש פעולה (8)                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ טארי | חשב' 4427930 | 572 ₪ | ⚠️ ספק לא זוהה          ││
│  │ אקמי | חשב' 99281   | 1,250 ₪ | ⚠️ סכום > הקצאה (חסר)  ││
│  │ ...                                                     ││
│  │ [➡ סקור הכל]                                            ││
│  └─────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  📊 פעילות השבוע                                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ▓▓▓▓▓░░░░ 145 חשבוניות עובדו                            ││
│  │ ⏱️ זמן חסכן: ~6 שעות (מ-5 דק' שדמיין סטנדרטי)          ││
│  │ 🎯 אוטומציה: 87% (auto-approve)                         ││
│  └─────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  🏢 החברות שלי (12)                            [➡ צפה הכל] │
│  ┌────────────────┬──────────┬──────────────┬───────────────┐│
│  │ טארי           │ 23 ממתין │ 145 השבוע    │ ✓ סנכרון      ││
│  │ אקמי בע"מ     │ 8 ממתין  │ 67 השבוע     │ ⚠ 2 שגיאות    ││
│  │ ...            │          │              │               ││
│  └────────────────┴──────────┴──────────────┴───────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## רכיבים

### 1. Top Bar
- **Logo** (ימין במצב RTL)
- **חיפוש גלובלי**: חיפוש חברה, חשבונית, ספק
- **התראות (🔔)**: counter עם מספר. לחיצה → tray עם 10 אחרונות
- **User menu**: שם, אימייל, ניווט להגדרות, הרשמה, logout

### 2. סלקטור חברה + סינון
- **סלקטור חברה**: dropdown עם search, "כל החברות" כברירת מחדל
- **סינון תאריך**: היום / שבוע / חודש / מותאם
- **כפתור הוסף**: dropdown — הוסף חשבונית / הוסף חברה / הוסף ספק

### 3. KPI Tiles (4 ריבועים)
| Tile | תוכן | פעולה |
|---|---|---|
| ⏳ ממתין | חשבוניות עברו OCR + JE auto-generated, ממתינות לאישור | קליק → עובר ל-queue |
| ⚠️ דורש ביקורת | חשבוניות עם validation flags צהובים/אדומים | קליק → רק אלו |
| ✅ מאושר | אושרו ע"י CPA, מוכנות לייצוא | קליק → batch builder |
| 📤 הועלה | יוצא בפועל ל-MOVEIN.DAT | קליק → exports history |

### 4. Action Required Section
- רשימה ממוקדת של 5-10 חשבוניות שדורשות פעולה
- כל שורה: חברה | מספר חשבונית | סכום | בעיה
- Sort: by urgency (red > yellow > date)
- "סקור הכל" → עובר ל-queue מסונן רק על אלו

### 5. Activity Summary
- מספרי השבוע
- זמן שנחסך (calculated: 5 דק' × auto-approved invoices = saved time)
- אחוז אוטומציה (auto-approved / total)

### 6. Companies Table
- כל חברה: שם, ממתין count, השבוע count, סנכרון status
- Status icons: ✓ everything OK, ⚠ has issues, 🔄 syncing, 🚫 blocked
- קליק על שורה → company-specific dashboard

---

## Empty State (משתמש חדש)

```
┌──────────────────────────────────────┐
│           🎯                          │
│                                       │
│      ברוך הבא ל-Priority CPA!         │
│                                       │
│  יש לנו 3 צעדים להתחיל:               │
│                                       │
│  ✅ 1. צור חשבון (סיימת!)             │
│  ⏳ 2. הוסף חברה ראשונה               │
│       [➕ הוסף חברה]                   │
│  ⏳ 3. העלה חשבונית בודקת              │
│       (אחרי שתוסיף חברה)              │
│                                       │
└──────────────────────────────────────┘
```

---

## Responsive Behavior

- **Desktop > 1280px**: 4-column KPI tiles, sidebar
- **Tablet 768-1280px**: 2-column tiles, collapsed sidebar
- **Mobile < 768px**: stacked, hamburger menu, swipe actions on table rows

---

## Interactions

| Action | Result |
|---|---|
| Click KPI tile | Filter queue by status |
| Hover company row | Show quick actions tooltip |
| Click company row | Drill into company dashboard |
| Type in search | Live results dropdown |
| Right-click on invoice in action list | Quick actions menu (approve, reject, edit) |

---

## Performance

- Load time target: < 2 seconds
- KPI tiles: cached (refresh every 5 min)
- Action list: real-time (websocket subscription)
- Companies table: paginated (20 at a time)

---

## Empty/Loading States

- **Loading**: skeleton placeholders
- **No companies**: empty state above
- **No actions required**: "🎉 הכל מטופל. תיהנה מהיום!"
- **Error**: friendly error + retry button

---

## Accessibility

- Keyboard navigation: Tab cycles through main areas
- Screen reader: aria-labels on all icons
- High contrast: respects user system setting
- Font scaling: works at 200% zoom
- RTL mirrored properly

---

## Edge Cases

- **CPA managing 50+ companies**: virtualized table
- **1000+ pending invoices**: pagination + smart batching
- **No invoices ever uploaded**: onboarding takeover
- **Suspended account (failed payment)**: red banner + payment update CTA
