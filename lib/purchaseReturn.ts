import mongoose from 'mongoose';
import GRN from '@/models/GRN';
import PurchaseOrder from '@/models/PurchaseOrder';
import PurchaseReturn from '@/models/PurchaseReturn';
import Invoice from '@/models/Invoice';
import Batch from '@/models/Batch';
import { ACC, postVoucher, assertPeriodOpen } from '@/lib/accounting';
import { settleInvoice, unsettleInvoice } from '@/lib/voucherPosting';
import { unbilledLines } from '@/lib/creditorAging';
import { acceptedLines } from '@/lib/vendorBill';
import { nextDocNumber } from '@/lib/docNumber';
import { HttpError } from '@/lib/httpError';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface ReturnInput { grnId: string; billId?: string; reason?: string; lines: { index: number; quantity: number; reason?: string }[] }

/**
 * Sends accepted goods back to the vendor after they were received, inspected and possibly billed.
 *  - The part that was never billed is returned at the receipt price with no GST (GST reaches the books only when a bill does).
 *  - The part that was already billed needs the bill it came from (`billId`): the debit note reverses its value, its GST and any
 *    price difference, and the bill's outstanding falls by that amount. A bill that is already paid cannot be credited: the vendor owes a refund.
 * Stock, the receipt, the order's received and billed counters and the books all move together; each step is guarded and undone if a later one fails.
 */
