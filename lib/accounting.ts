import mongoose from 'mongoose';
import Account from '@/models/Account';
import JournalEntry from '@/models/JournalEntry';
import Voucher, { VoucherType } from '@/models/Voucher';
import PeriodLock from '@/models/PeriodLock';
import { nextDocNumber } from '@/lib/docNumber';

type AccType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

// Standard ledger codes. Codes 1010-5040 match the seeded chart; the rest are created on first use.
export const ACC = {
  CASH: ['1005', 'Cash in Hand', 'ASSET', 'Cash & Cash Equivalents'],
  PETTY_CASH: ['1006', 'Petty Cash (Imprest)', 'ASSET', 'Cash & Cash Equivalents'],
  BANK: ['1010', 'Factory HDFC Bank Account', 'ASSET', 'Cash & Cash Equivalents'],
  AR: ['1020', 'Accounts Receivable (Distributors)', 'ASSET', 'Current Asset'],
  INV_RM: ['1030', 'Raw Material Component Inventory', 'ASSET', 'Inventory Asset'],
  INV_WIP: ['1035', 'Work in Progress Inventory', 'ASSET', 'Inventory Asset'],
  INV_FG: ['1040', 'Finished Bicycle Stock Inventory', 'ASSET', 'Inventory Asset'],
  GST_INPUT: ['1060', 'Input GST Receivable', 'ASSET', 'Tax Asset'],
  AP: ['2010', 'Accounts Payable (Raw Material Vendors)', 'LIABILITY', 'Current Liability'],
  GST_OUTPUT: ['2020', 'Output GST Tax Payable (18%)', 'LIABILITY', 'Tax Liability'],
  TDS_PAYABLE: ['2030', 'TDS Payable', 'LIABILITY', 'Tax Liability'],
  TCS_PAYABLE: ['2040', 'TCS Payable', 'LIABILITY', 'Tax Liability'],
  SALES: ['4010', 'B2B Mountain Bike Sales', 'REVENUE', 'Sales Revenue'],
  JOBWORK_INCOME: ['4040', 'Job Work Service Income', 'REVENUE', 'Service Revenue'],
  SALES_RETURNS: ['4090', 'Sales Returns & Allowances', 'REVENUE', 'Sales Revenue'],
  COGS: ['5010', 'Raw Material Procurement COGS', 'EXPENSE', 'Cost of Goods Sold'],
  OVERHEAD: ['5040', 'Factory Utility & Operating Expenses', 'EXPENSE', 'Overhead'],
  PURCHASE_PRICE_VARIANCE: ['5060', 'Purchase Price Variance', 'EXPENSE', 'Cost of Goods Sold'],
  SCRAP_LOSS: ['5050', 'Inward Scrap & Rejection Loss', 'EXPENSE', 'Cost of Goods Sold'],
  FREIGHT_INWARD: ['5070', 'Freight & Charges Inward', 'EXPENSE', 'Cost of Goods Sold'],
} as const satisfies Record<string, readonly [string, string, AccType, string]>;

export type AccDef = (typeof ACC)[keyof typeof ACC];

export async function ensureAccount(def: readonly [string, string, AccType, string]) {
  const [code, name, type, category] = def;
  return Account.findOneAndUpdate({ code }, { $setOnInsert: { code, name, type, category, balance: 0 } }, { upsert: true, new: true });
}

// Throws if the date falls inside a locked period (see Period Lock settings)
export async function assertPeriodOpen(kind: 'ACCOUNTING' | 'INVENTORY', date: Date = new Date()) {
  const lock = await PeriodLock.findOne({ kind }).lean() as any;
  if (lock && date <= new Date(lock.lockedUpTo)) {
    throw new Error(`${kind === 'ACCOUNTING' ? 'Accounting' : 'Inventory'} period is locked up to ${new Date(lock.lockedUpTo).toISOString().slice(0, 10)}. Entries on or before that date are not allowed.`);
  }
}

