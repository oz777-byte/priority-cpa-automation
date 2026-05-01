# Design System — שפה עיצובית

## Brand Personality

- **מקצועי ומדויק** — חשבונאות = אמינות
- **מודרני אבל לא משתולל** — לא startup overdesign
- **CPA-respectful** — לא מתנשא, לא דוחק
- **שפה ישראלית** — Hebrew RTL native, ניב מקצועי

---

## Colors

### Primary Palette
- **Primary**: `#2563EB` (כחול עמוק — אמינות, פיננסי)
- **Primary Dark**: `#1E40AF`
- **Primary Light**: `#DBEAFE`

### Semantic Colors
- **Success / Approve**: `#10B981` (ירוק)
- **Warning**: `#F59E0B` (כתום)
- **Error / Block**: `#EF4444` (אדום)
- **Info**: `#06B6D4` (תכלת)

### Neutrals
- **Gray-900**: `#111827` (text)
- **Gray-700**: `#374151` (secondary text)
- **Gray-500**: `#6B7280` (muted)
- **Gray-200**: `#E5E7EB` (borders)
- **Gray-50**: `#F9FAFB` (background)
- **White**: `#FFFFFF`

### Status Specific
- **Pending**: `#FCD34D` (yellow)
- **Approved**: `#10B981`
- **Exported**: `#3B82F6`
- **Error**: `#EF4444`
- **Draft**: `#9CA3AF`

---

## Typography

### Font Family
- **Hebrew**: Heebo (Google Fonts) — מודרני, קריא, RTL native
- **English/Numbers**: Inter — פיננסי, מספרי, קריא
- **Monospace**: JetBrains Mono (לקוד וטכני)

### Scale
- **Display**: 36px / 1.2 — page titles
- **H1**: 30px / 1.2 — section titles
- **H2**: 24px / 1.3 — subsections
- **H3**: 20px / 1.4 — card titles
- **Body**: 16px / 1.5 — main text
- **Small**: 14px / 1.5 — secondary
- **Caption**: 12px / 1.5 — labels, helpers

### Weights
- Regular: 400
- Medium: 500 (default for UI)
- Semibold: 600 (emphasis)
- Bold: 700 (rare, headers)

---

## Spacing

base unit: **4px**
- xs: 4
- sm: 8
- md: 16
- lg: 24
- xl: 32
- 2xl: 48
- 3xl: 64

---

## Layout

- **Max width**: 1440px
- **Sidebar**: 240px (collapsed: 64px)
- **Main content**: fluid
- **Card padding**: 24px
- **Grid gap**: 16px

---

## Components

### Buttons
- **Primary**: ` bg-primary text-white px-6 py-2 rounded-md font-medium hover:bg-primary-dark`
- **Secondary**: `bg-gray-100 text-gray-900 px-6 py-2 rounded-md hover:bg-gray-200`
- **Ghost**: `text-gray-700 hover:bg-gray-100 px-4 py-2`
- **Danger**: `bg-red-500 text-white px-6 py-2 rounded-md`
- **Sizes**: sm (h-8), md (h-10), lg (h-12)
- **Icon-only**: square (h-10 w-10)

### Forms
- **Input**: `border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary`
- **Label**: `text-sm font-medium text-gray-700 mb-1`
- **Error message**: `text-sm text-red-500 mt-1`
- **Helper**: `text-sm text-gray-500 mt-1`

### Cards
- **Background**: white
- **Border**: 1px gray-200
- **Border radius**: 8px (md)
- **Shadow**: subtle on hover only
- **Padding**: 24px

### Tables
- **Header**: bg-gray-50, font-medium, gray-700
- **Row**: alternating bg-gray-50/white, hover:bg-gray-100
- **Border**: 1px gray-200 between rows
- **Density**: comfortable (h-12 rows) / compact (h-10) toggle

### Tags / Badges
- **Status badges**: rounded-full, px-2 py-1, text-xs
- Pending: bg-yellow-100 text-yellow-800
- Approved: bg-green-100 text-green-800
- Error: bg-red-100 text-red-800

### Modals
- **Backdrop**: bg-black/50
- **Modal**: max-width-md, bg-white, rounded-lg, p-6
- **Header**: text-xl font-semibold
- **Footer**: flex justify-end gap-2 (Cancel / Confirm)

### Toasts (notifications)
- **Position**: top-right (RTL: top-left)
- **Duration**: 4s default, 8s for warnings
- **Types**: success (green), error (red), info (blue), warning (yellow)
- **Action**: optional CTA button

---

## RTL Considerations

### Mirror everything horizontally
- Sidebar on RIGHT (not left)
- Padding right > left
- Icons that point left/right (back, forward) — mirrored
- Pagination: prev on right, next on left