export async function returnAfterBilling(input: ReturnInput, user: { id?: string; name?: string }) {
  if (!mongoose.isValidObjectId(input.grnId)) throw new HttpError(404, 'Goods receipt not found.');
  const grn: any = await GRN.findById(input.grnId);
  if (!grn) throw new HttpError(404, 'Goods receipt not found.');
  const po: any = await PurchaseOrder.findById(grn.po);
  if (!po) throw new HttpError(404, 'Purchase order not found.');
  if (!Array.isArray(input.lines) || !input.lines.length) throw new HttpError(400, 'Choose at least one item to return.');
  await assertPeriodOpen('INVENTORY');
  await assertPeriodOpen('ACCOUNTING');

  // what has been billed, oldest receipts first, so we know how much of each line is still unbilled
  const left = unbilledLines(await acceptedLines([String(po._id)]), new Map(po.items.map((i: any) => [`${po._id}|${i.product}`, i.billedQuantity || 0])));

  const seen = new Set<number>();
  const plan: { index: number; item: any; qty: number; fromUnbilled: number; fromBilled: number; reason?: string }[] = [];
  for (const l of input.lines) {
    const index = Number(l.index), qty = r4(Number(l.quantity));
    const item = grn.items[index];
    if (!Number.isInteger(index) || !item) throw new HttpError(400, 'One of the items is not on this goods receipt.');
    if (seen.has(index)) throw new HttpError(400, 'An item can appear only once.');
    seen.add(index);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'Quantities must be greater than zero.');
    if (item.inspection === 'PENDING') throw new HttpError(409, 'That delivery has not been inspected yet. Reject it at inspection instead.');
    if (item.nonStock) throw new HttpError(409, 'That item is not kept in stock: it was expensed when accepted. To get money back for it, raise a debit note to the supplier in Accounts.');
    if (qty > (item.acceptedQty || 0) + 1e-9) throw new HttpError(409, `Only ${item.acceptedQty || 0} of that delivery is accepted stock; ${qty} cannot be returned.`);
    const unbilled = left.find(x => x.grnNumber === grn.number && x.product === String(item.product))?.unbilledQty || 0;
    const fromUnbilled = Math.min(qty, unbilled);
    plan.push({ index, item, qty, fromUnbilled: r4(fromUnbilled), fromBilled: r4(qty - fromUnbilled), reason: l.reason });
  }

  // the billed part must come from a bill of this order that still has that many units on it
  let bill: any = null;
  const billedValue = new Map<number, { value: number; gst: number }>();
  const needBill = plan.some(p => p.fromBilled > 1e-9);
  if (needBill) {
    if (!input.billId || !mongoose.isValidObjectId(input.billId)) {
      // if the receipt changed while we were reading it (another return went through), that is a conflict, not a missing bill
      const now: any = await GRN.findById(grn._id).select('items.acceptedQty').lean();
      if (plan.some(p => p.qty > (now?.items?.[p.index]?.acceptedQty ?? 0) + 1e-9)) throw new HttpError(409, 'The goods receipt changed while you were working. Reload and try again.');
      throw new HttpError(400, 'Part of this was already billed. Choose the vendor bill it was billed on.');
    }
    bill = await Invoice.findOne({ _id: input.billId, type: 'PURCHASE', order: po._id }).lean();
    if (!bill) throw new HttpError(404, 'That vendor bill is not a bill of this purchase order.');
    if (bill.status === 'CANCELLED') throw new HttpError(409, 'That bill is cancelled.');
    for (const p of plan.filter(x => x.fromBilled > 1e-9)) {
      const line = (bill.items || []).find((i: any) => String(i.product) === String(p.item.product));
      const room = line ? r4(line.quantity - (line.returnedQty || 0)) : 0;
      if (!line || p.fromBilled > room + 1e-9) throw new HttpError(409, `That bill has only ${room} of this item left to credit, but ${p.fromBilled} was billed goods being returned.`);
      const gstTotal = (line.cgstAmount || 0) + (line.sgstAmount || 0) + (line.igstAmount || 0);
      billedValue.set(p.index, { value: r2(p.fromBilled * line.unitPrice), gst: r2(gstTotal * p.fromBilled / line.quantity) });
    }
  }

  // amounts
  let inventory = 0, variance = 0, gst = 0, payablesDebit = 0, baseAmount = 0;
  for (const p of plan) {
    const receipt = r2(p.qty * p.item.unitPrice);
    inventory += receipt;
    const b = billedValue.get(p.index);
    const unbilledPart = r2(p.fromUnbilled * p.item.unitPrice);
    const billedPart = b ? b.value : 0;
    payablesDebit += unbilledPart + billedPart + (b?.gst || 0);
    baseAmount += unbilledPart + billedPart;
    gst += b?.gst || 0;
    variance += billedPart - r2(p.fromBilled * p.item.unitPrice);          // billed above receipt cost: that extra cost was booked as variance
  }
  inventory = r2(inventory); variance = r2(variance); gst = r2(gst); payablesDebit = r2(payablesDebit); baseAmount = r2(baseAmount);
  const billedCredit = r2(plan.reduce((s, p) => s + (billedValue.get(p.index)?.value || 0) + (billedValue.get(p.index)?.gst || 0), 0));
  if (bill) {
    const outstanding = r2(bill.totalAmount - (bill.amountPaid || 0) - (bill.creditedAmount || 0));
    if (billedCredit > outstanding + 0.005) throw new HttpError(409, `The bill only has ${outstanding} outstanding but ${billedCredit} would be credited. It has been paid: ask the supplier for a refund instead.`);
  }

  // ---- do it, step by step, undoing what is done if a later step fails
  const undo: (() => Promise<any>)[] = [];
  const key = `ret:${new mongoose.Types.ObjectId()}`;
  const date = new Date();
  try {
    if (bill && billedCredit > 0) {
      await settleInvoice(String(bill._id), key, 'DEBIT_NOTE', billedCredit, date);
      undo.push(() => unsettleInvoice(String(bill._id), key, 'DEBIT_NOTE', billedCredit));
    }
    for (const p of plan) {
      // stock: the goods must still be there, unreserved
      const taken = await Batch.updateOne({ _id: p.item.batch, $expr: { $gte: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, p.qty - 1e-9] } }, { $inc: { currentQuantity: -p.qty } });
      if (!taken.modifiedCount) throw new HttpError(409, `${p.qty} of that delivery is no longer free in stock (it may have been used or reserved).`);
      undo.push(() => Batch.updateOne({ _id: p.item.batch }, { $inc: { currentQuantity: p.qty } }));
      // the receipt: accepted falls, returned rises
      const g = await GRN.updateOne({ _id: grn._id, items: { $elemMatch: { _id: p.item._id, acceptedQty: { $gte: p.qty - 1e-9 } } } }, { $inc: { 'items.$.acceptedQty': -p.qty, 'items.$.returnQty': p.qty } });
      if (!g.modifiedCount) throw new HttpError(409, 'The goods receipt changed while you were working. Reload and try again.');
      undo.push(() => GRN.updateOne({ _id: grn._id, 'items._id': p.item._id }, { $inc: { 'items.$.acceptedQty': p.qty, 'items.$.returnQty': -p.qty } }));
      // the order: received (and billed) quantities fall
      await PurchaseOrder.updateOne({ _id: po._id }, { $inc: { 'items.$[li].receivedQuantity': -p.qty, 'items.$[li].billedQuantity': -p.fromBilled } }, { arrayFilters: [{ 'li.product': p.item.product }] });
      undo.push(() => PurchaseOrder.updateOne({ _id: po._id }, { $inc: { 'items.$[li].receivedQuantity': p.qty, 'items.$[li].billedQuantity': p.fromBilled } }, { arrayFilters: [{ 'li.product': p.item.product }] }));
      if (billedValue.has(p.index) && p.fromBilled > 0) {
        await Invoice.updateOne({ _id: bill._id }, { $inc: { 'items.$[li].returnedQty': p.fromBilled } }, { arrayFilters: [{ 'li.product': p.item.product }] });
        undo.push(() => Invoice.updateOne({ _id: bill._id }, { $inc: { 'items.$[li].returnedQty': -p.fromBilled } }, { arrayFilters: [{ 'li.product': p.item.product }] }));
      }
    }

    // the debit note: payables down by what is credited; inventory out at receipt cost; price difference and GST reversed
    const lines: any[] = [{ acc: ACC.AP, debit: payablesDebit }, { acc: ACC.INV_RM, credit: inventory }];
    if (variance > 0) lines.push({ acc: ACC.PURCHASE_PRICE_VARIANCE, credit: variance });
    else if (variance < 0) lines.push({ acc: ACC.PURCHASE_PRICE_VARIANCE, debit: -variance });
    if (gst > 0) lines.push({ acc: ACC.GST_INPUT, credit: gst });
    const debitNote = await postVoucher({
      type: 'DEBIT_NOTE', date, amount: payablesDebit, narration: `Return to vendor against ${grn.number}${input.reason ? ` - ${input.reason}` : ''}`, createdBy: user.id, lines,
      extra: { partyType: 'SUPPLIER', partyId: grn.supplier, refDoc: bill ? { kind: 'INVOICE', number: bill.invoiceNumber, date: bill.date } : { kind: 'GRN', number: grn.number }, taxableAmount: baseAmount, gstAmount: gst,
        noteDetails: { reason: 'PURCHASE_RETURN', ...(bill ? { originalDate: bill.date } : {}) } },
    });

    // the order is complete again only if everything ordered is still received
    const fresh: any = await PurchaseOrder.findById(po._id);
    fresh.status = fresh.items.every((i: any) => (i.receivedQuantity || 0) >= i.quantity) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await fresh.save();

    return await PurchaseReturn.create({
      number: await nextDocNumber(PurchaseReturn, 'RTV'), grn: grn._id, grnNumber: grn.number, supplier: grn.supplier,
      items: plan.map(p => ({ product: p.item.product, quantity: p.qty, unitPrice: p.item.unitPrice, reason: p.reason || input.reason })),
      baseAmount, gstPercent: baseAmount > 0 ? r2(gst * 100 / baseAmount) : 0, gstAmount: gst, totalAmount: payablesDebit,
      debitNote: debitNote._id, debitNoteNumber: debitNote.number, afterBilling: needBill, bill: bill?._id, billNumber: bill?.invoiceNumber,
    });
  } catch (err) {
    for (const u of undo.reverse()) await u().catch(() => {});
    throw err;
  }
}
