import { roundCents } from './helpers.js';
import type {
  CashBankConfig,
  CashBankInput,
  CashBankConstructResult,
  CashBankJERecord,
  CashBankJELine,
} from './cash-bank-types.js';

export type {
  CashBankScenario,
  CashBankConfig,
  CashBankInput,
  CashBankJELine,
  CashBankJERecord,
  CashBankConstructResult,
} from './cash-bank-types.js';

/**
 * Build a JE for a non-invoice cash/bank/credit-card transaction.
 * Each scenario yields a single 2-line balanced record (or 3 lines for
 * BOUNCED_CHECK with a fee).
 */
export function constructCashBankJE(
  input: CashBankInput,
  config: CashBankConfig,
): CashBankConstructResult {
  const warnings: string[] = [];
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    warnings.push('סכום חייב להיות חיובי. תרחישים מובחנים על ידי scenario, לא על ידי סימן.');
  }
  const bank = input.sourceBankAccount ?? config.bankAccount;
  const reference1 = input.reference ?? input.description.slice(0, 20);

  let record: CashBankJERecord;

  switch (input.scenario) {
    case 'BANK_FEE': {
      if (!config.bankFeesAccount) {
        warnings.push('BANK_FEE: לא הוגדר חשבון עמלות בנק — נבחר 522-0 כברירת מחדל.');
      }
      const fees = config.bankFeesAccount ?? '522-0';
      record = makeRecord(input, 'BANK_FEE', reference1, [
        { account: fees, debit: amount, credit: 0, details: input.description },
        { account: bank, debit: 0, credit: amount },
      ], [`עמלת בנק: ${amount.toFixed(2)} ₪`]);
      break;
    }

    case 'INTEREST_INCOME': {
      if (!config.interestIncomeAccount) {
        warnings.push('INTEREST_INCOME: לא הוגדר חשבון הכנסות ריבית — נבחר 743-0 כברירת מחדל.');
      }
      const income = config.interestIncomeAccount ?? '743-0';
      record = makeRecord(input, 'INTEREST_INCOME', reference1, [
        { account: bank, debit: amount, credit: 0 },
        { account: income, debit: 0, credit: amount, details: input.description },
      ], [
        `ריבית זכות: ${amount.toFixed(2)} ₪`,
        'ריבית חייבת במס מלא (לא נכלל ב-PCN874 כעסקה)',
      ]);
      break;
    }

    case 'INTEREST_EXPENSE': {
      if (!config.interestExpenseAccount) {
        warnings.push('INTEREST_EXPENSE: לא הוגדר חשבון ריבית והוצאות מימון — נבחר 624-0 כברירת מחדל.');
      }
      const expense = config.interestExpenseAccount ?? '624-0';
      record = makeRecord(input, 'INTEREST_EXPENSE', reference1, [
        { account: expense, debit: amount, credit: 0, details: input.description },
        { account: bank, debit: 0, credit: amount },
      ], [`ריבית חובה: ${amount.toFixed(2)} ₪`]);
      break;
    }

    case 'INTER_ACCOUNT_TRANSFER': {
      if (!input.destinationBankAccount) {
        warnings.push(
          'INTER_ACCOUNT_TRANSFER: חסר destinationBankAccount — נדרש כדי לדעת לאיזה חשבון מתבצעת ההעברה.',
        );
      }
      const dest = input.destinationBankAccount ?? bank;
      record = makeRecord(input, 'INTER_ACCOUNT_TRANSFER', reference1, [
        { account: dest, debit: amount, credit: 0, details: `העברה מ-${bank}` },
        { account: bank, debit: 0, credit: amount, details: `העברה ל-${dest}` },
      ], [
        `העברה פנימית: ${amount.toFixed(2)} ₪`,
        'אין השפעה על P&L — תנועה בין חשבונות בעלים זהה',
      ]);
      break;
    }

    case 'CASH_DEPOSIT': {
      if (!config.cashAccount) {
        warnings.push('CASH_DEPOSIT: לא הוגדר חשבון קופה — נבחר 100-0 כברירת מחדל.');
      }
      const cash = config.cashAccount ?? '100-0';
      record = makeRecord(input, 'CASH_DEPOSIT', reference1, [
        { account: bank, debit: amount, credit: 0, details: 'הפקדה מהקופה' },
        { account: cash, debit: 0, credit: amount },
      ], [`הפקדת מזומן לבנק: ${amount.toFixed(2)} ₪`]);
      break;
    }

    case 'CASH_WITHDRAWAL': {
      if (!config.cashAccount) {
        warnings.push('CASH_WITHDRAWAL: לא הוגדר חשבון קופה — נבחר 100-0 כברירת מחדל.');
      }
      const cash = config.cashAccount ?? '100-0';
      record = makeRecord(input, 'CASH_WITHDRAWAL', reference1, [
        { account: cash, debit: amount, credit: 0, details: 'משיכה מהבנק' },
        { account: bank, debit: 0, credit: amount },
      ], [`משיכת מזומן מהבנק: ${amount.toFixed(2)} ₪`]);
      break;
    }

    case 'BOUNCED_CHECK': {
      const fee = roundCents(input.bouncedFee ?? 0);
      if (!input.customerAccount) {
        warnings.push(
          'BOUNCED_CHECK: חסר customerAccount — נדרש כדי להחזיר את החוב ללקוח.',
        );
      }
      const customer = input.customerAccount ?? '120-0';
      const feesAcct = config.bankFeesAccount ?? '522-0';
      const lines: CashBankJELine[] = [
        { account: customer, debit: amount, credit: 0, details: 'חוב חוזר — צ\'ק לא נפרע' },
      ];
      if (fee > 0) {
        lines.push({ account: feesAcct, debit: fee, credit: 0, details: 'עמלת חזר צ\'ק' });
      }
      lines.push({ account: bank, debit: 0, credit: amount + fee });
      record = makeRecord(input, 'BOUNCED_CHECK', reference1, lines, [
        `צ\'ק שחזר: ${amount.toFixed(2)} ₪`,
        ...(fee > 0 ? [`עמלת חזר: ${fee.toFixed(2)} ₪`] : []),
        'מומלץ: עדכון סטטוס בעמוד הלקוח + ניסיון גבייה חוזר',
      ]);
      break;
    }

    case 'CARD_CLEARING_FEE': {
      if (!config.cardClearingAccount) {
        warnings.push('CARD_CLEARING_FEE: לא הוגדר חשבון סולק אשראי — נבחר 125-0 כברירת מחדל.');
      }
      const clearing = config.cardClearingAccount ?? '125-0';
      const fees = config.cardFeesAccount ?? '522-1';
      record = makeRecord(input, 'CARD_CLEARING_FEE', reference1, [
        { account: fees, debit: amount, credit: 0, details: input.description },
        { account: clearing, debit: 0, credit: amount },
      ], [`עמלת סולק אשראי: ${amount.toFixed(2)} ₪`]);
      break;
    }
  }

  // Sanity check the balance.
  const dr = record.lines.reduce((s, l) => s + l.debit, 0);
  const cr = record.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(dr - cr) > 0.05) {
    warnings.push(`JE לא מאוזן (DR=${dr.toFixed(2)}, CR=${cr.toFixed(2)}) — באג בבונה.`);
  }

  return { record, warnings };
}

function makeRecord(
  input: CashBankInput,
  scenario: CashBankInput['scenario'],
  reference1: string,
  lines: CashBankJELine[],
  notes: string[],
): CashBankJERecord {
  return {
    scenario,
    reference1: reference1.slice(0, 20),
    documentDate: input.date,
    valueDate: input.date,
    details: input.description.slice(0, 40),
    transactionType: 'מ',
    lines,
    notes,
  };
}
