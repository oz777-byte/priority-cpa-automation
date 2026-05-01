# MOVEIN.DAT — Technical Specification

מבוסס על תיעוד SUMIT Books + חשבשבת + iteration חי על Priority של טארי.

---

## רקע

MOVEIN הוא פורמט קובץ שמגיע מחשבשבת (Hashavshevet) — מערכת הנהלת חשבונות ישראלית. שלושת הפורמטים שלו (גמיש, מקוצר, מפורט) משמשים להעברת תנועות יומן בין מערכות ישראליות.

**Priority ERP מקבלת MOVEIN.DAT** דרך תפריט "טעינה מתוכנות אחרות (פורמט MOVEIN.DAT)" כשמוגדר תוכנת מקור = `HASH`.

---

## 3 שיטות

### שיטה 1: גמישה (Flexible) — מומלצת לעתיד
- 2 קבצים: `movein.doc` (data) + `movein.prm` (parameters)
- אורך רשומה משתנה
- מקסימום שדות: 35
- תומך הקצאה (9 ספרות), מרכז עלות, פרטים ארוכים

### שיטה 2: מפורטת (Detailed) — POC עבד עליה
- קובץ אחד: `movein.dat`
- 180 תווים בכל רשומה
- 17 שדות מקסימום
- מוגבל אסמכתא 5 ספרות

### שיטה 3: מקוצרת (Short) — לא לחשבוניות
- קובץ אחד: `movein.dat`
- 90 תווים בכל רשומה
- מתאים לתנועות פשוטות (משכורות, קבלות)
- **לא נתמך לחשבוניות** (פר תיעוד SUMIT)

---

## פורמט מפורט (180 תו) — לעבוד עליו ב-Phase 1

### Field Layout

| Position | Field (Heb)              | Length | Type      | Notes |
|----------|--------------------------|--------|-----------|-------|
| 1-3      | קוד סוג תנועה             | 3      | alpha     | "מ  " = compound |
| 4-8      | אסמכתא 1                  | 5      | numeric L | Long, max 99999 |
| 9-14     | תאריך אסמכתא              | 6      | ddmmyy    | DDMMYY |
| 15-19    | אסמכתא 2                  | 5      | numeric   | Long |
| 20-25    | תאריך ערך                 | 6      | ddmmyy    | DDMMYY |
| 26-28    | קוד מטבע                  | 3      | alpha     | ILS, USD, etc. |
| 29-50    | פרטים                     | 22     | alpha     | Hebrew OK |
| 51-58    | מפתח חשבון חובה 1        | 8      | alpha     | account code |
| 59-66    | מפתח חשבון חובה 2        | 8      | alpha     | optional |
| 67-74    | מפתח חשבון זכות 1        | 8      | alpha     | account code |
| 75-82    | מפתח חשבון זכות 2        | 8      | alpha     | optional |
| 83-94    | סכום חובה 1 בש"ח          | 12     | decimal   | 9.2 format |
| 95-106   | סכום חובה 2 בש"ח          | 12     | decimal   | 9.2 |
| 107-118  | סכום זכות 1 בש"ח          | 12     | decimal   | 9.2 |
| 119-130  | סכום זכות 2 בש"ח          | 12     | decimal   | 9.2 |
| 131-142  | סכום חובה 1 במט"ח         | 12     | decimal   | 9.2 |
| 143-154  | סכום חובה 2 במט"ח         | 12     | decimal   | 9.2 |
| 155-166  | סכום זכות 1 במט"ח         | 12     | decimal   | 9.2 |
| 167-178  | סכום זכות 2 במט"ח         | 12     | decimal   | 9.2 |
| 179-180  | CR + LF                   | 2      | binary    | 0x0D 0x0A |

**Total**: 180 chars per record. Multiple records → file.

### Encoding
- **Charset**: Windows-1255 (CP1255 — Hebrew Windows ANSI)
- **No BOM**
- **Bytes**: 1 byte per char (Hebrew chars are E0-FA range)

### Padding
- **Alpha fields**: left-aligned, space-padded right
- **Numeric fields**: right-aligned, space-padded left (or zero-padded — both accepted)
- **Decimal 9.2**: right-aligned, space-padded. Format `'%12.2f'`. Examples:
  - `      484.78` (12 chars)
  - `        0.00` (12 chars)
  - `   -100.50` (negative — leading space + minus)

### Date Format
- **DDMMYY**: 6 digits, no separators
- 10/02/2026 → `100226`
- 05/03/2026 → `050326`
- בעיית Y2K (2000-2099): year 26 = 2026 (Priority interprets correctly within reasonable range)

---

## Examples

### Example 1: Single supplier invoice (Wertheim 4427930)

