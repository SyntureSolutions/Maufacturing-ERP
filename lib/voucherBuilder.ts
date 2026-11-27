import { ACC } from '@/lib/accounting';
import type { VoucherType } from '@/models/Voucher';

export interface VoucherInput {
  type: VoucherType;
  amount?: number; // gross amount for payments/receipts/contra/petty cash
  partyType?: 'SUPPLIER' | 'CUSTOMER' | 'OTHER';
  counterAccount?: string; // ledger code for OTHER party / expense head / petty cash expense head
  mode?: 'BANK' | 'CASH'; // for expense paid immediately, or petty-cash replenishment source
  pettyKind?: 'EXPENSE' | 'REPLENISH';
  expensePayment?: 'CREDIT' | 'BANK' | 'CASH' | 'PETTY_CASH';
  taxableAmount?: number; // expense / notes
  gstPercent?: number;
  tdsPercent?: number;
  from?: 'CASH' | 'BANK'; // contra
  to?: 'CASH' | 'BANK';
  journalLines?: { accountCode: string; debit?: number; credit?: number }[];
  instrument?: { chequeNo?: string; utr?: string };
}

type Acc = readonly [string, string, any, string] | { code: string };
export interface BuiltLine { acc: Acc; debit?: number; credit?: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const custom = (code: string): Acc => ({ code });
const cashOrBank = (m?: string) => (m === 'CASH' ? ACC.CASH : ACC.BANK);

export function buildVoucher(v: VoucherInput): { lines: BuiltLine[]; amount: number; errors: string[] } {
  const errors: string[] = [];
  const fail = (m: string) => { errors.push(m); return { lines: [] as BuiltLine[], amount: 0, errors }; };
  const amt = r2(Number(v.amount) || 0);

  switch (v.type) {
    case 'BANK_PAYMENT': case 'CASH_PAYMENT': case 'BANK_RECEIPT': case 'CASH_RECEIPT': {
      if (amt <= 0) return fail('Amount must be greater than zero.');
      const isPayment = v.type.endsWith('PAYMENT');
      const money = v.type.startsWith('CASH') ? ACC.CASH : ACC.BANK;
      if (v.type.startsWith('BANK') && !(v.instrument?.chequeNo || v.instrument?.utr)) return fail('Enter a cheque number or UTR for bank vouchers.');
      let party: Acc;
      if (v.partyType === 'SUPPLIER') party = ACC.AP;
      else if (v.partyType === 'CUSTOMER') party = ACC.AR;
      else if (v.counterAccount) party = custom(v.counterAccount);
      else return fail('Choose a party or a ledger account.');
      if (isPayment && v.partyType === 'CUSTOMER') return fail('Use a credit note to refund a customer.');
      if (!isPayment && v.partyType === 'SUPPLIER') return fail('Use a debit note for supplier refunds.');
      return { amount: amt, errors, lines: isPayment ? [{ acc: party, debit: amt }, { acc: money, credit: amt }] : [{ acc: money, debit: amt }, { acc: party, credit: amt }] };
    }
    case 'PETTY_CASH': {
      if (amt <= 0) return fail('Amount must be greater than zero.');
      if (v.pettyKind === 'REPLENISH') return { amount: amt, errors, lines: [{ acc: ACC.PETTY_CASH, debit: amt }, { acc: cashOrBank(v.mode), credit: amt }] };
      return { amount: amt, errors, lines: [{ acc: v.counterAccount ? custom(v.counterAccount) : ACC.OVERHEAD, debit: amt }, { acc: ACC.PETTY_CASH, credit: amt }] };
    }
    case 'EXPENSE': {
      const base = r2(Number(v.taxableAmount) || 0);
      if (base <= 0) return fail('Expense amount must be greater than zero.');
      const gst = r2(base * (Number(v.gstPercent) || 0) / 100);
      const tds = r2(base * (Number(v.tdsPercent) || 0) / 100);
      const net = r2(base + gst - tds);
      const settle = v.expensePayment === 'BANK' ? ACC.BANK : v.expensePayment === 'CASH' ? ACC.CASH : v.expensePayment === 'PETTY_CASH' ? ACC.PETTY_CASH : ACC.AP;
      return { amount: r2(base + gst), errors, lines: [
        { acc: v.counterAccount ? custom(v.counterAccount) : ACC.OVERHEAD, debit: base }, { acc: ACC.GST_INPUT, debit: gst },
        { acc: ACC.TDS_PAYABLE, credit: tds }, { acc: settle, credit: net },
      ] };
    }
    case 'JOURNAL': {
      const lines = (v.journalLines || []).filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0);
      if (lines.length < 2) return fail('A journal needs at least two lines.');
      if (lines.some(l => (l.debit || 0) > 0 && (l.credit || 0) > 0)) return fail('A line cannot carry both a debit and a credit.');
      const dr = r2(lines.reduce((s, l) => s + (l.debit || 0), 0)), cr = r2(lines.reduce((s, l) => s + (l.credit || 0), 0));
      if (dr !== cr) return fail(`Journal is out of balance by ${r2(Math.abs(dr - cr))} (Dr ${dr}, Cr ${cr}).`);
      return { amount: dr, errors, lines: lines.map(l => ({ acc: custom(l.accountCode), debit: l.debit, credit: l.credit })) };
    }
    case 'CONTRA': {
      if (amt <= 0) return fail('Amount must be greater than zero.');
      if (!v.from || !v.to || v.from === v.to) return fail('Choose different source and destination (cash / bank).');
      return { amount: amt, errors, lines: [{ acc: cashOrBank(v.to), debit: amt }, { acc: cashOrBank(v.from), credit: amt }] };
    }
    case 'DEBIT_NOTE': case 'CREDIT_NOTE': {
      const base = r2(Number(v.taxableAmount) || 0);
      if (base <= 0) return fail('Taxable value must be greater than zero.');
      const gst = r2(base * (Number(v.gstPercent) || 0) / 100);
      const total = r2(base + gst);
      return v.type === 'DEBIT_NOTE'
        ? { amount: total, errors, lines: [{ acc: ACC.AP, debit: total }, { acc: ACC.INV_RM, credit: base }, { acc: ACC.GST_INPUT, credit: gst }] }
        : { amount: total, errors, lines: [{ acc: ACC.SALES_RETURNS, debit: base }, { acc: ACC.GST_OUTPUT, debit: gst }, { acc: ACC.AR, credit: total }] };
    }
    default:
      return fail('Unsupported voucher type.');
  }
}
