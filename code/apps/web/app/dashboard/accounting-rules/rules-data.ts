import type { LucideIcon } from 'lucide-react';
import {
  Receipt,
  ShieldCheck,
  Wallet,
  Banknote,
  Layers,
  Tag,
  RotateCcw,
  Percent,
  Calendar,
  Globe,
  Building,
  Tags,
  AlertTriangle,
} from 'lucide-react';

export type RuleStatus = 'auto' | 'auto-with-warning' | 'manual' | 'coming-soon';

export interface JELineSpec {
  account: string;
  side: 'DR' | 'CR';
  amount: string;
  label: string;
}

export interface ExampleSpec {
  description: string;
  invoice: {
    number?: string;
    supplier?: string;
    subtotal: number;
    total: number;
    extras?: Record<string, string | number>;
  };
  je: JELineSpec[];
  notes?: string[];
}

export interface AccountingRule {
  code: string;
  title: string;
  icon: LucideIcon;
  status: RuleStatus;
  oneLiner: string;
  description: string;
  triggers: string[];
  jeStructure: string;
  example: ExampleSpec;
  rules: string[];
  perCompanyOverrides?: string[];
}

export const RULES: AccountingRule[] = [
  {
    code: 'STANDARD',
    title: 'חשבונית ספק רגילה',
    icon: Receipt,
    status: 'auto',
    oneLiner: 'המקרה הנפוץ ביותר — חשבונית ילך לתשלום שוטף לספק.',
    description:
      'חשבונית ספק רגילה במטבע מקומי, ללא ניכוי במקור, ללא מרכז עלות, וללא חריגות. תשלום יבוצע לספק במועד מאוחר יותר (שוטף+30/60).',
    triggers: [
      'currency = ILS',
      'is_credit_note = false',
      'subtotal ≤ רף הקצאה (לתאריך)',
      'אין payment_method מיידי',
      'אין מרכז עלות / מע"מ מעורב / multi-expense בקונטקסט',
    ],
    jeStructure: 'רשומה אחת, 3 שורות.',
    example: {
      description: 'חשבונית וירטהיים 4427930 — קניות חומרים',
      invoice: { number: '4427930', supplier: 'וירטהיים בע"מ', subtotal: 484.78, total: 572.0 },
      je: [
        { account: '502-0', side: 'DR', amount: '484.78', label: 'הוצאה — קניות' },
        { account: '205-2', side: 'DR', amount: '87.22', label: 'מע"מ תשומות' },
        { account: '200087', side: 'CR', amount: '572.00', label: 'ספק וירטהיים' },
      ],
      notes: ['מע"מ מחושב כהפרש total - subtotal, לא נלקח מה-OCR (שלא תמיד מדויק)'],
    },
    rules: [
      'איזון: סך חובה = סך זכות (טולרנס ±0.05 ₪)',
      'מע"מ מחושב מ-total - subtotal, לא מתויגת מה-OCR',
      'תאריך אסמכתא = תאריך ערך אם לא צוין אחרת',
    ],
    perCompanyOverrides: [
      'חשבון הוצאה ברירת מחדל (הגדרות חברה)',
      'חשבון מע"מ תשומות (הגדרות חברה)',
      'סוג תנועה (הגדרות חברה)',
    ],
  },

  {
    code: 'WITH_ALLOCATION',
    title: 'חשבונית עם מספר הקצאה',
    icon: ShieldCheck,
    status: 'auto-with-warning',
    oneLiner: 'חוק 2024+: חשבוניות מעל הרף חייבות מספר הקצאה ייחודי מרשות המסים.',
    description:
      'מספר הקצאה הוא מזהה שמופק על ידי רשות המסים לחשבוניות גבוהות (חוק 2024+). חשבונית מעל הרף ללא הקצאה — תשומותיה נפסלות. הרף: 25,000 ₪ ב-2024, ~20,000 ₪ מ-2025.',
    triggers: ['allocation_number קיים בחשבונית'],
    jeStructure: 'זהה ל-STANDARD. מספר ההקצאה נשמר בשדה הפרטים (פורמט 180) או בשדה ייעודי (פורמט FLEXIBLE — בקרוב).',
    example: {
      description: 'חשבונית מעל הרף עם הקצאה',
      invoice: {
        number: '4427930',
        supplier: 'וירטהיים בע"מ',
        subtotal: 484.78,
        total: 572.0,
        extras: { 'מספר הקצאה': '1I4427930' },
      },
      je: [
        { account: '502-0', side: 'DR', amount: '484.78', label: 'הוצאה — קניות' },
        { account: '205-2', side: 'DR', amount: '87.22', label: 'מע"מ תשומות' },
        { account: '200087', side: 'CR', amount: '572.00', label: 'ספק וירטהיים' },
      ],
      notes: [
        'אזהרה: אם מספר ההקצאה ארוך מ-5 תווים — פורמט 180 לא תומך, נדרש FLEXIBLE',
        'אימות מספר ההקצאה מול רשות המסים — Phase 4',
      ],
    },
    rules: [
      'אזהרה אם allocation_number > 5 תווים (180 לא תומך)',
      'במצב FLEXIBLE — נכתב לשדה ייעודי שתומך עד 20 תווים',
      'אימות API מול רשות המסים — בקרוב',
    ],
  },

  {
    code: 'IMMEDIATE_PAYMENT',
    title: 'חשבונית בתשלום מיידי',
    icon: Wallet,
    status: 'auto',
    oneLiner: 'חשבונית ששולמה במזומן/אשראי/העברה — לא נוצרת יתרת ספק.',
    description:
      'במקום לזכות את חשבון הספק ולהשאיר חוב פתוח — המערכת זוקפת ישירות לחשבון הבנק / מזומן / אשראי שדרכו שולם.',
    triggers: ['payment_method = cash / card / transfer'],
    jeStructure: 'רשומה אחת, 3 שורות. שורת הזכות שונה: חשבון התשלום במקום הספק.',
    example: {
      description: 'רכישת ציוד משרדי, שולם באשראי במקום',
      invoice: { number: 'CR-1234', supplier: 'אופיס דיפו', subtotal: 169.49, total: 200.0 },
      je: [
        { account: '502-0', side: 'DR', amount: '169.49', label: 'הוצאה — משרדי' },
        { account: '205-2', side: 'DR', amount: '30.51', label: 'מע"מ תשומות' },
        { account: '125-0', side: 'CR', amount: '200.00', label: 'כרטיס אשראי (תשלום מיידי)' },
      ],
    },
    rules: [
      'חשבון הזכות חייב להיות מוגדר כברירת מחדל ב-paymentAccount, אחרת אזהרה',
      'אין יתרה לספק — לא מתועד ב-A/P',
    ],
    perCompanyOverrides: [
      'חשבון בנק לתשלומי העברה (פר-חברה)',
      'חשבון אשראי לתשלומי כרטיס (פר-חברה, יכול להיות יותר מאחד)',
      'חשבון מזומן (פר-חברה)',
    ],
  },

  {
    code: 'CREDIT_NOTE',
    title: 'חשבונית זיכוי / החזר',
    icon: RotateCcw,
    status: 'auto',
    oneLiner: 'ביטול חשבונית קודמת — מהפך כיווני חובה/זכות.',
    description:
      'כשספק מוציא חשבונית זיכוי (החזר על קנייה, ביטול שירות), JE נוצר ככיוון הפוך לחשבונית רגילה: חובה לספק, זכות להוצאה ולמע"מ.',
    triggers: ['is_credit_note = true בחשבונית'],
    jeStructure: 'רשומה אחת, 3 שורות עם DR/CR הפוכים מתרחיש STANDARD.',
    example: {
      description: 'זיכוי על חשבונית 4427930',
      invoice: { number: 'CN-4427930', supplier: 'וירטהיים בע"מ', subtotal: 484.78, total: 572.0 },
      je: [
        { account: '200087', side: 'DR', amount: '572.00', label: 'ספק וירטהיים (חוב חוזר)' },
        { account: '205-2', side: 'CR', amount: '87.22', label: 'מע"מ תשומות (מתבטל)' },
        { account: '502-0', side: 'CR', amount: '484.78', label: 'הוצאה — קניות (מתבטלת)' },
      ],
      notes: ['השורה הראשונה DR ספק = הקטנת החוב לספק'],
    },
    rules: [
      'מהפך מלא של DR/CR לעומת STANDARD',
      'תיאור כולל "זיכוי" אוטומטית',
    ],
  },

  {
    code: 'WITH_WITHHOLDING',
    title: 'ניכוי מס במקור',
    icon: Percent,
    status: 'auto-with-warning',
    oneLiner: 'ספק שירותים שיש לו אחוז ניכוי קבוע — חלק מהתשלום הולך לרשות המסים.',
    description:
      'כשמשלמים לספק שירותים מסוימים (יועצים, נותני שירות, אומנים) חובה לנכות אחוז במקור ולהעבירו לרשות המסים. הספק מקבל פחות, רשות המסים מקבלת את ההפרש.',
    triggers: ['withholdingPercent מוגדר בקונטקסט (פר-ספק או פר-חשבונית)'],
    jeStructure: 'דורש 2 חשבונות זכות: הספק + רשות המסים. בפורמט 180 דורש 2 רשומות נפרדות, או רשומה אחת בפורמט FLEXIBLE.',
    example: {
      description: 'תשלום ליועץ עם 5% ניכוי במקור',
      invoice: { number: '101', supplier: 'יועץ X', subtotal: 1000, total: 1180, extras: { 'אחוז ניכוי': '5%' } },
      je: [
        { account: '504-0', side: 'DR', amount: '1000.00', label: 'שירותים מקצועיים' },
        { account: '205-2', side: 'DR', amount: '180.00', label: 'מע"מ תשומות' },
        { account: '200xxx', side: 'CR', amount: '1130.00', label: 'ספק (1180 - 50)' },
        { account: '175-0', side: 'CR', amount: '50.00', label: 'רשות המסים — ניכוי במקור' },
      ],
      notes: ['פורמט 180 לא תומך ב-2 חשבונות זכות; דרוש FLEXIBLE או 2 רשומות נפרדות'],
    },
    rules: [
      'בקרוב: בחירת אחוז הניכוי פר-ספק במאסטר',
      'בקרוב: ניהול חשבון רשות המסים פר-חברה',
    ],
  },

  {
    code: 'MULTI_EXPENSE',
    title: 'חשבונית מולטי-קטגוריה',
    icon: Layers,
    status: 'auto-with-warning',
    oneLiner: 'חשבונית אחת, כמה סוגי הוצאות שונים (קניות + שירותים).',
    description:
      'ספק שמספק חומר גלם בחלק מהסכום ושירות בחלק אחר. כל קטגוריה הולכת לחשבון הוצאה שונה. בפורמט 180 דורש 2 רשומות, מקושרות לפי אסמכתא.',
    triggers: ['hasMultipleExpenseCategories=true בקונטקסט (זוהה מחילוץ ה-OCR או מציון ידני)'],
    jeStructure: 'בפורמט 180: 2 רשומות עם אותה אסמכתא. בפורמט FLEXIBLE: רשומה אחת עם 3+ שורות.',
    example: {
      description: 'ספק שמספק חומרי גלם 1000 ₪ + שירות התקנה 500 ₪',
      invoice: { number: '202', supplier: 'X', subtotal: 1500, total: 1770 },
      je: [
        { account: '503-0', side: 'DR', amount: '1000.00', label: 'חומרי גלם' },
        { account: '205-2', side: 'DR', amount: '180.00', label: 'מע"מ (לחומ"ג)' },
        { account: '200xxx', side: 'CR', amount: '1180.00', label: 'ספק (חלק חומ"ג)' },
        { account: '504-0', side: 'DR', amount: '500.00', label: 'שירותים' },
        { account: '205-2', side: 'DR', amount: '90.00', label: 'מע"מ (לשירות)' },
        { account: '200xxx', side: 'CR', amount: '590.00', label: 'ספק (חלק שירות)' },
      ],
      notes: ['2 רשומות JE נפרדות עם אותה אסמכתא — פריוריטי תקשר אותן'],
    },
    rules: ['בקרוב: UI לפיצול חשבונית לפי קטגוריות'],
  },

  {
    code: 'WITH_COST_CENTER',
    title: 'חשבונית עם מרכז עלות',
    icon: Tags,
    status: 'auto-with-warning',
    oneLiner: 'חשבונית ששייכת לפרויקט / מחלקה — תוייגת לדוחות פנימיים.',
    description:
      'מרכז עלות הוא תיוג שמאפשר חיתוך פנימי: לראות כמה הוצאה לכל פרויקט, מחלקה, או יוזמה. דורש פורמט FLEXIBLE כי 180 לא תומך בשדה הזה.',
    triggers: ['costCenter מוגדר בקונטקסט'],
    jeStructure: 'זהה ל-STANDARD מבחינת חשבונות, אבל חובה פורמט FLEXIBLE. כל שורה מקבלת תיוג מרכז עלות.',
    example: {
      description: 'חשבונית וירטהיים שייכת לפרויקט "PROJ-A"',
      invoice: { number: '4427930', supplier: 'וירטהיים', subtotal: 484.78, total: 572, extras: { 'מרכז עלות': 'PROJ-A' } },
      je: [
        { account: '502-0', side: 'DR', amount: '484.78', label: 'הוצאה [PROJ-A]' },
        { account: '205-2', side: 'DR', amount: '87.22', label: 'מע"מ תשומות' },
        { account: '200087', side: 'CR', amount: '572.00', label: 'ספק' },
      ],
    },
    rules: ['בקרוב: ניהול רשימת מרכזי עלות פר-חברה'],
    perCompanyOverrides: [
      'רשימת מרכזי עלות (פרויקטים, מחלקות) — בקרוב',
      'מרכז עלות ברירת מחדל — בקרוב',
    ],
  },

  {
    code: 'MIXED_DEDUCTION',
    title: 'מע"מ מעורב',
    icon: Percent,
    status: 'auto-with-warning',
    oneLiner: 'הוצאה שחלקה מנוכה וחלקה לא — לפי חוקי המס הישראליים.',
    description:
      'חוק המס הישראלי מאפשר ניכוי חלקי של מע"מ בקטגוריות מסוימות: רכב 2/3, אש"ל 1/4. החלק שלא מנוכה הופך להוצאה (אין החזר).',
    triggers: ['mixedDeductionCategory מוגדר (vehicle / meals / non_deductible)'],
    jeStructure: '4-5 שורות בודד רשומה. חלק המע"מ המנוכה הולך ל-205-2, החלק הלא-מנוכה מצטרף להוצאה.',
    example: {
      description: 'תיקון רכב 1180 ₪ — רכב = 2/3 מנוכה',
      invoice: { number: '301', supplier: 'מוסך X', subtotal: 1000, total: 1180, extras: { 'קטגוריה': 'vehicle (2/3)' } },
      je: [
        { account: '502-0', side: 'DR', amount: '666.67', label: 'הוצאה מנוכה (2/3 × 1000)' },
        { account: '502-1', side: 'DR', amount: '393.33', label: 'הוצאה לא מנוכה (1/3 × 1000 + 1/3 × 180)' },
        { account: '205-2', side: 'DR', amount: '120.00', label: 'מע"מ מנוכה (2/3 × 180)' },
        { account: '200xxx', side: 'CR', amount: '1180.00', label: 'ספק' },
      ],
      notes: [
        'אחוז הניכוי קבוע בחוק (לא ניתן לשינוי פר-חברה)',
        'חשבון "הוצאה לא מנוכה" יכול להיות שונה פר-חברה',
      ],
    },
    rules: [
      'רכב: 2/3 מנוכה — קבוע בחוק',
      'אש"ל / מתנות: 1/4 מנוכה — קבוע בחוק',
      'non_deductible: 0% — קבוע בחוק',
    ],
  },

  {
    code: 'FOREIGN_CURRENCY',
    title: 'חשבונית במטבע חוץ',
    icon: Globe,
    status: 'auto-with-warning',
    oneLiner: 'חשבונית ב-USD/EUR/GBP — דורש המרה לפי שער יומי + ניהול הפרשי שער.',
    description:
      'חשבונית במט"ח דורשת רישום כפול: גם ב-₪ (לפי שער יומי של בנק ישראל) וגם במטבע המקור. הפרשי שער בין הרישום לתשלום מהווים רווח/הפסד מטבע.',
    triggers: ['currency != ILS'],
    jeStructure: 'אותו מבנה כמו STANDARD, אבל פורמט 180 כולל גם שדות מט"ח (131-178).',
    example: {
      description: 'חשבונית 100$ × שער 3.7',
      invoice: { number: '401', supplier: 'X', subtotal: 100, total: 118, extras: { 'מטבע': 'USD', 'שער': '3.70' } },
      je: [
        { account: '502-0', side: 'DR', amount: '370.00 ₪ (100$)', label: 'הוצאה (סכום ב-₪ + מט"ח)' },
        { account: '205-2', side: 'DR', amount: '66.60 ₪ (18$)', label: 'מע"מ תשומות' },
        { account: '200xxx', side: 'CR', amount: '436.60 ₪ (118$)', label: 'ספק (במט"ח)' },
      ],
      notes: ['שערי בנק ישראל יומיים נשלפים אוטומטית — Phase 2'],
    },
    rules: [
      'שער מבנק ישראל ביום החשבונית',
      'הפרש שער בעת תשלום → רווח/הפסד מטבע',
    ],
  },

  {
    code: 'DIFFERENT_DATES',
    title: 'תאריך אסמכתא ≠ תאריך ערך',
    icon: Calendar,
    status: 'auto',
    oneLiner: 'חשבונית מתקופה קודמת שנרשמת מאוחר יותר.',
    description:
      'חשבונית מ-31/12 שמגיעה ב-15/1 של השנה הבאה. פורמט 180 תומך ב-2 שדות תאריך: אסמכתא (מתי החשבונית הופקה) וערך (מתי נכנסה למערכת). זה משפיע על תקופת המע"מ.',
    triggers: ['value_date שונה מ-document date'],
    jeStructure: 'זהה ל-STANDARD, אבל 2 תאריכים נפרדים בקובץ MOVEIN.',
    example: {
      description: 'חשבונית מ-31/12/2025 שנרשמה ב-2026',
      invoice: { number: '999', supplier: 'X', subtotal: 100, total: 118, extras: { 'תאריך אסמכתא': '31/12/2025', 'תאריך ערך': '01/01/2026' } },
      je: [
        { account: '502-0', side: 'DR', amount: '100.00', label: 'הוצאה (לתקופת 12/2025)' },
        { account: '205-2', side: 'DR', amount: '18.00', label: 'מע"מ' },
        { account: '200xxx', side: 'CR', amount: '118.00', label: 'ספק' },
      ],
    },
    rules: ['תאריך ערך נשמר בנפרד בפורמט 180 (שדה 20-25)'],
  },

  {
    code: 'WITH_DISCOUNT',
    title: 'חשבונית עם הנחה מסחרית',
    icon: Tag,
    status: 'auto',
    oneLiner: 'הנחה כבר מקופלת בסכומים — אותו טיפול כמו STANDARD.',
    description:
      'הנחה מסחרית (לעומת הנחה פיננסית) — מופחתת ישירות מסכום החשבונית. אין שורת JE נפרדת — הסכומים שמופיעים בחשבונית כבר אחרי ההנחה.',
    triggers: ['discount_amount קיים בtotals'],
    jeStructure: 'אותו 3-line כמו STANDARD.',
    example: {
      description: 'חשבונית 1000 ₪ עם 10% הנחה (100 ₪) → סך 900 + מע"מ',
      invoice: { number: '500', supplier: 'X', subtotal: 900, total: 1062, extras: { 'הנחה': '100 ₪' } },
      je: [
        { account: '502-0', side: 'DR', amount: '900.00', label: 'הוצאה (אחרי הנחה)' },
        { account: '205-2', side: 'DR', amount: '162.00', label: 'מע"מ (על המופחת)' },
        { account: '200xxx', side: 'CR', amount: '1062.00', label: 'ספק' },
      ],
    },
    rules: ['ההנחה כבר מוטמעת ב-subtotal — אין שורה נפרדת'],
  },

  {
    code: 'AGGREGATOR',
    title: 'חשבונית מאגרגטור',
    icon: Building,
    status: 'auto',
    oneLiner: 'חשבונית מ-Zoom/AWS/Google Cloud — אותו טיפול כמו STANDARD.',
    description:
      'אגרגטור הוא ספק שמרכז שירותים של ספקי-משנה רבים (AWS = שירות הוסטינג שמכיל אלפי שירותים). מבחינה חשבונאית — זה ספק אחד.',
    triggers: ['ספק במאסטר מסומן as aggregator (אופציונלי)'],
    jeStructure: 'זהה ל-STANDARD.',
    example: {
      description: 'חשבונית AWS חודשית',
      invoice: { number: 'AWS-202602', supplier: 'Amazon Web Services', subtotal: 500, total: 590 },
      je: [
        { account: '510-0', side: 'DR', amount: '500.00', label: 'הוצאה — שירותי ענן' },
        { account: '205-2', side: 'DR', amount: '90.00', label: 'מע"מ' },
        { account: '200xxx', side: 'CR', amount: '590.00', label: 'AWS (ספק)' },
      ],
    },
    rules: ['אין הבדל פונקציונלי מ-STANDARD'],
  },

  {
    code: 'MISSING_ALLOCATION',
    title: 'חסר מספר הקצאה (חוסם ייצוא)',
    icon: AlertTriangle,
    status: 'auto-with-warning',
    oneLiner: 'חשבונית מעל הרף ללא מספר הקצאה — JE נבנה אבל הייצוא חסום.',
    description:
      'חוק 2024+ מחייב מספר הקצאה לחשבוניות מעל הרף. חשבונית כזו ללא הקצאה — תשומותיה נפסלות. המערכת יוצרת את ה-JE כדי שיהיה ניתן לערוך ולהוסיף הקצאה, אבל לא מאפשרת ייצוא.',
    triggers: ['subtotal > רף ההקצאה ל-date', 'allocation_number חסר'],
    jeStructure: 'זהה ל-STANDARD, אבל JE מסומן עם warning שחוסם ייצוא.',
    example: {
      description: 'חשבונית 30K ב-2026 — חייבת הקצאה',
      invoice: { number: '777', supplier: 'X', subtotal: 30000, total: 35400 },
      je: [
        { account: '502-0', side: 'DR', amount: '30000.00', label: 'הוצאה' },
        { account: '205-2', side: 'DR', amount: '5400.00', label: 'מע"מ' },
        { account: '200xxx', side: 'CR', amount: '35400.00', label: 'ספק' },
      ],
      notes: ['JE מסומן בdraft — לא ניתן לייצא ל-MOVEIN.DAT עד שיוסף מספר הקצאה'],
    },
    rules: [
      'הייצוא חסום עד שיוסף מספר הקצאה',
      'אזהרה ויזואלית בעורך ה-JE',
    ],
  },

  {
    code: 'BANK_TRANSACTION',
    title: 'תנועת בנק ישירה',
    icon: Banknote,
    status: 'coming-soon',
    oneLiner: 'תשלום/קבלה ישירות בבנק — לא קשור לחשבונית ספק.',
    description:
      'עמלות בנק, ריבית, העברות פנימיות, משכורות. לא חשבונית ספק — תנועה בנקאית טהורה. תזוהה אוטומטית מחיבור Open Banking.',
    triggers: ['תנועה ב-bank_transactions לא משויכת לחשבונית'],
    jeStructure: 'משתנה לפי סוג התנועה. עמלה: DR הוצאות בנק / CR בנק. ריבית: DR בנק / CR הכנסות מימון.',
    example: {
      description: 'עמלת ניהול חשבון 25 ₪',
      invoice: { number: '—', supplier: 'בנק', subtotal: 25, total: 25 },
      je: [
        { account: '522-0', side: 'DR', amount: '25.00', label: 'עמלות בנק' },
        { account: '121-0', side: 'CR', amount: '25.00', label: 'בנק הפועלים' },
      ],
      notes: ['יבוא מ-Open Banking ישלוף תנועות אוטומטית — Phase 2'],
    },
    rules: ['בקרוב: חיבור Open Banking לבנקים ישראליים'],
    perCompanyOverrides: [
      'חשבונות בנק פעילים (פר-חברה, יכול להיות יותר מאחד)',
      'חשבונות הוצאות בנק (פר-חברה)',
    ],
  },
];