```
Source data:
  - Type: "מ" (compound)
  - Invoice #: 4427930 (truncated to last 5: 27930)
  - Date: 10/02/2026
  - Subtotal: 484.78
  - VAT: 87.22
  - Total: 572.00
  - Expense: 502-0 / VAT account: 205-2 / Supplier: 200087
```

Generated record (180 chars, displayed with positions):
```
Position: 1234567890123456789012345...
Record:   "מ  27930100226    0100226ILSקניות 4427930         502-0   205-2   200087           484.78       87.22      572.00        0.00        0.00        0.00        0.00        0.00\r\n"
```

### Example 2: Two-invoice batch (POC artifact)

```python
# generate_movein.py output → movein.dat
# 2 records × 180 chars = 360 bytes
# CP1255 encoding, CR+LF

# View hex first 16 bytes:
# מ' (0xEE) ' '  ' '  '2' '7' '9' '3' '0' '1' '0' '0' '2' '2' '6' ' '
# EE 20 20 32 37 39 33 30 31 30 30 32 32 36 20
```

---

## Common Pitfalls

### ❌ Wrong: UTF-16 encoding
Priority's old-school MOVEIN parser expects single-byte ANSI. UTF-16 = total garble.

### ❌ Wrong: Embedded quotes in fields
`ש"ח` contains a quote (`"`) which breaks parsers. Use `ILS`, `USD`, etc.

### ❌ Wrong: TAB or comma separator
180-char format is **fixed-width, no separators**. TAB will count as a char and corrupt positions.

### ❌ Wrong: CRLF inconsistency
Mixing LF and CRLF will offset records. Use only `\r\n` (CR+LF).

### ❌ Wrong: Hebrew strings without testing
Some Hebrew may render RTL during transmission. Test with single chars (e.g., "מ" 1 char) before multi-char.

### ❌ Wrong: Field overflow
- אסמכתא 1: max 99999. Truncating value 4427930 to "44279" (first 5) gives wrong result. Use last 5: "27930".
- חשבון: 8 chars max. "1234567890" gets truncated.

### ❌ Wrong: Decimal mismatch
"5,488.14" with comma — fail. Use "5488.14" with dot.

### ❌ Wrong: Empty mandatory field
Even if logically optional, format requires placeholder (spaces or zeros). Don't leave gaps shorter than expected width.

---

## Priority-Specific Setup (per `כיצד ניתן לקלוט תנועות יומן מחשבשבת.pdf`)

### Pre-load setup (one-time per company)
1. Navigate: כספים → תחזוקת כספים → ממשקים להנה"ש → הגדרת פרמטרים לטעינה
2. Add new record:
   - תוכנת מקור: `HASH`
   - תאור: "חשבשבת"
   - ✓ Check: "לחשב סכום בדולרים?"
   - Save (F8)

### Per-load workflow
1. Navigate: כספים → תחזוקת כספים → ממשקים להנה"ש → ממשק תנועות יומן → **טעינה מתוכנות אחרות (פורמט MOVEIN.DAT)**
2. Browse to your `movein.dat` file
3. Enter **מספר מנה** (batch number) — unique per load (e.g., timestamp or sequence)
4. Run
5. Check: טבלת טעינה לתנועות יומן — should show records loaded
6. If clean: העברה מטבלת הטעינה ליומן
7. If errors: דוח שגיאות

---

## Validation Before Generating MOVEIN.DAT

Per `je_scenarios_playbook.md` — 10 checks. Critical for MOVEIN context:

1. **Balance**: sum(DR) = sum(CR) ±0.05
2. **Currency**: all rows same currency code (mixed not supported in single record)
3. **Account length**: max 8 chars per account
4. **Reference 1 length**: ≤ 5 digits (or use FLEXIBLE method)
5. **Date validity**: actual valid date in DDMMYY format
6. **Hebrew encoding**: all strings encodable in CP1255

---

## Migration Path: 180-char → FLEXIBLE

When 180-char limits hit:
- Multi-line invoices (3+ DR accounts)
- Allocation > 5 chars
- Cost center needed
- Long supplier reference

→ Switch to FLEXIBLE method:
- Generate `movein.doc` (data file)
- Generate `movein.prm` (parameters file defining field positions)
- Priority menu: same path, different sub-option
- More flexible field widths

**Phase 1**: 180-char only (covers 80% of cases)
**Phase 2**: FLEXIBLE engine added (covers 99%)

---

## Reference Implementation

See `08_poc_artifacts/generate_movein.py`. This is a working Python implementation that produced `movein_working.dat` which Priority loaded successfully.

For Phase 1 TypeScript implementation, port this script with:
- Same field positions
- Same encoding (CP1255 — use `iconv-lite` in Node)
- Same CR+LF endings
- Same padding rules
- Same decimal format
- Add: tests, multi-tenant context, edge cases, error handling
