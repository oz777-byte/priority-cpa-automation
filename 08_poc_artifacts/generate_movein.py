#!/usr/bin/env python3
"""
MOVEIN.DAT Generator — Detailed format (180 chars per record)
==============================================================

מבוסס על מפרט SUMIT Books / חשבשבת:
180 תווים בכל רשומה, encoding CP1255, סיום שורה CR+LF.

מבנה:
  1-3:   קוד סוג תנועה   (3 alpha)
  4-8:   אסמכתא 1         (5 numeric Long)  — last 5 digits of invoice#
  9-14:  תאריך אסמכתא    (6 ddmmyy)
  15-19: אסמכתא 2         (5 numeric)        — empty
  20-25: תאריך ערך         (6 ddmmyy)
  26-28: קוד מטבע         (3 alpha)
  29-50: פרטים            (22 alpha)
  51-58: חשבון חובה 1    (8 alpha)
  59-66: חשבון חובה 2    (8 alpha)
  67-74: חשבון זכות 1    (8 alpha)
  75-82: חשבון זכות 2    (8 alpha)         — empty
  83-94:  סכום חובה 1 ש"ח (12 = 9.2 decimal)
  95-106: סכום חובה 2 ש"ח (12)
  107-118: סכום זכות 1 ש"ח (12)
  119-130: סכום זכות 2 ש"ח (12)            — empty
  131-142: סכום חובה 1 מט"ח (12)            — 0
  143-154: סכום חובה 2 מט"ח (12)            — 0
  155-166: סכום זכות 1 מט"ח (12)            — 0
  167-178: סכום זכות 2 מט"ח (12)            — 0
  179-180: CR + LF

ONE row = ONE balanced JE:
  חובה1 = expense (502-0) | סכום חובה 1 = subtotal
  חובה2 = VAT (205-2)     | סכום חובה 2 = VAT amount
  זכות1 = supplier        | סכום זכות 1 = total
"""

import json
from pathlib import Path
from datetime import datetime

CONFIG = {
    'transaction_type':  'מ',            # תנועה מורכבת — single char, no RTL issue, matches Tari manual entries
    'expense_account':   '502-0',
    'vat_input_account': '205-2',
    'currency':          'ILS',           # 3 chars, no quotes, no RTL issue
    'output_filename':   'movein.dat',
}

BASE = Path(__file__).resolve().parent.parent
EXTRACT_DIR = BASE / '03_ocr_extraction'
OUT_DIR     = BASE / '04_tsv_output'


def to_ddmmyy(iso_date):
    return datetime.strptime(iso_date, '%Y-%m-%d').strftime('%d%m%y')


def alpha_left(text, width):
    """Left-aligned alpha field, space-padded right, truncate if too long."""
    text = (text or '')[:width]
    return text.ljust(width, ' ')


def alpha_right(text, width):
    """Right-aligned alpha (rare, for some numeric-as-string fields)."""
    text = (text or '')[:width]
    return text.rjust(width, ' ')


def numeric_long(value, width):
    """Numeric field — right-aligned, space-padded left. Truncate to last N digits."""
    s = str(int(value))
    if len(s) > width:
        s = s[-width:]  # take last N digits
    return s.rjust(width, ' ')


def decimal_92(value, width=12):
    """Decimal 9.2 — width 12 (9 before + . + 2 after).
       Format: ' '*pad + 'NNNNNNNNN.NN'   — right-aligned."""
    s = f'{value:.2f}'  # e.g. "5488.14" or "0.00"
    return s.rjust(width, ' ')


