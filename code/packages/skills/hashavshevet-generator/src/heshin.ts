import iconv from 'iconv-lite';

/**
 * Hashavshevet account-card import pair: HESHIN.DAT + HESHIN.PRM.
 *
 * Structure reverse-engineered from a Rivhit-produced package that
 * Hashavshevet imported successfully (June 2026 reference):
 *  - HESHIN.DAT: first line = record count, then fixed 1544-char records,
 *    CP1255 + CRLF.
 *  - HESHIN.PRM: first line = 1545 (record length + 1), then one row per
 *    field: "start<TAB>end<TAB>name;<TAB><TAB>row-hint". The PRM below is a
 *    faithful reconstruction of the reference file's field table (captured in
 *    full before the original was lost); byte-exactness against the original
 *    is not guaranteed — validate once against a live Hashavshevet import.
 *
 * Fields we populate in HESHIN.DAT (offsets are 1-based, per the PRM):
 *   1-15    account key
 *   16-65   account name
 *   427-435 dealer/VAT number (מספר עוסק מורשה)
 *   614     VAT-exempt flag — '0' in every working reference record
 *   1401-1411 tax id (ח.פ/ת.ז)
 */

export const HESHIN_RECORD_LENGTH = 1544;

export interface HeshinAccountInput {
  accountKey: string;
  accountName: string;
  /** 8-9 digit company/dealer id; omitted when unknown. */
  taxId?: string;
}

// start, end, field name (Hebrew business content, as Hashavshevet expects),
// screen-row hint — all copied from the working reference PRM.
const PRM_FIELDS: Array<[number, number, string, string]> = [
  [1, 15, 'מפתח חשבון', 'שורה 1'],
  [16, 65, 'שם חשבון', 'שורה 1'],
  [66, 74, 'קוד מיון', 'שורה 8'],
  [75, 79, 'חתך', 'שורה 16'],
  [80, 109, 'טלפון', 'שורה 3'],
  [110, 139, 'כתובת', 'שורה 4'],
  [140, 154, 'שכונה', 'שורה 10'],
  [155, 174, 'עיר', 'שורה 8'],
  [175, 179, 'מיקוד', 'שורה 36'],
  [180, 194, 'עיסוק', 'שורה 13'],
  [195, 198, 'העברה לרו"ח', 'שורה 49'],
  [199, 248, 'פרטים', 'שורה 4'],
  [249, 256, 'תאריך נוסף 1', 'שורה 32'],
  [257, 264, 'תאריך נוסף 2', 'שורה 33'],
  [265, 275, 'סכום נוסף 1', 'שורה 25'],
  [276, 286, 'סכום נוסף 2', 'שורה 26'],
  [287, 297, 'סכום נוסף 3', 'שורה 27'],
  [298, 308, 'סכום נוסף 4', 'שורה 28'],
  [309, 319, 'מקסימום אשראי', 'שורה 29'],
  [320, 324, "מטבע מקס' אשראי", 'שורה 65'],
  [325, 335, 'מקסימום אובליגו', 'שורה 30'],
  [336, 340, 'מטבע מקסימום אובליגו', 'שורה 68'],
  [0, 0, '% הנחה כללית', ''],
  [341, 390, 'הודעה ללקוח', 'שורה 7'],
  [391, 405, 'חשבון מרכז', 'שורה 27'],
  [406, 414, 'סוכן', 'שורה 46'],
  [415, 418, '% ניכוי במקור', 'שורה 104'],
  [419, 426, 'בתוקף עד תאריך', 'שורה 53'],
  [427, 435, 'מספר עוסק מורשה', 'שורה 48'],
  [436, 437, 'קוד בנק', 'שורה 219'],
  [438, 442, 'קוד סניף', 'שורה 88'],
  [443, 462, 'מספר חשבון בנק', 'שורה 23'],
  [463, 473, 'מכירות שנה קודמת', 'שורה 43'],
  [474, 478, 'מטבע מכירות שנה קודמת', 'שורה 95'],
  [479, 489, 'קניות שנה קודמת', 'שורה 44'],
  [490, 494, 'מטבע קניות שנה קודמת', 'שורה 99'],
  [495, 544, 'דואר אלקטרוני', 'שורה 10'],
  [545, 574, 'פקס', 'שורה 19'],
  [575, 604, 'מדינה', 'שורה 20'],
  [605, 613, 'קוד פיצול תשלומים', 'שורה 68'],
  [614, 614, 'פטור ממע"מ', 'שורה 615'],
  [615, 629, 'חשבון הפרשים', 'שורה 42'],
  [630, 634, 'מטבע התחשבנות', 'שורה 127'],
  [635, 643, 'קוד מאזן', 'שורה 71'],
  [644, 644, 'איחור תשלומים', 'שורה 645'],
  [645, 653, 'קוד חשבון ראשי', 'שורה 72'],
  [654, 661, 'קוד תמחיר', 'שורה 82'],
  [662, 711, 'קובץ', 'שורה 14'],
  [712, 741, 'טלפון סלולרי', 'שורה 24'],
  [742, 991, 'אתר אינטרנט', 'שורה 3'],
  [992, 1011, 'תיק מס הכנסה', 'שורה 50'],
  [1012, 1020, 'קו חלוקה', 'שורה 113'],
  [1021, 1029, 'מסמך סוגר בהפצה', 'שורה 114'],
  [1030, 1279, 'כתובת למסמכי ייצוא', 'שורה 5'],
  [1280, 1329, 'מספר כרטיס אשראי', 'שורה 26'],
  [1330, 1331, 'תוקף כרטיס חודש', 'שורה 666'],
  [1332, 1333, 'תוקף כרטיס שנה', 'שורה 667'],
  [1334, 1363, 'ת.ז. בעל הכרטיס', 'שורה 45'],
  [1364, 1383, 'טלפון בעל הכרטיס', 'שורה 69'],
  [1384, 1387, 'Sbcvv', 'שורה 347'],
  [1388, 1391, 'ארבע ספרות אחרונות', 'שורה 348'],
  [1392, 1400, 'קוד סעיף חשבונאי', 'שורה 155'],
  [1401, 1411, 'ת.ז. ח.פ', 'שורה 128'],
  [1412, 1422, 'ת.ז. ח.פ 2', 'שורה 129'],
  [1423, 1433, 'טלפון 1', 'שורה 130'],
  [1434, 1444, 'טלפון 2', 'שורה 131'],
  [1445, 1494, 'שם חשבון ראשי', 'שורה 29'],
  [1495, 1544, 'שם מאזן', 'שורה 30'],
];

