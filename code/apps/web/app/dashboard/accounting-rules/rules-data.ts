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
  FileText,
  User,
  Clock,
  ShoppingCart,
  CreditCard,
  HandCoins,
  Plane,
  ShieldOff,
  Coins,
  Wallet2,
  XCircle,
  Users as UsersIcon,
  Briefcase,
  Truck,
  Package,
  Calculator,
  ClipboardList,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Lock,
  PiggyBank,
  CircleDollarSign,
} from 'lucide-react';

export type RuleStatus = 'auto' | 'auto-with-warning' | 'manual' | 'coming-soon';

export type RuleCategory =
  | 'supplier'   // צד ספקים (AP)
  | 'customer'   // צד לקוחות (AR)
  | 'bank'       // בנק / אשראי / מזומן
  | 'payroll'    // משכורות
  | 'assets'     // נכסי קבע ופחת
  | 'inventory'  // מלאי
  | 'period'     // התאמות סוף תקופה
  | 'year-end';  // סגירת שנה

export const CATEGORY_LABELS: Record<RuleCategory, string> = {
  supplier: 'צד הספקים (AP)',
  customer: 'צד הלקוחות (AR)',
  bank: 'בנק · אשראי · מזומן',
  payroll: 'משכורות',
  assets: 'נכסי קבע ופחת',
  inventory: 'מלאי',
  period: 'התאמות סוף תקופה',
  'year-end': 'סגירת שנה',
};

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
  /** Sequential serial number for citation. Assigned automatically at module
   * load time based on position in the RULES_RAW list. */
  id: number;
  code: string;
  title: string;
  icon: LucideIcon;
  status: RuleStatus;
  category: RuleCategory;
  oneLiner: string;
  description: string;
  triggers: string[];
  jeStructure: string;
  example: ExampleSpec;
  rules: string[];
  perCompanyOverrides?: string[];
}

/**
 * Raw rule list — IDs assigned automatically below. Order matters: the
 * sequential ID (1..N) is the citation number used in audit logs and
 * improvement-note references.
 */