def build_movein_row(inv):
    invoice_num   = inv['invoice']['number']
    iso_date      = inv['invoice']['date']
    subtotal      = inv['totals']['subtotal']
    total         = inv['totals']['total']
    vat           = round(total - subtotal, 2)
    supplier_acct = inv['supplier']['internal_code_priority']
    expense_acct  = CONFIG['expense_account']
    vat_acct      = CONFIG['vat_input_account']
    ttype         = CONFIG['transaction_type']
    currency      = CONFIG['currency']

    # פרטים — שמירת מספר החשבונית המלא ב-22 chars
    # "קניות 4427930" = 13 chars Hebrew; trim if needed
    details_text  = f'קניות {invoice_num}'

    # Build each field at exact width
    f_ttype       = alpha_left(ttype, 3)               # 1-3
    f_asmach1     = numeric_long(invoice_num, 5)       # 4-8 (last 5 digits)
    f_date_asm    = to_ddmmyy(iso_date)                # 9-14
    f_asmach2     = numeric_long(0, 5)                 # 15-19 (empty/zero)
    f_date_val    = to_ddmmyy(iso_date)                # 20-25
    f_currency    = alpha_left(currency, 3)            # 26-28
    f_details     = alpha_left(details_text, 22)       # 29-50
    f_dr1_acct    = alpha_left(expense_acct, 8)        # 51-58
    f_dr2_acct    = alpha_left(vat_acct, 8)            # 59-66
    f_cr1_acct    = alpha_left(supplier_acct, 8)       # 67-74
    f_cr2_acct    = alpha_left('', 8)                  # 75-82 empty
    f_dr1_amt     = decimal_92(subtotal, 12)           # 83-94
    f_dr2_amt     = decimal_92(vat, 12)                # 95-106
    f_cr1_amt     = decimal_92(total, 12)              # 107-118
    f_cr2_amt     = decimal_92(0.0, 12)                # 119-130
    f_dr1_fx      = decimal_92(0.0, 12)                # 131-142
    f_dr2_fx      = decimal_92(0.0, 12)                # 143-154
    f_cr1_fx      = decimal_92(0.0, 12)                # 155-166
    f_cr2_fx      = decimal_92(0.0, 12)                # 167-178

    record = (
        f_ttype + f_asmach1 + f_date_asm + f_asmach2 + f_date_val +
        f_currency + f_details +
        f_dr1_acct + f_dr2_acct + f_cr1_acct + f_cr2_acct +
        f_dr1_amt + f_dr2_amt + f_cr1_amt + f_cr2_amt +
        f_dr1_fx + f_dr2_fx + f_cr1_fx + f_cr2_fx
    )
    # Should be 178 chars (positions 1-178). +2 for CR+LF = 180 total.
    assert len(record) == 178, f'record length {len(record)} ≠ 178'
    return record


def main():
    invoices = []
    for fn in sorted(EXTRACT_DIR.glob('*.json')):
        with fn.open('r', encoding='utf-8') as f:
            invoices.append((fn.stem, json.load(f)))

    out = OUT_DIR / CONFIG['output_filename']
    rows_text = []
    for name, inv in invoices:
        record = build_movein_row(inv)
        rows_text.append(record)
        print(f'\n=== {name} ===')
        print(f'len: {len(record)}  (+2 CRLF = 180)')
        # Display as positional
        print(f'  1-3   ttype:    {record[0:3]!r}')
        print(f'  4-8   asm1:     {record[3:8]!r}  (truncated from {inv["invoice"]["number"]})')
        print(f'  9-14  asm_date: {record[8:14]!r}')
        print(f' 15-19  asm2:     {record[14:19]!r}')
        print(f' 20-25  val_date: {record[19:25]!r}')
        print(f' 26-28  currency: {record[25:28]!r}')
        print(f' 29-50  details:  {record[28:50]!r}')
        print(f' 51-58  dr1 acct: {record[50:58]!r}')
        print(f' 59-66  dr2 acct: {record[58:66]!r}')
        print(f' 67-74  cr1 acct: {record[66:74]!r}')
        print(f' 75-82  cr2 acct: {record[74:82]!r}')
        print(f' 83-94  dr1 amt:  {record[82:94]!r}')
        print(f' 95-106 dr2 amt:  {record[94:106]!r}')
        print(f'107-118 cr1 amt:  {record[106:118]!r}')

    # Write CP1255 with CR+LF
    with out.open('wb') as f:
        for record in rows_text:
            line = (record + '\r\n').encode('cp1255')
            assert len(line) == 180, f'line length {len(line)} ≠ 180'
            f.write(line)

    print(f'\n=== File written ===')
    print(f'Path: {out}')
    print(f'Size: {out.stat().st_size} bytes (expected {len(rows_text) * 180})')

    # Verify
    raw = out.read_bytes()
    print(f'Bytes per row: 180')
    print(f'Encoding: CP1255 (no BOM)')
    crlf = b'\r\n'
    print(f'Line endings: CR+LF count: {raw.count(crlf)}')


if __name__ == '__main__':
    main()
