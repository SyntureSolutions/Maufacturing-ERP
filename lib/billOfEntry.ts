import mongoose from 'mongoose';
import BillOfEntry from '@/models/BillOfEntry';
import GRN from '@/models/GRN';
import Batch from '@/models/Batch';
import { ACC, postJournal, assertPeriodOpen, revertJournal } from '@/lib/accounting';
import JournalEntry from '@/models/JournalEntry';
import { HttpError } from '@/lib/httpError';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface BoeInput {
  number: string; date: string; port: string; grnId: string;
  assessableValue?: number; bcd?: number; sws?: number; igst?: number; otherCharges?: number;
  mode?: 'BANK' | 'CASH'; paymentRef?: string; currency?: string; exchangeRate?: number;
}

const money = (v: any, label: string) => {
  const n = v === undefined || v === null || v === '' ? 0 : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be zero or more.`);
  return r2(n);
};

/**
 * Records a Bill of Entry against a goods receipt. The duties are paid at once (bank or cash):
 *   Dr Raw material inventory (customs duty, surcharge and other charges: they become part of the goods' cost)
 *   Dr Input GST (IGST on imports, claimable)
 *   Cr Bank or Cash
 * and the duty is spread over the receipt's batches by value, so cost of goods later includes it.
 */
export async function recordBillOfEntry(input: BoeInput, user: { id?: string; name?: string }) {
  const number = String(input.number || '').trim(), port = String(input.port || '').trim();
  if (!number) throw new HttpError(400, 'Enter the Bill of Entry number.');
  if (!port) throw new HttpError(400, 'Enter the port of import.');
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Enter the Bill of Entry date.');
  if (date.getTime() > Date.now() + 86400000) throw new HttpError(400, 'The Bill of Entry date cannot be in the future.');
  if (!mongoose.isValidObjectId(input.grnId)) throw new HttpError(404, 'Goods receipt not found.');

  const bcd = money(input.bcd, 'Customs duty'), sws = money(input.sws, 'Surcharge'), igst = money(input.igst, 'IGST'), other = money(input.otherCharges, 'Other charges');
  const assessable = money(input.assessableValue, 'Assessable value');
  const dutyForCost = r2(bcd + sws + other), total = r2(dutyForCost + igst);
  if (total <= 0) throw new HttpError(400, 'A Bill of Entry needs some duty, tax or charges to book.');
  const mode = input.mode === 'CASH' ? 'CASH' : 'BANK';
  if (mode === 'BANK' && !String(input.paymentRef || '').trim()) throw new HttpError(400, 'Enter the challan / UTR of the duty payment.');

  const grn: any = await GRN.findById(input.grnId).lean();
  if (!grn) throw new HttpError(404, 'Goods receipt not found.');
  if (await BillOfEntry.exists({ number, port, status: 'POSTED' })) throw new HttpError(409, `Bill of Entry ${number} at ${port} is already recorded.`);
  if (await BillOfEntry.exists({ grn: grn._id, status: 'POSTED' })) throw new HttpError(409, `${grn.number} already has a Bill of Entry. Cancel it first to record another.`);
  await assertPeriodOpen('ACCOUNTING', date);

  // the batches the goods went into: the duty raises their cost per unit, in proportion to value
  const batches: any[] = await Batch.find({ grn: grn._id }).lean();
  const value = batches.reduce((s, b) => s + b.initialQuantity * b.purchasePrice, 0);
  const uplift: { batch: any; perUnit: number }[] = [];
  if (dutyForCost > 0 && batches.length) {
    for (const b of batches) {
      const share = value > 0 ? (b.initialQuantity * b.purchasePrice) / value : 1 / batches.length;
      uplift.push({ batch: b._id, perUnit: r4((dutyForCost * share) / b.initialQuantity) });
    }
  }

  const journal = await postJournal({
    date, description: `Bill of Entry ${number} (${port}) for ${grn.number}`, reference: number, referenceType: 'BILL_OF_ENTRY', createdBy: user.id,
    lines: [{ acc: ACC.INV_RM, debit: dutyForCost }, { acc: ACC.GST_INPUT, debit: igst }, { acc: mode === 'CASH' ? ACC.CASH : ACC.BANK, credit: total }],
  });
  try {
    for (const u of uplift) await Batch.updateOne({ _id: u.batch }, { $inc: { purchasePrice: u.perUnit } });
    return await BillOfEntry.create({
      number, date, port, po: grn.po, poNumber: grn.poNumber, grn: grn._id, grnNumber: grn.number, supplier: grn.supplier,
      currency: input.currency, exchangeRate: input.exchangeRate, assessableValue: assessable, bcd, sws, igst, otherCharges: other, dutyForCost, totalPaid: total,
      mode, paymentRef: String(input.paymentRef || '').trim() || undefined, journalEntry: journal._id, costUplift: uplift, createdBy: user.id,
    });
  } catch (err) {
    for (const u of uplift) await Batch.updateOne({ _id: u.batch }, { $inc: { purchasePrice: -u.perUnit } }).catch(() => {});
    await revertJournal(journal).catch(() => {});
    throw err;
  }
}

/** Cancels a Bill of Entry: the books get an opposite entry and each batch's cost goes back to what it was */
export async function cancelBillOfEntry(id: string, reason: string, user: { id?: string; name?: string }) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Bill of Entry not found.');
  const boe: any = await BillOfEntry.findById(id).lean();
  if (!boe) throw new HttpError(404, 'Bill of Entry not found.');
  if (boe.status === 'CANCELLED') throw new HttpError(409, 'This Bill of Entry is already cancelled.');
  await assertPeriodOpen('ACCOUNTING');
  const claimed = await BillOfEntry.findOneAndUpdate({ _id: id, status: 'POSTED' }, { status: 'CANCELLED', cancelReason: reason }, { new: false });
  if (!claimed) throw new HttpError(409, 'It was changed by someone else. Reload and try again.');
  try {
    const original: any = await JournalEntry.findById(boe.journalEntry).lean();
    const Account = (await import('@/models/Account')).default as any;
    const accounts: any[] = await Account.find({ _id: { $in: original.lines.map((l: any) => l.account) } }).lean();
    await postJournal({
      description: `Reversal of Bill of Entry ${boe.number}`, reference: boe.number, referenceType: 'BILL_OF_ENTRY_REVERSAL', createdBy: user.id,
      lines: original.lines.map((l: any) => ({ acc: { code: accounts.find(a => String(a._id) === String(l.account))?.code }, debit: l.credit, credit: l.debit })),
    });
  } catch (err) {
    await BillOfEntry.updateOne({ _id: id }, { status: 'POSTED', $unset: { cancelReason: 1 } });
    throw err;
  }
  for (const u of boe.costUplift || []) await Batch.updateOne({ _id: u.batch }, { $inc: { purchasePrice: -u.perUnit } });
  return { number: boe.number, status: 'CANCELLED' };
}