### Mixed Hebrew/English
- Long Hebrew text + English numbers/codes (e.g. "חשבון 502-0")
- Use CSS `unicode-bidi: plaintext` for inline mixed content
- For tables with codes, force LTR on numeric columns

### Tailwind RTL Plugin
- שימוש: `tailwindcss-rtl`
- מאפשר: `rtl:mr-4` במקום duplicate code

---

## Iconography

### Library
- **Lucide Icons** (תואם RTL, modern, comprehensive)
- חלופה: Phosphor Icons

### Conventions
- **Size**: 16px (small), 20px (default), 24px (large)
- **Stroke width**: 2px
- **Direction-aware**: arrows mirror in RTL

### Common Icons
- 🏢 Company / building
- 👤 User / person
- 📄 Invoice / document
- 💰 Money / amount
- 📤 Export / upload
- 📥 Import / download
- ✅ Approve / check
- ✕ Reject / close
- ✏ Edit / pencil
- 🗑 Delete / trash
- 🔍 Search / magnifier
- 🔔 Notification / bell
- ⚙ Settings / gear

---

## Patterns

### Empty States
```
[ Centered Icon (large) ]
        Title
   Subtitle / explanation
       [ CTA Button ]
```

### Loading States
- **Skeleton screens** (not spinners)
- For lists: 5 placeholder rows
- For tables: column structure with shimmer
- For long ops: progress bar with % + estimated time

### Error States
```
🔴 שגיאה במערכת
   הסבר ב-1 משפט
   [נסה שוב] [צור קשר עם תמיכה]
```

### Success States
```
✅ הושלם בהצלחה
   X חשבוניות אושרו
   [צפה בייצוא] [המשך לחשבונית הבאה]
```

---

## Accessibility (a11y)

- **WCAG 2.1 AA** compliance
- **Color contrast**: minimum 4.5:1 for text, 3:1 for UI elements
- **Keyboard navigation**: full coverage
- **Screen readers**: ARIA labels on all interactive
- **Focus indicators**: visible 2px ring
- **Font scaling**: works at 200% zoom
- **Color-blind safe**: no color-only indicators (always icon + text)

---

## Animation & Motion

- **Subtle**: transitions 150-300ms
- **Easing**: `ease-in-out`
- **No jarring**: respect `prefers-reduced-motion`
- **Toast slide-in**: from top-right, 250ms
- **Modal fade-in**: 200ms
- **Tab switch**: 150ms

---

## Components Library Decision

**Phase 1**: shadcn/ui components (Tailwind-based, copy-paste, customizable)
**Reason**: 
- מהיר לפתיחה
- mantra "own your components"
- RTL friendly with adjustments

**Alternative**: Mantine (full-featured but heavier)

---

## Component Inventory (Initial)

| Component | Use Case |
|---|---|
| Button | actions |
| Input | forms |
| Select / Combobox | dropdowns |
| Date Picker | dates |
| Number Input | amounts |
| Textarea | long text |
| Checkbox | toggles |
| Radio | exclusive choice |
| Switch | binary toggle |
| Slider | (rare) |
| Tabs | navigation within page |
| Card | content grouping |
| Table | data lists |
| Modal | focused tasks |
| Drawer | side-panel tasks |
| Toast | notifications |
| Tooltip | inline help |
| Popover | small panels |
| Badge | status |
| Avatar | user/company icon |
| Progress | long ops |
| Skeleton | loading |
| Spinner | small loading |
| Empty State | no data |
| Stepper | onboarding wizard |
| Breadcrumb | navigation context |
| Pagination | long lists |

---

## Voice & Tone (Hebrew)

- **לא משתמשים ב**: "תוכלו" (formal/distant) — use "תוכל" (singular friendly)
- **כן**: "סיימת!", "מצויין", "אנחנו בודקים..."
- **לא**: "המשתמש לא הוגדר" — use "המשתמש לא הוגדר עדיין, [הגדר עכשיו]"

### Error Messages
- ❌ "Error 500" 
- ✓ "משהו השתבש בצד שלנו. נסה לרענן."

### Confirmations
- ❌ "Are you sure?"
- ✓ "פעולה זו תמחק את כל הצילומים. בטוח?"

### Empty States
- ❌ "No data"
- ✓ "אין חשבוניות עדיין. [העלה את הראשונה]"

---

## Mobile-First (אבל Desktop-Centric בשימוש)

- Build mobile-friendly מהיום הראשון
- אבל הזמן ה-CPA = 95% desktop
- mobile = nice-to-have ל-CFO/owner ול-quick approvals