export interface JournalLine { acc: readonly [string, string, AccType, string] | { code: string }; debit?: number; credit?: number; notes?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Posts a balanced journal entry and updates ledger balances. Throws if unbalanced or period locked. */
export async function postJournal(input: { date?: Date; description: string; reference?: string; referenceType?: string; lines: JournalLine[]; createdBy?: string }) {
  const date = input.date || new Date();
  await assertPeriodOpen('ACCOUNTING', date);
  const lines = input.lines.filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0);
  const totalDebit = r2(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = r2(lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (!lines.length || totalDebit !== totalCredit) throw new Error(`Journal is not balanced (Dr ${totalDebit} vs Cr ${totalCredit}).`);

  const resolved = [];
  for (const l of lines) {
    let acct: any;
    if (Array.isArray(l.acc)) acct = await ensureAccount(l.acc as any);
    else {
      const code = (l.acc as any).code;
      acct = await Account.findOne({ code });
      // Standard ledgers are created on first use; anything else must already exist in the chart of accounts
      const std = Object.values(ACC).find(a => a[0] === code);
      if (!acct && std) acct = await ensureAccount(std);
    }
    if (!acct) throw new Error(`Ledger account ${(l.acc as any).code} does not exist in the chart of accounts.`);
    resolved.push({ acct, debit: r2(l.debit || 0), credit: r2(l.credit || 0), notes: l.notes });
  }

  const createdBy = input.createdBy && mongoose.isValidObjectId(input.createdBy) ? input.createdBy : '65f011111111111111111100';
  const entry = await JournalEntry.create({
    entryNumber: await nextDocNumber(JournalEntry, 'JE', 'entryNumber'),
    date, description: input.description, reference: input.reference, referenceType: input.referenceType,
    lines: resolved.map(l => ({ account: l.acct._id, debit: l.debit, credit: l.credit, notes: l.notes })),
    totalDebit, totalCredit, status: 'POSTED', createdBy,
  });
  for (const l of resolved) {
    const debitNature = l.acct.type === 'ASSET' || l.acct.type === 'EXPENSE';
    await Account.updateOne({ _id: l.acct._id }, { $inc: { balance: debitNature ? l.debit - l.credit : l.credit - l.debit } });
  }
  return entry;
}

/** Reverses a posted journal entry (balances back, entry removed). Used when the document that goes with it could not be saved. */
export async function revertJournal(entry: any) {
  const accounts: any[] = await Account.find({ _id: { $in: entry.lines.map((l: any) => l.account) } }).lean();
  for (const l of entry.lines) {
    const acct = accounts.find(a => String(a._id) === String(l.account));
    if (!acct) continue;
    const debitNature = acct.type === 'ASSET' || acct.type === 'EXPENSE';
    await Account.updateOne({ _id: acct._id }, { $inc: { balance: -(debitNature ? l.debit - l.credit : l.credit - l.debit) } });
  }
  await JournalEntry.deleteOne({ _id: entry._id });
}

/** Undoes a voucher made by postVoucher: its journal entry is reversed and the voucher removed. Used when a later step of the same operation fails. */
export async function revertVoucher(voucher: any) {
  const entry = await JournalEntry.findById(voucher.journalEntry).lean();
  if (entry) await revertJournal(entry);
  await Voucher.deleteOne({ _id: voucher._id });
}

const VOUCHER_PREFIX: Record<VoucherType, string> = {
  DEBIT_NOTE: 'DN', CREDIT_NOTE: 'CN', BANK_PAYMENT: 'BP', BANK_RECEIPT: 'BR', CASH_PAYMENT: 'CP',
  CASH_RECEIPT: 'CR', PETTY_CASH: 'PC', EXPENSE: 'EX', JOURNAL: 'JV', CONTRA: 'CT',
};

/** Creates a voucher document and its journal entry together. `lines` use account codes (auto-created from ACC when known). */
export async function postVoucher(input: {
  type: VoucherType; date?: Date; lines: { acc: any; debit?: number; credit?: number }[];
  amount: number; narration?: string; createdBy?: string; extra?: Record<string, any>;
}) {
  const number = await nextDocNumber(Voucher, VOUCHER_PREFIX[input.type], 'number');
  const entry = await postJournal({
    date: input.date, description: `${input.type.replace('_', ' ')} ${number}${input.narration ? ` - ${input.narration}` : ''}`,
    reference: number, referenceType: input.type, lines: input.lines, createdBy: input.createdBy,
  });
  const resolvedLines = input.lines.filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0).map(l => ({
    accountCode: l.acc[0] ?? l.acc.code, accountName: l.acc[1], debit: l.debit || 0, credit: l.credit || 0,
  }));
  try {
    return await Voucher.create({ number, type: input.type, date: input.date || new Date(), amount: input.amount, narration: input.narration, lines: resolvedLines, journalEntry: entry._id, createdBy: input.createdBy, ...input.extra });
  } catch (err) {
    await revertJournal(entry); // never leave a ledger posting without its voucher
    throw err;
  }
}
