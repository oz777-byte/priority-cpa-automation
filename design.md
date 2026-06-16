# Design System & UX Principles
## Priority CPA Automation · O.S Tech Ventures

This document is the design contract. It is loaded automatically into
every session via `CLAUDE.md`. When building UI, follow it without
needing to ask. Update it when patterns evolve in the codebase.

---

## 1. Brand & Voice

- **Product**: Priority CPA Automation by O.S Tech Ventures
- **Audience**: Israeli CPAs managing tens-to-hundreds of client companies
- **Tagline**: "רואי החשבון לא מקלידים יותר. המערכת עושה את העבודה השחורה."
- **Pillars**: AUTOMATE · OPTIMIZE · GROW
- **Voice**: professional, direct, fluent in CPA vocabulary
  (חובה/זכות, JE, מע"מ תשומות, הקצאה). Never patronizing, never marketing-y inside work screens.
- **Aesthetic**: Stripe-grade dense + clean. Linear-style keyboard-first feel.
  **Not**: Tally (childish), Wave (soft), SAP (cluttered).

---

## 2. Design Tokens

Defined in `apps/web/tailwind.config.ts`. **Always use tokens, never raw hex.**

### Colors

```
ink (neutral surface palette):
  50  #f8fafc   primary background
  100 #f1f5f9   secondary background, light dividers
  200 #e2e8f0   borders, dividers
  400 #94a3b8   secondary text, icons
  600 #475569   body text
  800 #1e293b   bold text
  900 #0f172a   headings

brand (electric blue on near-black — gradient hero):
  950 #04060f   deepest dark
  900 #0a0e24   intermediate dark
  800 #0f1838   lighter dark
  700 #142655   dark accent
  500 #3aa6ff   primary
  glow #00d4ff  hover, glow effect

accent (interactive surfaces):
  500 #3aa6ff   links, active buttons
  600 #1c8be8   hover state
```

### Status palette (badges, accents, action bars)

| State | Use | Tailwind |
|---|---|---|
| Auto / success | "אוטומטי", success states | `bg-emerald-50 text-emerald-700` (badge: `bg-emerald-100 text-emerald-800`) |
| Warning | needs attention | `bg-amber-50 text-amber-700` (badge: `bg-amber-100 text-amber-800`) |
| Manual / info | manual action, info | `bg-blue-50 text-blue-700` (badge: `bg-blue-100 text-blue-800`) |
| Critical | blocking errors | `bg-red-50 text-red-700` (badge: `bg-red-100 text-red-800`) |
| Coming soon | planned | `bg-purple-50 text-purple-700` (badge: `bg-purple-100 text-purple-800`) |
| FLEXIBLE format | export format pill | `bg-purple-100 text-purple-800` |
| 180 format | export format pill | `bg-ink-100 text-ink-700` |

### Gradient

`bg-brand-radial` = `radial-gradient(ellipse at top, #142655 0%, #0a0e24 50%, #04060f 100%)`
Use for hero / first-run / campaign blocks. Never inside data screens.

### Typography

- Font: **Heebo** (Google Fonts, weights 300/400/500/600/700)
- Base: `text-sm` for body, `text-xs` for meta, `text-[10px]/[11px]` for micro
- Hierarchy:
  - h1 (page): `text-2xl font-bold text-ink-900`
  - h2 (section): `text-lg font-semibold text-ink-900`
  - h3 (subsection): `text-sm font-semibold text-ink-900`
  - section eyebrow: `text-[10px] uppercase tracking-wider text-ink-500 font-semibold`
  - body: `text-sm text-ink-700 leading-relaxed`
  - meta: `text-xs text-ink-600`

### Spacing & radius

- Spacing scale: Tailwind units (`gap-1.5`, `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6`)
- Radius:
  - `rounded` (3px) — table cells, inline pills
  - `rounded-md` — small chips
  - `rounded-lg` (8px) — inputs, buttons, badges
  - `rounded-xl` (12px) — cards, sections
  - `rounded-2xl` — first-run / hero containers only
- Shadows: `shadow-sm` only. `shadow-glow` (`0 0 24px rgba(58,166,255,0.45)`) reserved for strong focus states.
- Borders: `border border-ink-200` for cards, `border-ink-100` for internal dividers

### Iconography

- **Always** use `lucide-react`. No custom SVGs unless explicitly approved.
- Sizes: 12-13 in micro chips, 14-16 in nav/rows, 18 in section headers, 20+ in hero blocks.

---

## 3. RTL & Hebrew Rules (load-bearing — get this right)

- HTML is `lang="he" dir="rtl"`. Sidebar is on the **right**, not left.
- Default writing direction is RTL. Wrap LTR content explicitly:
  - Account numbers (`502-0`, `200087`): `font-mono` + `dir="ltr"`
  - Email addresses, URLs, ISO dates: `dir="ltr"`
  - User-input numbers in tables: `tabular-nums` + `dir="ltr"` only when needed for column alignment
- Never mix Hebrew and English in the same inline span. Put English on its own line or wrap in a separate `<span dir="ltr">`.
- Directional icons in RTL:
  - "Forward / open" = `ChevronLeft` (points left, which is "forward" in RTL)
  - "Back / close" = `ChevronRight`
  - `ArrowLeft` for primary CTAs ("פתח →" maps to `ArrowLeft` in RTL)
- Numerical UI (counters, money, JE amounts): `tabular-nums` + Hebrew label, but the digits themselves stay LTR-rendered by the browser.
- Hebrew in code (variables, comments, log messages) is forbidden. Hebrew is for content/UI only.

---

## 4. Layout System

### App shell

```
+------------------------------+--------+
|                              |        |
|   Main content               |Sidebar |
|   max-w-5xl or 6xl mx-auto   |w-64    |
|   space-y-5/6/7              |sticky  |
|                              |right   |
+------------------------------+--------+
```

- Sidebar: `w-64 bg-white border-l border-ink-200 sticky top-0 h-screen`
- Page container: `max-w-5xl mx-auto` for forms / detail pages, `max-w-6xl` for dashboards / wide tables
- Vertical rhythm: `space-y-5` for related sections, `space-y-7/8` for distinct areas

### Sidebar structure (current)

1. Brand block (logo + product name)
2. Main nav: לוח בקרה ראשי · ניהול חברות
3. Section "תיקי לקוחות": expandable companies, each with 9 tabs
4. Section "עזרה ומידע": מדריך · חוקי הנהלת חשבונות · פרטיות · תנאי שימוש
5. User block (avatar + email + dropdown for account settings / admin / logout)

Active state: `bg-accent-500/10 text-accent-600 font-medium`
Hover: `bg-ink-50`

### Page header pattern (`<PageHeader>`)

- Icon in 40×40 colored square (`bg-accent-500/10 text-accent-600`)
- Title (`text-2xl font-bold`) + description (`text-sm text-ink-600`)
- Optional action slot on the right (RTL: visually leftmost)

---

## 5. Component Patterns (canon)

### Card

```tsx
<div className="bg-white border border-ink-200 rounded-xl p-5">
```

Padding: `p-3` for compact rows, `p-4-5` for forms, `p-6+` for hero.

### Form input

```tsx
<input className="w-full px-3 py-2 border border-ink-200 rounded-lg
                  text-sm focus:outline-none focus:ring-2
                  focus:ring-accent-500" />
```

- Label: `block text-xs font-medium text-ink-700 mb-1` (compact) or `text-sm font-medium text-ink-800 mb-1` (regular)
- Hint: `text-[11px] text-ink-400 mt-1`
- Required marker: red asterisk after the label

### Buttons

| Variant | Class |
|---|---|
| Primary CTA | `px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500` |
| Secondary | `px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm` |
| Ghost link | `text-sm text-accent-600 hover:underline` |
| Destructive | `text-red-700 hover:bg-red-50` |

### Status badge / pill

```tsx
<span className="text-[10px] px-1.5 py-0.5 rounded font-medium
                 bg-amber-100 text-amber-800">
  אזהרה
</span>
```

### Action row (queue-style)

Used in dashboard "מחכה לטיפול" and accounting-rules library. Pattern:

- Colored vertical accent bar (`w-1` self-stretch, status color)
- Icon in colored 9×9 square
- Title + hint stacked
- CTA chevron + label on the far left (RTL)
- Click target = entire row

### Table

```tsx
<table className="w-full text-sm">
  <thead className="bg-ink-50 text-ink-600 border-b border-ink-200">
    <tr><th className="text-right p-3 font-medium">חשבון</th>...</tr>
  </thead>
  <tbody>
    <tr className="border-b border-ink-100 last:border-0">
      <td className="p-3 font-mono text-ink-900" dir="ltr">502-0</td>
      ...
    </tr>
  </tbody>
</table>
```

- Account columns: `font-mono` + `dir="ltr"`
- Money columns: `tabular-nums`, right-aligned in RTL = right edge of cell

### Filter chips (search + filter pattern)

Used for: accounting-rules, lists. Pattern:

```
[Search input full-width]
[All N] [Auto N] [Warning N] [Manual N] [Coming soon N]
```

Active chip: tone-tinted background. Inactive: `bg-white border-ink-200 hover:bg-ink-50`.

### Expandable row

Used for: accounting-rules. Click → expand inline (one open at a time).

---

## 6. Universal States (always implement)

Every list/data view must handle these four states. No exceptions.

| State | Pattern |
|---|---|
| **Empty** | Card with subtle icon + headline + 1-line explanation + primary CTA. Don't leave a blank table. |
| **Loading** | Skeleton rows matching the real shape. Avoid spinners on full pages. |
| **Error** | Inline alert with retry. Never silent. |
| **Success** | Toast (`sonner`-style). Avoid full-page success screens. |

---

## 7. UX Principles

1. **"Today" first**: home screen shows what needs doing now, not what happened last month.
2. **Density > whitespace**: CPAs work with lots of data. Linear/Stripe density, not Notion airiness.
3. **Bulk operations**: every list must support multi-select → action.
4. **Keyboard-friendly**: tab/enter must do the obvious thing. `Cmd+K` for global search (TODO).
5. **State visibility**: every item needs a clear status (color + badge).
6. **Audit transparency**: every write goes through `audit_log`.
7. **Logic transparency**: the `accounting-rules` library exists so CPAs can see what the system does and why.

---

## 8. Anti-patterns — DO NOT

- ❌ Emojis anywhere (UI, copy, code, comments)
- ❌ Long bouncy animations, neumorphism, glassmorphism
- ❌ Stock photos of smiling people
- ❌ Marketing copy inside work screens ("מדהים!", "בוצע בהצלחה!")
- ❌ Mixing English and Hebrew within the same inline span
- ❌ Pastel colors as primary surfaces
- ❌ Pill-shaped (`rounded-full`) primary CTAs
- ❌ Hardcoded hex colors — always tokens
- ❌ Hebrew in code (variables, comments)
- ❌ Silent errors, missing empty states, missing loading states

---

## 9. Engineering invariants

- TypeScript **strict** with `exactOptionalPropertyTypes`. No `any`.
- ESM, Node 24, npm workspaces.
- Server actions revalidate via `revalidatePath('/dashboard', 'layout')`.
- Every write to a domain table writes an `audit_log` row via `SupabaseAuditStore`.
- RLS on every multi-tenant table. Companies queries always go through `loadCompanyForUser` or `getCurrentCompany`.
- Forms use Zod schemas; coerce numeric inputs.
- Components live one-per-file under `apps/web/components/` or co-located with their page.

---

## 10. Definition of Done (every UI change)

Before shipping, verify:

- [ ] Build passes (`npm run build --workspace @priority-cpa/web`)
- [ ] Typecheck passes
- [ ] No raw hex colors — all tokens
- [ ] RTL renders correctly (sidebar right, chevrons correct direction)
- [ ] Account numbers / dates / amounts wrapped with `dir="ltr"` where needed
- [ ] Empty / loading / error states present
- [ ] No emojis
- [ ] Hebrew copy in UI, English in code
- [ ] Click targets reachable via keyboard (tab order makes sense)
- [ ] Pushed to GitHub `main` so Vercel auto-deploys