export function generateHeshinPrm(): Buffer {
  const rows = PRM_FIELDS.map(([start, end, name, hint]) =>
    hint === '' ? `${start}\t${end}\t${name};` : `${start}\t${end}\t${name};\t\t${hint}`,
  );
  const text = `${HESHIN_RECORD_LENGTH + 1}\r\n${rows.join('\r\n')}`;
  return iconv.encode(text, 'cp1255');
}

function place(buf: string[], start1: number, value: string, maxLen: number): void {
  const v = value.slice(0, maxLen);
  for (let i = 0; i < v.length; i++) buf[start1 - 1 + i] = v[i]!;
}

export function buildHeshinRecord(account: HeshinAccountInput): string {
  const buf: string[] = Array<string>(HESHIN_RECORD_LENGTH).fill(' ');
  place(buf, 1, account.accountKey.trim(), 15);
  place(buf, 16, account.accountName.trim(), 50);
  place(buf, 614, '0', 1);
  const taxId = (account.taxId ?? '').replace(/\D/g, '');
  if (taxId !== '' && !/^0+$/.test(taxId)) {
    place(buf, 427, taxId, 9);
    place(buf, 1401, taxId, 11);
  }
  return buf.join('');
}

export interface HeshinResult {
  dat: Buffer;
  prm: Buffer;
}

export function generateHeshin(accounts: HeshinAccountInput[]): HeshinResult {
  if (accounts.length === 0) {
    throw new Error('generateHeshin: at least one account required');
  }
  const rows = accounts.map(buildHeshinRecord);
  const text = `${rows.length}\r\n${rows.join('\r\n')}\r\n`;
  return { dat: iconv.encode(text, 'cp1255'), prm: generateHeshinPrm() };
}