const RULES_RAW: Omit<AccountingRule, 'id'>[] = [
  {
    code: 'STANDARD',
    title: 'חשבונית ספק רגילה',
    icon: Receipt,
    status: 'auto',
    category: 'supplier',
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
    category: 'supplier',
    oneLiner: 'חוק 2024+: חשבוניות מעל הרף חייבות מספר הקצאה ייחודי מרשות המסים.',
    description:
      'מספר הקצאה הוא מזהה שמופק על ידי רשות המסים לחשבוניות גבוהות (חוק 2024+). חשבונית מעל הרף ללא הקצאה — תשומותיה נפסלות. הרף: 25,000 ₪ ב-2024, ~20,000 ₪ מ-2025.',
    triggers: ['allocation_number קיים בחשבונית'],
    jeStructure: 'זהה ל-STANDARD. מספר ההקצאה נשמר בשדה הפרטים (פורמט 180) או בשדה ייעודי (פורמט FLEXIBLE — אוטומטי כשההקצאה > 5 תווים).',
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
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
    oneLiner: 'חשבונית ששייכת לפרויקט / מחלקה — תוייגת לדוחות פנימיים.',
    description:
      'מרכז עלות הוא תיוג שמאפשר חיתוך פנימי: לראות כמה הוצאה לכל פרויקט, מחלקה, או יוזמה. דורש פורמט FLEXIBLE כי 180 לא תומך בשדה הזה.',
    triggers: ['costCenter מוגדר בקונטקסט'],
    jeStructure: 'זהה ל-STANDARD מבחינת חשבונות, אבל הייצוא עובר אוטומטית לפורמט FLEXIBLE (movein.doc + movein.prm בתוך zip). כל שורה מקבלת תיוג מרכז עלות.',
    example: {
      description: 'חשבונית וירטהיים שייכת לפרויקט "PROJ-A"',
      invoice: { number: '4427930', supplier: 'וירטהיים', subtotal: 484.78, total: 572, extras: { 'מרכז עלות': 'PROJ-A' } },
      je: [
        { account: '502-0', side: 'DR', amount: '484.78', label: 'הוצאה [PROJ-A]' },
        { account: '205-2', side: 'DR', amount: '87.22', label: 'מע"מ תשומות' },
        { account: '200087', side: 'CR', amount: '572.00', label: 'ספק' },
      ],
    },
    rules: [
      'מערכת הייצוא עוברת אוטומטית ל-FLEXIBLE כשמרכז עלות מופיע בחשבונית',
      'בקרוב: ניהול רשימת מרכזי עלות פר-חברה',
    ],
    perCompanyOverrides: [
      'רשימת מרכזי עלות (פרויקטים, מחלקות) — בקרוב',
      'מרכז עלות ברירת מחדל — בקרוב',
    ],
  },

  {
    code: 'MIXED_DEDUCTION',
    title: 'מע"מ מעורב — קיזוז חלקי',
    icon: Percent,
    status: 'auto-with-warning',
    category: 'supplier',
    oneLiner: '12 קטגוריות עם שיעור קיזוז שונה — רכב, נייד, מתנות, ארוחות, חו"ל.',
    description:
      'חוק המס הישראלי מאפשר ניכוי חלקי של מע"מ בקטגוריות שונות, עם שיעורים קבועים. המערכת תומכת ב-12 קטגוריות שמכסות את רוב מקרי השימוש בחברה בע"מ.',
    triggers: ['mixedDeductionCategory מוגדר על החשבונית'],
    jeStructure:
      'שתי רשומות (חלק מנוכה + חלק לא-מנוכה) ל-rates 0<x<100. רשומה אחת ל-100% (commercial_vehicle, late_meals) או 0% (gifts, foreign_trip).',
    example: {
      description: 'תיקון רכב פרטי 1,180 ₪ — קטגוריה vehicle (2/3 מנוכה)',
      invoice: { number: '301', supplier: 'מוסך X', subtotal: 1000, total: 1180, extras: { 'קטגוריה': 'vehicle (2/3)' } },
      je: [
        { account: '502-0', side: 'DR', amount: '666.67', label: 'הוצאה מנוכה (2/3 × 1000)' },
        { account: '502-1', side: 'DR', amount: '393.33', label: 'הוצאה לא מנוכה (1/3 × 1000 + 1/3 × 180)' },
        { account: '205-2', side: 'DR', amount: '120.00', label: 'מע"מ מנוכה (2/3 × 180)' },
        { account: '200xxx', side: 'CR', amount: '1180.00', label: 'ספק' },
      ],
      notes: [
        'שיעורי הניכוי קבועים בחוק (לא ניתן לשינוי פר-חברה)',
        'חשבון "הוצאה לא מנוכה" (502-1) ניתן לשינוי פר-חברה',
      ],
    },
    rules: [
      'רכב פרטי M1: 2/3 מנוכה',
      'רכב מסחרי N1 / טנדר: 100% מנוכה',
      'אופנוע ≤125 סמ"ק: 100% מנוכה',
      'אופנוע >125 סמ"ק: 2/3 מנוכה',
      'נייד עסקי בלבד: 100% / מעורב רוב עסקי: 2/3 / רוב פרטי: 1/3',
      'ארוחות אש"ל רגילות: 1/4 מנוכה',
      'ארוחות לאחר 8 שעות (סוף יום): 100% מנוכה',
      'מתנות מעל הרף (~210₪/שנה לעובד): 0%',
      'נסיעות עסקיות חו"ל: 0% (מע"מ זר)',
    ],
    perCompanyOverrides: ['חשבון "הוצאה לא מנוכה" (502-1 ברירת מחדל)'],
  },

  {
    code: 'FOREIGN_CURRENCY',
    title: 'חשבונית במטבע חוץ',
    icon: Globe,
    status: 'auto-with-warning',
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
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
    category: 'supplier',
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

  /* ────────────── תרחישי ספק נוספים ────────────── */

  {
    code: 'SELF_INVOICE',
    title: 'חשבונית עצמית (ייבוא שירות זר)',
    icon: Globe,
    status: 'auto-with-warning',
    category: 'supplier',
    oneLiner: 'שירות מספק זר עם מע"מ ישראלי — חיוב מע"מ עצמי משני הצדדים.',
    description:
      'כשעסק ישראלי קונה שירות מספק זר (Google Ads, AWS, יועצים מחו"ל) הוא חייב לדווח על מע"מ הן כתשומות והן כעסקאות — מע"מ עצמי. השפעה נטו על המס: 0, אבל הדיווח חובה ב-PCN874.',
    triggers: ['is_self_invoice = true'],
    jeStructure: '4 שורות (DR הוצאה + DR מע"מ תשומות + CR מע"מ עסקאות + CR ספק זר). נכנס בפורמט 180.',
    example: {
      description: 'חשבונית AWS חודשית 1000$ — מע"מ עצמי 18%',
      invoice: { number: 'AWS-202602', supplier: 'Amazon Web Services', subtotal: 1000, total: 1180, extras: { 'מטבע': 'USD', 'חשבונית עצמית': 'כן' } },
      je: [
        { account: '510-0', side: 'DR', amount: '1000.00', label: 'הוצאה — שירותי ענן' },
        { account: '205-2', side: 'DR', amount: '180.00', label: 'מע"מ תשומות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות (התחייבות)' },
        { account: '200xxx', side: 'CR', amount: '1000.00', label: 'AWS (ספק זר — בלי מע"מ)' },
      ],
      notes: [
        'נטו על המס: אפס (180 שקל תשומות מקזזים את 180 עסקאות)',
        'חובה לכלול ב-PCN874 הן בעסקאות והן בתשומות',
      ],
    },
    rules: [
      'מנגנון "הפיכת חיוב" — Reverse Charge VAT',
      'חל על שירותים בלבד (לא על מוצרים שיובאו דרך מכס)',
      'חובה לאמת שהספק לא רשום כעוסק בישראל',
    ],
    perCompanyOverrides: [
      'חשבון מע"מ עסקאות (220-0 ברירת מחדל)',
    ],
  },

  {
    code: 'PRIVATE_SUPPLIER',
    title: 'ספק פרטי (יחיד בלי ע.מ)',
    icon: User,
    status: 'auto-with-warning',
    category: 'supplier',
    oneLiner: 'תשלום ליחיד שאינו עוסק רשום — אין מע"מ + ניכוי במקור 30%.',
    description:
      'תשלום ליחיד פרטי שאין לו ע.מ (בעל מקצוע חופשי לא רשום, אומן, פרילנסר) אינו מאפשר ניכוי מע"מ תשומות. בנוסף, חובה לנכות במקור 30% (47% למי שלא הצהיר).',
    triggers: ['is_private_supplier = true', 'תוקף: tax_id היא ת.ז במקום ע.מ'],
    jeStructure: '3 שורות בלי מע"מ. ניכוי במקור 30% ברירת מחדל.',
    example: {
      description: 'תשלום לפרילנסר עיצוב — 1000 ₪',
      invoice: { number: 'FREE-001', supplier: 'דני כהן', subtotal: 1000, total: 1000, extras: { 'ת.ז': '023456789' } },
      je: [
        { account: '504-0', side: 'DR', amount: '1000.00', label: 'שירותים מקצועיים' },
        { account: '200xxx', side: 'CR', amount: '700.00', label: 'דני כהן (אחרי ניכוי)' },
        { account: '175-0', side: 'CR', amount: '300.00', label: 'רשות המסים — ניכוי 30%' },
      ],
      notes: [
        'אין מע"מ — יחיד פרטי לא יכול להוציא חשבונית מס',
        'במקום זה — קבלה. רישום הוצאה בכרטסת רגיל.',
        'הניכוי משולם לרשות המסים בטופס 102',
      ],
    },
    rules: [
      'ברירת מחדל: 30% ניכוי במקור (אם לא הצהיר אחרת)',
      'אם יש לו אישור מס (פטור / 5%) — ניתן להזין ידנית',
      'דרוש דיווח שנתי 856 — ניכויים מבעלי מקצוע',
    ],
    perCompanyOverrides: [
      'אחוז ברירת מחדל לניכוי במקור (30 / 47)',
    ],
  },

  {
    code: 'PREPAID',
    title: 'הוצאה לתקופות (Prepaid)',
    icon: Clock,
    status: 'auto-with-warning',
    category: 'supplier',
    oneLiner: 'הוצאה ששולמה מראש ותוכר על פני מספר חודשים.',
    description:
      'ביטוח שנתי, שכירות שנתית, רישיון תוכנה — תשלום חד-פעמי שאמור להיות מוכר כהוצאה על פני התקופה. JE ראשוני זוקף ל"הוצאות מראש" (נכס), והכרה חודשית מועברת להוצאה.',
    triggers: ['prepaid_period_months > 1'],
    jeStructure: 'JE ראשוני (DR הוצאות מראש + DR מע"מ + CR ספק). JE הכרה חודשית ייווצרו אוטומטית — בקרוב.',
    example: {
      description: 'ביטוח שנתי 12,000 ₪ + מע"מ',
      invoice: { number: 'INS-2026', supplier: 'מנורה ביטוח', subtotal: 12000, total: 14160, extras: { 'תקופה': '12 חודשים' } },
      je: [
        { account: '102-0', side: 'DR', amount: '12000.00', label: 'הוצאות מראש (נכס)' },
        { account: '205-2', side: 'DR', amount: '2160.00', label: 'מע"מ תשומות' },
        { account: '200xxx', side: 'CR', amount: '14160.00', label: 'מנורה ביטוח' },
      ],
      notes: [
        'הכרה חודשית: 1,000 ₪ (12,000/12)',
        'JE חודשי: DR 502-0 הוצאת ביטוח 1,000 / CR 102-0 הוצאות מראש 1,000',
        'אוטומציה של הכרה חודשית — Phase 4',
      ],
    },
    rules: [
      'מע"מ תשומות מנוכה במלואו ב-JE הראשוני (לפי תאריך החשבונית)',
      'הכרה לינארית בלבד — לא יחסית לימים',
    ],
    perCompanyOverrides: [
      'חשבון "הוצאות מראש" (102-0 ברירת מחדל)',
    ],
  },

  /* ────────────── צד הלקוחות (AR) ────────────── */

  {
    code: 'AR_STANDARD',
    title: 'חשבונית מס ללקוח (B2B)',
    icon: FileText,
    status: 'auto',
    category: 'customer',
    oneLiner: 'חשבונית מס ללקוח עסקי — תשלום ייכנס בעתיד.',
    description:
      'חשבונית מס סטנדרטית ללקוח עסקי (חברה / עוסק מורשה). הלקוח רושם את החשבונית כתשומות; אצלך — הכנסה + מע"מ עסקאות, יתרת חוב פתוחה אצל הלקוח.',
    triggers: ['document_type = tax_invoice', 'אין דגל payment_method מיידי'],
    jeStructure: '3 שורות סטנדרטיות. אסמכתא = מספר החשבונית.',
    example: {
      description: 'חשבונית 1000 ₪ + מע"מ ללקוח',
      invoice: { number: 'INV-1001', supplier: 'לקוח: שיווק והפצה בע"מ', subtotal: 1000, total: 1180 },
      je: [
        { account: '120-1', side: 'DR', amount: '1180.00', label: 'לקוח — שיווק והפצה' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות ממכירות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות' },
      ],
    },
    rules: [
      'הכנסה מוכרת בעת הוצאת החשבונית (מצטבר / נצבר)',
      'מע"מ עסקאות = 18% × subtotal',
      'אסמכתא רץ פר-חברה — בקרוב',
    ],
    perCompanyOverrides: [
      'חשבון הכנסות ברירת מחדל (700-0)',
      'חשבון מע"מ עסקאות (220-0)',
    ],
  },

  {
    code: 'AR_INVOICE_RECEIPT',
    title: 'חשבונית מס-קבלה',
    icon: HandCoins,
    status: 'auto',
    category: 'customer',
    oneLiner: 'חשבונית + תשלום באותו מסמך — אין יתרת לקוח.',
    description:
      'מסמך משולב המחבר בין חשבונית מס לקבלה. משמש כשהלקוח משלם מיידית — מזומן, אשראי, או העברה בנקאית. במקום DR לקוח, ה-DR הולך ישירות לחשבון התשלום.',
    triggers: ['document_type = invoice_receipt', 'payment_method מוגדר'],
    jeStructure: '3 שורות. DR בנק/קופה/אשראי במקום DR לקוח.',
    example: {
      description: 'מכירה במזומן 1180 ₪',
      invoice: { number: 'INVRCP-501', supplier: 'לקוח: רוכש מזדמן', subtotal: 1000, total: 1180 },
      je: [
        { account: '100-0', side: 'DR', amount: '1180.00', label: 'קופה' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות' },
      ],
    },
    rules: [
      'אין יתרת לקוח — לא נדרש מאסטר לקוחות',
      'בחירת חשבון התשלום אוטומטית לפי payment_method',
    ],
  },

  {
    code: 'AR_PROFORMA',
    title: 'חשבונית עסקה (Proforma)',
    icon: ClipboardList,
    status: 'auto',
    category: 'customer',
    oneLiner: 'הצעת מחיר רשמית — אינה משחררת מע"מ ולא מכירה הכנסה.',
    description:
      'חשבונית עסקה היא הצעת מחיר/הזמנה רשמית. אינה חשבונית מס — אינה משחררת מע"מ עסקאות, ולא מכירה הכנסה. הסכום נרשם כיתרה במקדמות עד שתופק חשבונית מס.',
    triggers: ['document_type = proforma'],
    jeStructure: '2 שורות: DR לקוח / CR מקדמות (התחייבות).',
    example: {
      description: 'הצעת מחיר ל-לקוח 5000 ₪',
      invoice: { number: 'QUOTE-201', supplier: 'לקוח: חברת בנייה', subtotal: 5000, total: 5900 },
      je: [
        { account: '120-1', side: 'DR', amount: '5900.00', label: 'לקוח (יתרה)' },
        { account: '230-1', side: 'CR', amount: '5900.00', label: 'מקדמות מלקוחות' },
      ],
      notes: [
        'אין הכרה בהכנסה ולא במע"מ עסקאות',
        'בעת הוצאת חשבונית מס — JE העברה ממקדמות להכנסות',
      ],
    },
    rules: [
      'אינה ממוספרת ברצף החשבוניות הרשמי',
      'לא נכללת ב-PCN874',
    ],
  },

  {
    code: 'AR_RECEIPT',
    title: 'קבלה (תשלום על חשבונית קיימת)',
    icon: Receipt,
    status: 'auto',
    category: 'customer',
    oneLiner: 'תקבול מלקוח — סוגר יתרה פתוחה, לא מכיר הכנסה.',
    description:
      'קבלה מתעדת תשלום על חשבונית מס שהוצאה לפני. שורת ה-DR נכנסת לבנק/קופה, שורת ה-CR סוגרת את יתרת הלקוח.',
    triggers: ['document_type = receipt'],
    jeStructure: '2 שורות: DR בנק/קופה / CR לקוח.',
    example: {
      description: 'תקבול 1180 ₪ מלקוח על חשבונית INV-1001',
      invoice: { number: 'RCPT-301', supplier: 'לקוח: שיווק והפצה', subtotal: 1180, total: 1180 },
      je: [
        { account: '121-0', side: 'DR', amount: '1180.00', label: 'בנק' },
        { account: '120-1', side: 'CR', amount: '1180.00', label: 'לקוח (סגירת יתרה)' },
      ],
    },
    rules: [
      'אינה מכירה הכנסה — ההכנסה הוכרה בחשבונית המקור',
      'אינה כוללת מע"מ — המע"מ הוכר בחשבונית המקור',
    ],
  },

  {
    code: 'AR_CREDIT_NOTE',
    title: 'זיכוי לקוח',
    icon: RotateCcw,
    status: 'auto',
    category: 'customer',
    oneLiner: 'ביטול חשבונית מכירה — מהפך כיווני חובה/זכות.',
    description:
      'כשמתבטלת חשבונית מס שהוצאת ללקוח (החזר מוצר, ביטול שירות), JE נוצר ככיוון הפוך: חובה להכנסות + מע"מ, זכות ללקוח.',
    triggers: ['document_type = credit_note'],
    jeStructure: '3 שורות עם DR/CR הפוכים מ-AR_STANDARD.',
    example: {
      description: 'זיכוי על חשבונית INV-1001',
      invoice: { number: 'CN-1001', supplier: 'לקוח: שיווק והפצה', subtotal: 1000, total: 1180 },
      je: [
        { account: '700-0', side: 'DR', amount: '1000.00', label: 'הכנסות (מתבטלות)' },
        { account: '220-0', side: 'DR', amount: '180.00', label: 'מע"מ עסקאות (מתבטל)' },
        { account: '120-1', side: 'CR', amount: '1180.00', label: 'לקוח (החזר חוב)' },
      ],
    },
    rules: [
      'מקטין מע"מ עסקאות בדיווח 874 הבא',
      'יש להפנות למספר החשבונית המקורית בפרטים',
    ],
  },

  {
    code: 'AR_CASH_SALE',
    title: 'מכירה במזומן',
    icon: Coins,
    status: 'auto',
    category: 'customer',
    oneLiner: 'תשלום במזומן בקופה — DR לקופה.',
    description:
      'עסקה קמעונאית במזומן. אין מאסטר לקוחות, התשלום נכנס לקופה.',
    triggers: ['payment_method = cash'],
    jeStructure: '3 שורות: DR קופה / CR הכנסות + מע"מ.',
    example: {
      description: 'מכירה קמעונאית 590 ₪',
      invoice: { number: 'CASH-001', supplier: 'לקוח: רוכש מזדמן', subtotal: 500, total: 590 },
      je: [
        { account: '100-0', side: 'DR', amount: '590.00', label: 'קופה' },
        { account: '700-0', side: 'CR', amount: '500.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '90.00', label: 'מע"מ עסקאות' },
      ],
    },
    rules: ['מומלץ הפקדה לבנק תוך 7 ימים — להיפרד דרך תנועות בנק'],
  },

  {
    code: 'AR_CARD_SALE',
    title: 'מכירה באשראי',
    icon: CreditCard,
    status: 'auto',
    category: 'customer',
    oneLiner: 'תשלום בכרטיס אשראי — DR לסולק עד סליקה לבנק.',
    description:
      'עסקה בכרטיס אשראי דרך סולק (CardCom / Tranzila / Cal). הסכום מוחזק אצל הסולק עד שמועבר לבנק (יומיים-שבעה ימים), פחות עמלה.',
    triggers: ['payment_method = card'],
    jeStructure: '3 שורות. JE התחשבנות עם הסולק יווצר עם הכניסה לבנק.',
    example: {
      description: 'מכירה באשראי 1180 ₪',
      invoice: { number: 'CARD-101', supplier: 'לקוח: רוכש מזדמן', subtotal: 1000, total: 1180 },
      je: [
        { account: '125-0', side: 'DR', amount: '1180.00', label: 'סולק אשראי' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות' },
      ],
      notes: [
        'JE התחשבנות: DR בנק (1180-עמלה) + DR עמלת סולק / CR סולק (1180)',
        'אוטומציה של JE התחשבנות — בקרוב',
      ],
    },
    rules: [
      'עמלת סולק ~1.5-3% — מוכרת כהוצאה',
    ],
    perCompanyOverrides: [
      'חשבון סולק (125-0 ברירת מחדל)',
      'חשבון עמלות סולק (522-1)',
    ],
  },

  {
    code: 'AR_POSTDATED_CHECK',
    title: 'צ\'ק דחוי',
    icon: Wallet2,
    status: 'auto',
    category: 'customer',
    oneLiner: 'צ\'ק לפירעון עתידי — DR לחשבון "צ\'קים לגבייה".',
    description:
      'הלקוח שילם בצ\'ק עם תאריך עתידי. הצ\'ק נכנס ליתרת "צ\'קים לגבייה" עד תאריך הפירעון, שאז JE נוסף מעביר ל-בנק.',
    triggers: ['payment_method = check_postdated'],
    jeStructure: '3 שורות. JE פירעון נפרד יווצר בתאריך הצ\'ק.',
    example: {
      description: 'מכירה בצ\'ק דחוי 1180 ₪ ל-30/03',
      invoice: { number: 'INV-1015', supplier: 'לקוח עסקי', subtotal: 1000, total: 1180, extras: { 'תאריך פירעון': '30/03/2026' } },
      je: [
        { account: '122-0', side: 'DR', amount: '1180.00', label: 'צ\'קים לגבייה' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות' },
      ],
      notes: [
        'בתאריך הפירעון: DR 121-0 בנק / CR 122-0 צ\'קים לגבייה',
        'אם הצ\'ק חוזר: JE היפוך + עמלת חזר',
      ],
    },
    rules: ['חישוב מע"מ לפי תאריך החשבונית, לא תאריך הצ\'ק'],
    perCompanyOverrides: ['חשבון צ\'קים לגבייה (122-0)'],
  },

  {
    code: 'AR_INSTALLMENTS',
    title: 'תשלומים (3, 6, 12)',
    icon: Layers,
    status: 'auto',
    category: 'customer',
    oneLiner: 'חשבונית אחת + לוח קבלות — הכנסה מוכרת מיד.',
    description:
      'חשבונית מס יחידה עם תשלום חודשי. ההכנסה והמע"מ מוכרים במלואם בעת הוצאת החשבונית; קבלות חודשיות סוגרות את היתרה בהדרגה.',
    triggers: ['installments_count >= 2'],
    jeStructure: 'JE ראשוני זהה ל-AR_STANDARD. קבלות חודשיות ייווצרו אוטומטית — בקרוב.',
    example: {
      description: 'מכירה ב-3 תשלומים: 3540 ₪',
      invoice: { number: 'INV-2030', supplier: 'לקוח: עסק קטן', subtotal: 3000, total: 3540, extras: { 'תשלומים': '3' } },
      je: [
        { account: '120-1', side: 'DR', amount: '3540.00', label: 'לקוח (כלל החוב)' },
        { account: '700-0', side: 'CR', amount: '3000.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '540.00', label: 'מע"מ עסקאות' },
      ],
      notes: [
        'תשלום חודשי: 1180 ₪',
        'כל קבלה: DR בנק / CR לקוח 1180 ₪',
      ],
    },
    rules: ['ההכנסה והמע"מ מוכרים במלואם בעת הוצאת החשבונית, לא בכל תשלום'],
  },

  {
    code: 'AR_EXPORT',
    title: 'ייצוא (0% מע"מ)',
    icon: Plane,
    status: 'auto-with-warning',
    category: 'customer',
    oneLiner: 'מכירה ללקוח זר — מע"מ 0%, חובה דיווח נפרד.',
    description:
      'מכירת מוצרים או שירותים ללקוח זר (חוץ לישראל). שיעור מע"מ 0% — כלומר אין שורת מע"מ עסקאות, אבל המכירה מדווחת ב-PCN874 בשדה ייעודי לעסקאות 0%.',
    triggers: ['export_country מוגדר'],
    jeStructure: '2 שורות: DR לקוח / CR הכנסות (אין מע"מ).',
    example: {
      description: 'יצוא תוכנה ל-USA — 1000$',
      invoice: { number: 'EXP-501', supplier: 'לקוח: ACME Inc.', subtotal: 1000, total: 1000, extras: { 'יעד': 'USA', 'מטבע': 'USD' } },
      je: [
        { account: '120-1', side: 'DR', amount: '1000.00', label: 'לקוח זר' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות מייצוא' },
      ],
      notes: [
        'דיווח ב-PCN874 בשדה "עסקאות בשיעור 0%"',
        'דרושים מסמכי ייצוא (חשבונית הייצוא, רשימון מכס)',
        'אם משלם במט"ח — תרחיש AR_FOREIGN_CURRENCY חל גם',
      ],
    },
    rules: [
      'דרוש מסמך מסמיך לפטור (רשימון יצוא או "יצוא של שירות")',
      'אישור 0% מותנה בהצגת המסמכים בעת הביקורת',
    ],
  },

  {
    code: 'AR_VAT_EXEMPT',
    title: 'מכירה לפטור מע"מ',
    icon: ShieldOff,
    status: 'auto-with-warning',
    category: 'customer',
    oneLiner: 'אילת, תיירים, או מוצרים פטורים — אין מע"מ.',
    description:
      'מכירות בפטור ממע"מ: אילת (אזור פטור), מכירה לתייר עם אישור, מוצרים מסוימים (פירות וירקות בקופה רושמת בלבד), שירותי בריאות מסוימים. מדווח ב-PCN874 כעסקה פטורה.',
    triggers: ['vat_exempt_reason מוגדר'],
    jeStructure: '2 שורות: DR לקוח/קופה / CR הכנסות (אין מע"מ).',
    example: {
      description: 'מכירה בעיר אילת 500 ₪',
      invoice: { number: 'EILAT-101', supplier: 'לקוח באילת', subtotal: 500, total: 500, extras: { 'סיבת פטור': 'אילת' } },
      je: [
        { account: '100-0', side: 'DR', amount: '500.00', label: 'קופה' },
        { account: '700-0', side: 'CR', amount: '500.00', label: 'הכנסות פטורות' },
      ],
    },
    rules: [
      'הכנסות פטורות מסומנות בנפרד בכרטסת',
      'דרוש מסמך מסמיך (תעודת תייר, מיקום אילת)',
    ],
  },

  {
    code: 'AR_FOREIGN_CURRENCY',
    title: 'מכירה במט"ח',
    icon: Globe,
    status: 'auto-with-warning',
    category: 'customer',
    oneLiner: 'חשבונית במטבע זר — נרשמת ב-₪ לפי שער יומי.',
    description:
      'מכירה ב-USD/EUR/GBP. הסכומים נרשמים כפול: ב-₪ (לפי שער יומי של בנק ישראל) ובמטבע המקור. הפרשי שער בעת הגבייה מהווים רווח/הפסד מטבע.',
    triggers: ['currency != ILS'],
    jeStructure: 'אותו מבנה כמו AR_STANDARD, אבל פורמט 180 כולל גם שדות מט"ח (131-178).',
    example: {
      description: 'מכירה 100$ × שער 3.7',
      invoice: { number: 'INV-300', supplier: 'לקוח זר', subtotal: 100, total: 118, extras: { 'מטבע': 'USD', 'שער': '3.70' } },
      je: [
        { account: '120-1', side: 'DR', amount: '436.60 ₪ (118$)', label: 'לקוח (₪ + מט"ח)' },
        { account: '700-0', side: 'CR', amount: '370.00 ₪ (100$)', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '66.60 ₪ (18$)', label: 'מע"מ עסקאות' },
      ],
      notes: ['שערי בנק ישראל יומיים — אוטומטיים מ-Phase 5ה'],
    },
    rules: ['שער מבנק ישראל ביום החשבונית', 'הפרש שער בגבייה → רווח/הפסד מטבע'],
  },

  {
    code: 'AR_WITH_WITHHOLDING',
    title: 'ניכוי במקור מהלקוח',
    icon: Percent,
    status: 'auto-with-warning',
    category: 'customer',
    oneLiner: 'הלקוח (B2G) מנכה ממך — תקבל פחות, רשות המסים תחזיר בשומה.',
    description:
      'לקוח גדול (משרד ממשלתי, רשות מקומית, חברה ציבורית) מנכה אחוז במקור מתוך החשבונית שלך. הלקוח מעביר את הניכוי לרשות המסים; אתה זכאי להחזר בשומה השנתית.',
    triggers: ['customer_withholding_percent > 0'],
    jeStructure: '4 שורות. נכס "ניכוי בידי לקוח" נפרד מ-לקוח רגיל.',
    example: {
      description: 'חשבונית למשרד ממשלתי, ניכוי 5%',
      invoice: { number: 'GOV-101', supplier: 'לקוח: משרד הביטחון', subtotal: 1000, total: 1180 },
      je: [
        { account: '120-1', side: 'DR', amount: '1130.00', label: 'לקוח (אחרי ניכוי)' },
        { account: '175-1', side: 'DR', amount: '50.00', label: 'ניכוי בידי לקוח (נכס)' },
        { account: '700-0', side: 'CR', amount: '1000.00', label: 'הכנסות' },
        { account: '220-0', side: 'CR', amount: '180.00', label: 'מע"מ עסקאות' },
      ],
      notes: ['הניכוי יוחזר משלטונות המס בשומה השנתית', 'דרוש אישור ניכוי 856 מהלקוח'],
    },
    rules: ['חשוב: הניכוי על subtotal (לא על total)', 'נדרש לעקוב אחרי כלל הלקוחות שמנכים'],
    perCompanyOverrides: ['חשבון "ניכוי בידי לקוח" (175-1)'],
  },

  {
    code: 'AR_ADVANCE',
    title: 'מקדמה מלקוח',
    icon: PiggyBank,
    status: 'auto',
    category: 'customer',
    oneLiner: 'תקבול לפני הוצאת חשבונית — אינו הכנסה עדיין.',
    description:
      'הלקוח שילם מקדמה לפני הוצאת חשבונית מס. הסכום נכנס לבנק, אבל אינו הכנסה עד שתוצא חשבונית מס שתסגור את המקדמה.',
    triggers: ['תקבול בלי חשבונית מס מקושרת'],
    jeStructure: '2 שורות: DR בנק / CR מקדמות (התחייבות).',
    example: {
      description: 'מקדמה מלקוח 5900 ₪',
      invoice: { number: 'ADV-101', supplier: 'לקוח: חברת בנייה', subtotal: 5900, total: 5900 },
      je: [
        { account: '121-0', side: 'DR', amount: '5900.00', label: 'בנק' },
        { account: '230-1', side: 'CR', amount: '5900.00', label: 'מקדמות מלקוחות' },
      ],
      notes: ['מע"מ עסקאות יחושב בעת הוצאת חשבונית מס', 'הזיכוי במקדמה מתבצע בעת הוצאת החשבונית'],
    },
    rules: ['מקדמה אינה הכנסה — לא נכלל ב-PCN874'],
  },

  {
    code: 'AR_BAD_DEBT',
    title: 'חוב אבוד + השבת מע"מ (סעיף 39א)',
    icon: XCircle,
    status: 'auto-with-warning',
    category: 'customer',
    oneLiner: 'לקוח שלא משלם — מחיקת היתרה + השבה אוטומטית של מע"מ עסקאות שכבר דווח.',
    description:
      'לפי סעיף 39א לחוק מע"מ, לאחר שחוב הופך לבלתי גביה אפשר להשיב את מע"מ העסקאות שכבר שולם לרשות המסים. ה-JE רושם DR חובות אבודים (הסכום הנקי) + DR מע"מ עסקאות (השבה) / CR לקוח (היתרה המלאה). השבת המע"מ מקטינה את התשלום ב-PCN874 הקרוב.',
    triggers: ['bad_debt_original_invoice מוגדר על חשבונית הזיכוי'],
    jeStructure: '3 שורות (חשבונית עם מע"מ): DR חובות אבודים + DR מע"מ עסקאות / CR לקוח. 2 שורות בלבד אם החשבונית פטורה.',
    example: {
      description: 'מחיקת חוב — חשבונית INV-980, סכום ביניים 1,000 + מע"מ 180',
      invoice: { number: 'BAD-001', supplier: 'לקוח X', subtotal: 1000, total: 1180 },
      je: [
        { account: '530-0', side: 'DR', amount: '1000.00', label: 'חובות אבודים (הוצאה)' },
        { account: '220-0', side: 'DR', amount: '180.00', label: 'השבת מע"מ עסקאות (סעיף 39א)' },
        { account: '120-1', side: 'CR', amount: '1180.00', label: 'לקוח X (סגירת יתרה מלאה)' },
      ],
      notes: [
        'תנאי לזכאות: עד 3 שנים מתאריך החשבונית המקורית',
        'דרושים מסמכי גבייה: דרישה רשמית, פתיחת תיק הוצל"פ, פסק דין',
        'השבת המע"מ נכנסת אוטומטית ב-PCN874 הקרוב — אין צורך בטופס 1294 נפרד',
      ],
    },
    rules: [
      'JE עם 3 שורות אם יש מע"מ; 2 שורות אם פטור / 0%',
      'מחיקה רק אחרי תיעוד ניסיונות גבייה',
      'הזיכוי נכנס אוטומטית ב-874 דרך חשבון מע"מ עסקאות (220-0)',
    ],
    perCompanyOverrides: [
      'חשבון חובות אבודים (530-0 ברירת מחדל)',
      'חשבון מע"מ עסקאות (220-0 ברירת מחדל)',
    ],
  },

  /* ────────────── חובות רגולטוריים — דיווח חודשי ────────────── */

  {
    code: 'PCN874_EXPORT',
    title: 'דיווח PCN874 — מע"מ מקוון',
    icon: FileText,
    status: 'auto-with-warning',
    category: 'period',
    oneLiner: 'הפקת קובץ 874 חודשי לרשות המסים — סך עסקאות מול תשומות.',
    description:
      'בכל חודש (או פעמיים בחודשיים, לפי תקופת הדיווח של החברה) חובה לשדר לרשות המסים את כל פקודות היומן שהשפיעו על מע"מ. המערכת מקבצת את כל החשבוניות (ספקים + לקוחות) של החודש הנבחר, בונה את הקובץ במבנה הרשמי (Windows-1255, רשומות O/S/T/X), ומפיקה אותו להורדה. ההפקה נועלת אוטומטית את התקופה כדי שלא יהיו שינויים בדיעבד.',
    triggers: [
      'דרישה רגולטורית: עד ה-15 לחודש העוקב',
      'הפעלה ידנית מ-/dashboard/c/.../pcn874',
    ],
    jeStructure: 'אינו JE — קובץ דיווח. אבל מסכם את כל ה-JE שכבר נוצרו בתקופה.',
    example: {
      description: 'דיווח 874 לחודש מאי 2026 — 12 חשבוניות מכירה + 8 ספקים',
      invoice: { subtotal: 6859.77, total: 8094.33 },
      je: [
        { account: 'O', side: 'DR', amount: '—', label: 'רשומת כותרת (ע.מ + תקופה)' },
        { account: 'S2', side: 'DR', amount: '6859.77', label: '12 רשומות עסקאות' },
        { account: 'T', side: 'DR', amount: '4383.39', label: '8 רשומות תשומות' },
        { account: 'X', side: 'CR', amount: '441.55', label: 'רשומת סיכום (לתשלום)' },
      ],
      notes: [
        'מע"מ לתשלום = עסקאות מע"מ - תשומות מע"מ',
        'הקובץ ב-Windows-1255 (codepage עברי), CR+LF',
        'המערכת שומרת היסטוריה + MD5 לאימות בעתיד',
      ],
    },
    rules: [
      'אזהרה: לפני הגשה ראשונה — אמת את הקובץ מול המסמך הרשמי של רשות המסים',
      'חשבוניות במטבע זר לא נכללות (PCN874 דורש ILS בלבד)',
      'חשבוניות זיכוי נרשמות עם סימן שלילי',
      'ההפקה נועלת אוטומטית את התקופה החשבונאית',
    ],
    perCompanyOverrides: ['ע.מ של החברה (חובה — מהגדרות חברה, 9 ספרות)'],
  },

  /* ────────────── תרחישי בנק · אשראי · מזומן ────────────── */

  {
    code: 'BANK_FEE',
    title: 'עמלת בנק',
    icon: Banknote,
    status: 'auto',
    category: 'bank',
    oneLiner: 'עמלת ניהול / שורה / כרטיסים — DR להוצאות בנק.',
    description:
      'עמלות שוטפות שמופיעות בדף הבנק (ניהול חשבון, שורת פעולה, כרטיסי אשראי). מזוהות בהתאמת בנק וזורמות ל-JE 2 שורות אוטומטית.',
    triggers: ['תנועת בנק שלילית מסומנת כ-BANK_FEE בהתאמת בנק'],
    jeStructure: '2 שורות: DR 522-0 עמלות בנק / CR בנק.',
    example: {
      description: 'עמלת ניהול חשבון 25 ₪',
      invoice: { subtotal: 25, total: 25 },
      je: [
        { account: '522-0', side: 'DR', amount: '25.00', label: 'עמלות בנק' },
        { account: '121-0', side: 'CR', amount: '25.00', label: 'בנק הפועלים' },
      ],
      notes: ['ללא מע"מ — עמלות בנק פטורות'],
    },
    rules: [
      'איזון: סך חובה = סך זכות',
      'אין רכיב מע"מ',
      'חשבון בנק נלקח מהתאמת הבנק (פר-תנועה)',
    ],
    perCompanyOverrides: ['חשבון הוצאות בנק (522-0 ברירת מחדל)'],
  },

  {
    code: 'INTEREST_INCOME',
    title: 'ריבית זכות',
    icon: TrendingUp,
    status: 'auto',
    category: 'bank',
    oneLiner: 'ריבית בנק זכות — הכנסה לפי 743-0.',
    description:
      'תנועת בנק חיובית עם תיאור "ריבית זכות" — הכנסה ממימון. בעיקר בחשבונות חיסכון או פיקדון.',
    triggers: ['תנועת בנק חיובית מסומנת כ-INTEREST_INCOME'],
    jeStructure: '2 שורות: DR בנק / CR 743-0 הכנסות ריבית.',
    example: {
      description: 'ריבית זכות חודשית 50 ₪',
      invoice: { subtotal: 50, total: 50 },
      je: [
        { account: '121-0', side: 'DR', amount: '50.00', label: 'בנק' },
        { account: '743-0', side: 'CR', amount: '50.00', label: 'הכנסות ריבית' },
      ],
    },
    rules: [
      'ריבית זכות חייבת במס מלא — אין רכיב מע"מ',
      'מדווחת בדוח שנתי כהכנסה ממימון',
    ],
  },

  {
    code: 'INTEREST_EXPENSE',
    title: 'ריבית חובה (אוברדרפט)',
    icon: TrendingDown,
    status: 'auto',
    category: 'bank',
    oneLiner: 'ריבית חובה / מסגרת אשראי — DR הוצאות מימון.',
    description:
      'תנועה שלילית עם תיאור "ריבית חובה" / "ריבית מסגרת" — הוצאת מימון.',
    triggers: ['תנועת בנק שלילית מסומנת כ-INTEREST_EXPENSE'],
    jeStructure: '2 שורות: DR 624-0 הוצאות מימון / CR בנק.',
    example: {
      description: 'ריבית מסגרת חודשית 120 ₪',
      invoice: { subtotal: 120, total: 120 },
      je: [
        { account: '624-0', side: 'DR', amount: '120.00', label: 'הוצאות מימון — ריבית' },
        { account: '121-0', side: 'CR', amount: '120.00', label: 'בנק' },
      ],
    },
    rules: ['ללא מע"מ', 'מותר בניכוי מלא במס הכנסה'],
    perCompanyOverrides: ['חשבון הוצאות מימון (624-0 ברירת מחדל)'],
  },

  {
    code: 'INTER_ACCOUNT_TRANSFER',
    title: 'העברה בין חשבונות פנימיים',
    icon: RefreshCw,
    status: 'auto',
    category: 'bank',
    oneLiner: 'העברה בין שני חשבונות של אותה חברה — אין השפעה על P&L.',
    description:
      'תנועה משויכת לחשבון בנק/אשראי אחר באותה חברה (למשל בנק הפועלים → לאומי, או בנק → ארנק מזומן).',
    triggers: ['בהתאמת בנק נבחר חשבון יעד פנימי כצד נגדי'],
    jeStructure: '2 שורות: DR חשבון יעד / CR חשבון מקור.',
    example: {
      description: 'העברה 10,000 ₪ מבנק הפועלים לבנק לאומי',
      invoice: { subtotal: 10000, total: 10000 },
      je: [
        { account: '121-1', side: 'DR', amount: '10000.00', label: 'בנק לאומי' },
        { account: '121-0', side: 'CR', amount: '10000.00', label: 'בנק הפועלים' },
      ],
      notes: ['אין הכנסה ואין הוצאה — רק תנועת מזומנים פנימית'],
    },
    rules: [
      'שני חשבונות חייבים להיות בכרטסת חשבונות הבנק/מזומן/אשראי של החברה',
      'אסור להשתמש בתרחיש זה לתשלום ספק או קבלת לקוח',
    ],
  },

  {
    code: 'CASH_DEPOSIT',
    title: 'הפקדת מזומן לבנק',
    icon: PiggyBank,
    status: 'auto',
    category: 'bank',
    oneLiner: 'הפקדה מקופה / ארנק מזומן לבנק.',
    description:
      'תנועה שמורידה מהקופה ומגדילה את הבנק. מזוהה אוטומטית כשתנועת בנק חיובית מסומנת כהפקדת מזומן.',
    triggers: ['תנועת בנק חיובית מסומנת כ-CASH_DEPOSIT'],
    jeStructure: '2 שורות: DR בנק / CR קופה (חשבון מזומן).',
    example: {
      description: 'הפקדת 2,000 ₪ מזומן לבנק',
      invoice: { subtotal: 2000, total: 2000 },
      je: [
        { account: '121-0', side: 'DR', amount: '2000.00', label: 'בנק' },
        { account: '110-0', side: 'CR', amount: '2000.00', label: 'קופה' },
      ],
    },
    rules: ['חשבון קופה (110-0) חייב להיות מוגדר במאסטר חשבונות'],
    perCompanyOverrides: ['חשבון קופה (110-0 ברירת מחדל)'],
  },

  {
    code: 'CASH_WITHDRAWAL',
    title: 'משיכת מזומן מהבנק',
    icon: Wallet2,
    status: 'auto',
    category: 'bank',
    oneLiner: 'משיכת מזומן מהבנק לקופה — הפוך מ-CASH_DEPOSIT.',
    description: 'תנועה שלילית בבנק שעוברת לקופה.',
    triggers: ['תנועת בנק שלילית מסומנת כ-CASH_WITHDRAWAL'],
    jeStructure: '2 שורות: DR קופה / CR בנק.',
    example: {
      description: 'משיכת 500 ₪ מזומן מבנק',
      invoice: { subtotal: 500, total: 500 },
      je: [
        { account: '110-0', side: 'DR', amount: '500.00', label: 'קופה' },
        { account: '121-0', side: 'CR', amount: '500.00', label: 'בנק' },
      ],
    },
    rules: ['אין השפעה על P&L'],
  },

  {
    code: 'BOUNCED_CHECK',
    title: 'צ\'ק שחזר ללא כיסוי',
    icon: XCircle,
    status: 'auto',
    category: 'bank',
    oneLiner: 'צ\'ק חזר — JE היפוך לקבלה הקודמת + עמלת חזר.',
    description:
      'הבנק החזיר צ\'ק שהופקד. ה-JE מבטל את הקבלה (הלקוח חוזר להיות חייב) ומחייב הוצאות בנק בעמלת חזר.',
    triggers: ['תנועת בנק שלילית מסומנת כ-BOUNCED_CHECK'],
    jeStructure: '3 שורות: DR לקוח (חוב חוזר) + DR עמלת חזר / CR בנק.',
    example: {
      description: 'צ\'ק 1,180 ₪ חזר + עמלת חזר 30 ₪',
      invoice: { subtotal: 1180, total: 1210 },
      je: [
        { account: '120-1', side: 'DR', amount: '1180.00', label: 'לקוח (חוב חוזר)' },
        { account: '522-0', side: 'DR', amount: '30.00', label: 'עמלת חזר צ\'ק' },
        { account: '121-0', side: 'CR', amount: '1210.00', label: 'בנק' },
      ],
      notes: ['חיוב הלקוח חוזר אוטומטית — נדרשת פעולת גבייה ידנית'],
    },
    rules: [
      'הקבלה המקורית לא נמחקת — היא מבוטלת על ידי JE היפוך',
      'אזהרה אם אין לקוח מקושר לצ\'ק המקורי',
    ],
  },

  {
    code: 'CARD_CLEARING_FEE',
    title: 'עמלת סליקת אשראי',
    icon: CreditCard,
    status: 'auto',
    category: 'bank',
    oneLiner: 'עמלה לחברת הסליקה (Tranzila / CardCom / Pelecard).',
    description:
      'בעת קבלת תשלום באשראי, חברת הסליקה גובה עמלה (~1.5%-3%). ה-JE רושם את ההפרש בין הסכום ברוטו לנטו שהתקבל בבנק.',
    triggers: ['תנועת בנק חיובית של נטו סליקה — עמלה רשומה בנפרד מהמסלקה'],
    jeStructure:
      '3 שורות: DR בנק (נטו שהתקבל) + DR 525-0 עמלות סליקה / CR לקוח (סכום מלא).',
    example: {
      description: 'תקבול לקוח 1,000 ₪ — עמלת סליקה 25 ₪',
      invoice: { subtotal: 1000, total: 1000 },
      je: [
        { account: '121-0', side: 'DR', amount: '975.00', label: 'בנק (נטו)' },
        { account: '525-0', side: 'DR', amount: '25.00', label: 'עמלות סליקה' },
        { account: '120-1', side: 'CR', amount: '1000.00', label: 'לקוח' },
      ],
      notes: ['העמלה מותרת בניכוי מלא במס הכנסה'],
    },
    rules: ['חישוב עמלה: ברוטו - נטו', 'אין מע"מ נפרד — חברת הסליקה כוללת אותו'],
    perCompanyOverrides: ['חשבון עמלות סליקה (525-0 ברירת מחדל)'],
  },

  /* ────────────── תרחישי משכורות ────────────── */

  {
    code: 'PAYROLL_MONTHLY',
    title: 'משכורת חודשית — ניכויים ונטו',
    icon: UsersIcon,
    status: 'auto',
    category: 'payroll',
    oneLiner: 'JE מתלוש שכר חודשי — שכר ברוטו DR מול ניכויים + נטו CR.',
    description:
      'נטען מקובץ תלוש שכר (CSV/JSON) או הזנה ידנית. ה-JE רושם את כל מרכיבי הברוטו ב-DR (שכר, רכב, נסיעות, בונוסים) ובצד הזכות פותח התחייבויות נפרדות לכל גורם ניכוי: ביטוח לאומי, מס הכנסה, פנסיית עובד, השתלמות עובד, ונטו לעובד.',
    triggers: ['ייבוא / הזנת payroll_entry חודשי לעובד'],
    jeStructure:
      '5-8 שורות. DR שכר ברוטו (אחד או יותר) / CR ביטוח לאומי + מס הכנסה + פנסיה (עובד) + השתלמות (עובד) + נטו לעובד.',
    example: {
      description: 'משכורת חודשית — שכר ברוטו 15,000 ₪',
      invoice: { subtotal: 15000, total: 15000 },
      je: [
        { account: '600-0', side: 'DR', amount: '15000.00', label: 'שכר ברוטו' },
        { account: '230-1', side: 'CR', amount: '1500.00', label: 'ביטוח לאומי (עובד)' },
        { account: '230-2', side: 'CR', amount: '2500.00', label: 'מס הכנסה' },
        { account: '230-3', side: 'CR', amount: '900.00', label: 'פנסיה (עובד)' },
        { account: '230-4', side: 'CR', amount: '450.00', label: 'השתלמות (עובד)' },
        { account: '230-9', side: 'CR', amount: '9650.00', label: 'נטו לעובד' },
      ],
      notes: ['JE נוצר אוטומטית אחרי שמירת תלוש דרך מסך משכורות'],
    },
    rules: [
      'איזון: סך הברוטו = סך הניכויים + נטו',
      'תאריך אסמכתא = סוף החודש שאליו מתייחסת המשכורת',
      'כל עובד מקבל JE נפרד (לא מאוחד)',
      'אם תלוש מסומן is_split — נוצרים 3 JEs: עובד + מעביד + תשלום',
    ],
    perCompanyOverrides: [
      'חשבון שכר ברוטו (600-0 ברירת מחדל)',
      'חשבון התחייבויות לעובדים (230-9)',
      'חשבונות גורמי ניכוי (230-1..230-4)',
    ],
  },

  {
    code: 'PAYROLL_EMPLOYER',
    title: 'הפרשות מעביד',
    icon: Briefcase,
    status: 'auto',
    category: 'payroll',
    oneLiner: 'JE נפרד להפרשות מעסיק — לא מנוכות מהעובד אלא נוספות לעלות.',
    description:
      'הפרשות שהמעביד משלם בנוסף לשכר: ביטוח לאומי מעביד, פנסיה מעביד, השתלמות מעביד, פיצויים. ה-JE יוצר הוצאה סוציאלית מול התחייבויות לאותם גופים.',
    triggers: ['payroll_entry עם רכיבי employer_* (ביטוח/פנסיה/השתלמות/פיצויים מעביד)'],
    jeStructure:
      '4-5 שורות: DR 601-0 הוצאות סוציאליות / CR ביטוח לאומי מעביד + פנסיה מעביד + השתלמות מעביד + פיצויים מעביד.',
    example: {
      description: 'הפרשות מעביד על משכורת 15,000 ₪',
      invoice: { subtotal: 4500, total: 4500 },
      je: [
        { account: '601-0', side: 'DR', amount: '4500.00', label: 'הוצאות סוציאליות' },
        { account: '230-1', side: 'CR', amount: '1200.00', label: 'ביטוח לאומי (מעביד)' },
        { account: '230-3', side: 'CR', amount: '900.00', label: 'פנסיה (מעביד)' },
        { account: '230-4', side: 'CR', amount: '750.00', label: 'השתלמות (מעביד)' },
        { account: '230-5', side: 'CR', amount: '1650.00', label: 'פיצויים (מעביד)' },
      ],
      notes: ['בנפרד מ-PAYROLL_MONTHLY כדי שהדוח יראה ברור עלות שכר אמיתית'],
    },
    rules: [
      'מתבצע באותו תאריך ערך כמו תלוש העובד',
      'אם is_split=false — מאוחד לתוך JE אחד עם תרחיש PAYROLL_MONTHLY',
    ],
    perCompanyOverrides: ['חשבון הוצאות סוציאליות (601-0 ברירת מחדל)'],
  },

  {
    code: 'PAYROLL_PAYMENT',
    title: 'תשלום משכורת לעובד',
    icon: HandCoins,
    status: 'auto',
    category: 'payroll',
    oneLiner: 'העברה בפועל מהבנק — סוגרת התחייבות "נטו לעובד".',
    description:
      'אחרי ה-JE של תלוש המשכורת, נשארת התחייבות פתוחה ב-230-9. JE התשלום סוגר את ההתחייבות ומגיב מהבנק.',
    triggers: ['תנועת בנק שלילית מסומנת כ-PAYROLL_PAYMENT', 'או הפעלה ידנית מ"שלם משכורת"'],
    jeStructure: '2 שורות: DR 230-9 נטו לעובד (סגירה) / CR בנק.',
    example: {
      description: 'תשלום נטו לעובד 9,650 ₪',
      invoice: { subtotal: 9650, total: 9650 },
      je: [
        { account: '230-9', side: 'DR', amount: '9650.00', label: 'נטו לעובד (סגירה)' },
        { account: '121-0', side: 'CR', amount: '9650.00', label: 'בנק' },
      ],
    },
    rules: [
      'JE זה אסור אם אין יתרה פתוחה ב-230-9 לעובד',
      'יוצא לדף הבנק להתאמה אוטומטית',
    ],
  },

  /* ────────────── נכסי קבע ופחת ────────────── */

  {
    code: 'ASSET_PURCHASE',
    title: 'רכישת נכס קבע',
    icon: Truck,
    status: 'auto',
    category: 'assets',
    oneLiner: 'רכישת מחשב / רכב / ציוד — קפיטליזציה ל-DR נכס במקום הוצאה.',
    description:
      'בעת הוספת נכס דרך מסך "נכסי קבע" המערכת בונה JE שזוקף את הסכום לחשבון נכס (140-x) במקום להוצאה (502-0). הנכס נכנס למאסטר עם שיעור פחת שנתי וחיי שירות בחודשים, ומתחיל לצבור פחת בריצה החודשית הבאה.',
    triggers: [
      'הוספת נכס במסך "נכסי קבע ופחת"',
      'חשבונית מסומנת is_fixed_asset (Phase עתידי — סימון אוטומטי בעת ה-OCR)',
    ],
    jeStructure: 'רשומה אחת, 3 שורות: DR נכס + DR מע"מ / CR ספק (או חשבון תשלום מיידי).',
    example: {
      description: 'רכישת מחשב Lenovo 5,000 ₪ + מע"מ',
      invoice: { number: 'PC-001', subtotal: 5000, total: 5900 },
      je: [
        { account: '140-2', side: 'DR', amount: '5000.00', label: 'מחשבים וציוד מחשוב' },
        { account: '205-2', side: 'DR', amount: '900.00', label: 'מע"מ תשומות' },
        { account: '200001', side: 'CR', amount: '5900.00', label: 'ספק' },
      ],
      notes: [
        'שיעורי פחת שנתיים מומלצים: מחשבים 33%, רכבים 15%, מבנים 4%, ציוד משרדי 7%',
        'אם תשלום מיידי — חשבון הזכות הוא בנק/אשראי במקום ספק',
      ],
    },
    rules: [
      'הנכס נשמר במאסטר עם purchase_amount, depreciation_rate_annual, useful_life_months',
      'JE רכישה נוצר אוטומטית עם ה-fixed_asset_id back-reference',
      'בקרוב: סימון אוטומטי של חשבונית כ-fixed asset לפי ערך + קטגוריה',
    ],
    perCompanyOverrides: [
      'חשבונות נכס פר-קטגוריה (140-1..140-9)',
      'חשבונות פחת מצטבר פר-קטגוריה (149-1..149-9)',
      'חשבון הוצאות פחת (610-0)',
    ],
  },

  {
    code: 'ASSET_DEPRECIATION',
    title: 'פחת חודשי קו ישר',
    icon: TrendingDown,
    status: 'auto',
    category: 'assets',
    oneLiner: 'הרצה חודשית — JE לכל נכס פעיל. (עלות − גרט) ÷ חיי שירות.',
    description:
      'בלחיצה על "הרץ פחת חודשי" המערכת עוברת על כל הנכסים הפעילים (in_service_date ≤ סוף חודש), מחשבת פחת קו ישר, ויוצרת JE 2 שורות לכל נכס. הריצה idempotent — חודש שכבר רץ מדולג. תקופה נעולה חוסמת את הריצה.',
    triggers: [
      'הפעלה מהמסך "נכסי קבע" → "הרץ פחת חודשי"',
      'בעתיד: cron אוטומטי בסוף כל חודש',
    ],
    jeStructure: 'רשומה אחת, 2 שורות: DR הוצאות פחת (610-0) / CR פחת מצטבר (149-x).',
    example: {
      description: 'פחת חודשי על מחשב 5,000 ₪ בשיעור 33% שנתי',
      invoice: { subtotal: 138.89, total: 138.89 },
      je: [
        { account: '610-0', side: 'DR', amount: '138.89', label: 'הוצאות פחת — מחשבים' },
        { account: '149-2', side: 'CR', amount: '138.89', label: 'פחת מצטבר — מחשבים' },
      ],
      notes: [
        'חישוב: 5,000 / 36 חודשים = 138.89 ₪',
        'חודש אחרון מתואם אוטומטית כדי לא לחרוג מ-purchase × (1 - salvage)',
        'נכס מופחת מלא או לא פעיל — מדולג ללא JE',
      ],
    },
    rules: [
      'idempotent — לא תיווצר רשומה כפולה לאותו (asset, year, month)',
      'חוסם תקופה נעולה (period.status != open)',
      'מתעדכן fixed_asset.accumulated_depreciation אוטומטית',
    ],
    perCompanyOverrides: ['חשבון הוצאות פחת (610-0 ברירת מחדל)'],
  },

  {
    code: 'ASSET_SALE',
    title: 'מכירת / הסרת נכס',
    icon: CircleDollarSign,
    status: 'auto',
    category: 'assets',
    oneLiner: 'מכירת נכס קבע או הסרה ללא תמורה — חישוב רווח/הפסד הון אוטומטי.',
    description:
      'מסגירה את כל היתרות של הנכס: פחת מצטבר מתבטל (DR), עלות הנכס מתבטלת (CR), ויש קו רווח/הפסד הון לפי ההפרש בין תמורה לערך פנקסני (NBV). אם בחרת "הסרה ללא תמורה" — כל ה-NBV יירשם כהפסד הון.',
    triggers: ['פעולה ידנית מ"מכור / הסר" במסך נכסי קבע'],
    jeStructure: '4-5 שורות (לפי תמורה ומע"מ). אם > 4 שורות — דורש פורמט FLEXIBLE.',
    example: {
      description: 'מכירת מחשב — עלות 5,000 / פחת מצטבר 3,000 / תמורה 2,500 + מע"מ',
      invoice: { subtotal: 2500, total: 2950 },
      je: [
        { account: '121-0', side: 'DR', amount: '2950.00', label: 'בנק (תקבול)' },
        { account: '149-2', side: 'DR', amount: '3000.00', label: 'סגירת פחת מצטבר' },
        { account: '140-2', side: 'CR', amount: '5000.00', label: 'סגירת נכס — מחשבים' },
        { account: '220-0', side: 'CR', amount: '450.00', label: 'מע"מ עסקאות' },
        { account: '744-0', side: 'CR', amount: '500.00', label: 'רווח הון ממכירת נכס' },
      ],
      notes: [
        'NBV = עלות 5,000 - מצטבר 3,000 = 2,000',
        'תמורה 2,500 - NBV 2,000 = רווח 500',
        'בהפסד — DR 625-0 הפסד הון במקום CR 744-0 רווח הון',
      ],
    },
    rules: [
      'הנכס משנה סטטוס ל-sold/disposed עם retired_date + retirement_je_id',
      'אזהרה אם > 4 שורות (פורמט 180 לא תומך)',
      'אזהרה אם פחת מצטבר חורג מעלות הרכישה',
    ],
    perCompanyOverrides: [
      'חשבון רווח הון (744-0 ברירת מחדל)',
      'חשבון הפסד הון (625-0 ברירת מחדל)',
    ],
  },

  /* ────────────── תרחישים עתידיים — מלאי ────────────── */

  {
    code: 'INVENTORY_PURCHASE',
    title: 'רכישת מלאי',
    icon: Package,
    status: 'coming-soon',
    category: 'inventory',
    oneLiner: 'רכישה לעסק שמנהל מלאי — DR למלאי במקום הוצאה.',
    description: 'בעסקים עם מלאי (מסחר, ייצור) הרכישה הולכת ל-130-0 מלאי, COGS חודשי מנכה.',
    triggers: ['חשבונית מסומנת כ-inventory'],
    jeStructure: 'DR 130-0 מלאי + DR מע"מ / CR ספק.',
    example: {
      description: 'רכישת חומר גלם 10,000 ₪',
      invoice: { number: 'INV-101', subtotal: 10000, total: 11800 },
      je: [
        { account: '130-0', side: 'DR', amount: '10000.00', label: 'מלאי' },
        { account: '205-2', side: 'DR', amount: '1800.00', label: 'מע"מ תשומות' },
        { account: '200xxx', side: 'CR', amount: '11800.00', label: 'ספק' },
      ],
    },
    rules: ['בקרוב: ניהול קטלוג + מעקב מק"ט'],
  },

  {
    code: 'COGS',
    title: 'עלות המכר (COGS)',
    icon: Calculator,
    status: 'coming-soon',
    category: 'inventory',
    oneLiner: 'הכרה חודשית בעלות מלאי שנמכר.',
    description: 'בכל סוף חודש — מחשב עלות פריטים שנמכרו ומעביר ממלאי לעלות המכר.',
    triggers: ['חודש סגור עם תנועות מכירה'],
    jeStructure: 'DR 502-0 עלות המכר / CR 130-0 מלאי.',
    example: {
      description: 'עלות מכר חודשית — 50,000 ₪',
      invoice: { subtotal: 50000, total: 50000 },
      je: [
        { account: '502-0', side: 'DR', amount: '50000.00', label: 'עלות המכר' },
        { account: '130-0', side: 'CR', amount: '50000.00', label: 'מלאי' },
      ],
      notes: ['חישוב לפי FIFO / ממוצע משוקלל'],
    },
    rules: ['בקרוב'],
  },

  {
    code: 'INVENTORY_COUNT',
    title: 'התאמת ספירת מלאי',
    icon: ClipboardList,
    status: 'coming-soon',
    category: 'inventory',
    oneLiner: 'הפרשי ספירה — חוסר/עודף בספירה לעומת ספרים.',
    description: 'ספירת מלאי תקופתית לעומת היתרה בספרים. הפרשים מועברים להוצאה (חוסר) או הכנסה (עודף).',
    triggers: ['ייבוא תוצאות ספירה'],
    jeStructure: 'חוסר: DR הוצאות חוסר / CR מלאי. עודף: DR מלאי / CR הכנסות עודף.',
    example: {
      description: 'הפרש ספירה — חוסר 500 ₪',
      invoice: { subtotal: 500, total: 500 },
      je: [
        { account: '503-1', side: 'DR', amount: '500.00', label: 'הוצאות חוסר במלאי' },
        { account: '130-0', side: 'CR', amount: '500.00', label: 'מלאי (התאמה)' },
      ],
    },
    rules: ['בקרוב: ייבוא ספירה מ-Excel / ברקוד סקנר'],
  },

  /* ────────────── תרחישים עתידיים — סוף תקופה ────────────── */

  {
    code: 'PERIOD_ACCRUAL',
    title: 'הוצאות לזמן ארוך (Accrual)',
    icon: Calendar,
    status: 'coming-soon',
    category: 'period',
    oneLiner: 'הוצאה שנגרמה ולא דווחה — הפרשה.',
    description: 'דוגמה: שירות שניתן בדצמבר אבל החשבונית התקבלה בינואר. ההוצאה צריכה להיות מוכרת בדצמבר.',
    triggers: ['ידני בסוף תקופה'],
    jeStructure: 'DR הוצאה / CR הפרשות לחשבוניות. בחודש הבא — JE היפוך עם קבלת החשבונית.',
    example: {
      description: 'הפרשה לשכ"ט ייעוץ דצמבר 2,000',
      invoice: { subtotal: 2000, total: 2000 },
      je: [
        { account: '504-0', side: 'DR', amount: '2000.00', label: 'שירותים מקצועיים' },
        { account: '230-9', side: 'CR', amount: '2000.00', label: 'הפרשות' },
      ],
    },
    rules: ['בקרוב'],
  },

  {
    code: 'PERIOD_PREPAID_RECOGNITION',
    title: 'הכרת הוצאה מראש חודשית',
    icon: Clock,
    status: 'coming-soon',
    category: 'period',
    oneLiner: 'הכרה אוטומטית חודשית של הוצאות PREPAID.',
    description: 'אוטומציה חודשית — לכל JE PREPAID פעיל מתבצעת הכרה חודשית.',
    triggers: ['חודש פעיל עם prepaid יתרה > 0'],
    jeStructure: 'DR הוצאה רגילה / CR הוצאות מראש (102-0).',
    example: {
      description: 'הכרה חודשית — ביטוח שנתי',
      invoice: { subtotal: 1000, total: 1000 },
      je: [
        { account: '510-3', side: 'DR', amount: '1000.00', label: 'הוצאת ביטוח' },
        { account: '102-0', side: 'CR', amount: '1000.00', label: 'הוצאות מראש (הכרה)' },
      ],
    },
    rules: ['בקרוב: רץ אוטומטית בחודש הראשון של כל חודש (Vercel Cron)'],
  },

  {
    code: 'FX_REVALUATION',
    title: 'הערכת מט"ח לסוף תקופה',
    icon: Globe,
    status: 'coming-soon',
    category: 'period',
    oneLiner: 'יתרות מט"ח של ספקים/לקוחות מוערכות לפי שער סוף החודש.',
    description: 'יתרות במט"ח (ספקים זרים, לקוחות זרים) משוערכות לפי שער סוף החודש. הפרש = רווח/הפסד מטבע.',
    triggers: ['סוף חודש עם יתרות מט"ח'],
    jeStructure: 'הפרש חיובי: DR ספק זר / CR רווח שער. שלילי: הפך.',
    example: {
      description: 'הערכת ספק USA — יתרה 1000$ — שער עלה מ-3.7 ל-3.75',
      invoice: { subtotal: 50, total: 50 },
      je: [
        { account: '744-0', side: 'DR', amount: '50.00', label: 'הפסד שער' },
        { account: '200xxx', side: 'CR', amount: '50.00', label: 'ספק זר (העלאת יתרה)' },
      ],
    },
    rules: ['בקרוב: הרצה אוטומטית בסוף חודש'],
  },

  /* ────────────── תרחישים עתידיים — סגירת שנה ────────────── */

  {
    code: 'YEAR_END_CLOSE_REVENUE',
    title: 'סגירת חשבונות הכנסה',
    icon: Lock,
    status: 'coming-soon',
    category: 'year-end',
    oneLiner: 'איפוס חשבונות הכנסה לסוף שנה.',
    description: 'בסוף שנת מס — כל יתרות חשבונות ההכנסה מועברות ל-906-0 סיכום רווח והפסד.',
    triggers: ['סגירת שנה'],
    jeStructure: 'DR (כל הכנסה) / CR סיכום רווח והפסד.',
    example: {
      description: 'סגירת הכנסות שנתיות 1.2M ₪',
      invoice: { subtotal: 1200000, total: 1200000 },
      je: [
        { account: '700-0', side: 'DR', amount: '1000000.00', label: 'הכנסות ממכירות' },
        { account: '710-0', side: 'DR', amount: '200000.00', label: 'הכנסות משירותים' },
        { account: '906-0', side: 'CR', amount: '1200000.00', label: 'סיכום רווח והפסד' },
      ],
    },
    rules: ['בקרוב'],
  },

  {
    code: 'YEAR_END_CLOSE_EXPENSE',
    title: 'סגירת חשבונות הוצאה',
    icon: Lock,
    status: 'coming-soon',
    category: 'year-end',
    oneLiner: 'איפוס חשבונות הוצאה לסוף שנה.',
    description: 'מקביל לסגירת הכנסות — הוצאות מועברות ל-906-0.',
    triggers: ['סגירת שנה'],
    jeStructure: 'DR סיכום רווח והפסד / CR (כל הוצאה).',
    example: {
      description: 'סגירת הוצאות שנתיות 800K ₪',
      invoice: { subtotal: 800000, total: 800000 },
      je: [
        { account: '906-0', side: 'DR', amount: '800000.00', label: 'סיכום רווח והפסד' },
        { account: '502-0', side: 'CR', amount: '600000.00', label: 'קניות' },
        { account: '600-0', side: 'CR', amount: '150000.00', label: 'משכורות' },
        { account: '522-0', side: 'CR', amount: '50000.00', label: 'עמלות בנק' },
      ],
    },
    rules: ['בקרוב'],
  },

  {
    code: 'YEAR_END_CLOSE_VAT',
    title: 'סגירת חשבונות מע"מ',
    icon: Percent,
    status: 'coming-soon',
    category: 'year-end',
    oneLiner: 'איפוס מע"מ תשומות מול מע"מ עסקאות לסוף שנה.',
    description:
      'בסוף השנה, חשבונות מע"מ תשומות (205-2) ומע"מ עסקאות (220-0) מתקזזים. ההפרש (חוב או יתרה לרשות המסים) מועבר לחשבון "מע"מ לתשלום / לקבל".',
    triggers: ['ריצת סגירת שנה', 'אחרי דיווח 874 האחרון של השנה'],
    jeStructure:
      '3 שורות: DR מע"מ עסקאות (סגירה) + DR/CR מע"מ לתשלום / מע"מ להחזר (הפרש) / CR מע"מ תשומות (סגירה).',
    example: {
      description: 'מע"מ תשומות 50K, מע"מ עסקאות 70K — חוב 20K לרשות המסים',
      invoice: { subtotal: 70000, total: 70000 },
      je: [
        { account: '220-0', side: 'DR', amount: '70000.00', label: 'מע"מ עסקאות (סגירה)' },
        { account: '205-2', side: 'CR', amount: '50000.00', label: 'מע"מ תשומות (סגירה)' },
        { account: '230-7', side: 'CR', amount: '20000.00', label: 'מע"מ לתשלום' },
      ],
      notes: ['אם תשומות > עסקאות — DR מע"מ להחזר במקום CR מע"מ לתשלום'],
    },
    rules: [
      'בקרוב — אחרי בניית engine סגירת שנה',
      'מתבצע רק אחרי סגירת תקופת דצמבר',
      'ריצה אחת לשנה',
    ],
    perCompanyOverrides: ['חשבון מע"מ לתשלום (230-7 ברירת מחדל)'],
  },

  {
    code: 'YEAR_END_TRANSFER_PROFIT',
    title: 'העברת רווח/הפסד ליתרת רווחים',
    icon: TrendingUp,
    status: 'coming-soon',
    category: 'year-end',
    oneLiner: 'העברת תוצאות הסגירה ליתרת רווחים מצטברת.',
    description: 'אחרי סגירת הכנסות והוצאות — היתרה ב-906-0 (רווח או הפסד) מועברת ל-910-0 יתרת רווחים.',
    triggers: ['אחרי סגירת חשבונות הכנסה והוצאה'],
    jeStructure: 'DR סיכום / CR יתרת רווחים. או הפך אם הפסד.',
    example: {
      description: 'העברת רווח שנתי 400K ₪',
      invoice: { subtotal: 400000, total: 400000 },
      je: [
        { account: '906-0', side: 'DR', amount: '400000.00', label: 'סיכום רווח והפסד' },
        { account: '910-0', side: 'CR', amount: '400000.00', label: 'יתרת רווחים' },
      ],
    },
    rules: ['בקרוב'],
  },
];

/**
 * Final rule list with sequential IDs assigned by position.
 * The ID is the citation number — used in audit logs and improvement-note refs.
 */
export const RULES: AccountingRule[] = RULES_RAW.map((r, i) => ({
  ...r,
  id: i + 1,
}));
