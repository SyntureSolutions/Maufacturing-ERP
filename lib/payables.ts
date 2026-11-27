import mongoose from 'mongoose';
import Invoice from '@/models/Invoice';
import PurchaseOrder from '@/models/PurchaseOrder';
import Voucher from '@/models/Voucher';
import { ApprovalRequest } from '@/models/ApprovalMatrix';
import { submitVoucher, settleInvoice } from '@/lib/voucherPosting';
import { HttpError } from '@/lib/httpError';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const outstandingOf = (b: any) => r2((b.totalAmount || 0) - (b.amountPaid || 0) - (b.creditedAmount || 0));

export type PaymentStatus = 'NOT_BILLED' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

/** Where each purchase order stands on payment, worked out from its vendor bills */
export async function purchasePaymentStatus(poIds: any[]): Promise<Map<string, { status: PaymentStatus; billed: number; paid: number; outstanding: number; fullyBilled: boolean }>> {
  const bills: any[] = poIds.length ? await Invoice.find({ type: 'PURCHASE', status: { $ne: 'CANCELLED' }, order: { $in: poIds } }).select('order totalAmount amountPaid creditedAmount').lean() : [];
  const out = new Map<string, { status: PaymentStatus; billed: number; paid: number; outstanding: number; fullyBilled: boolean }>();
  const pos: any[] = poIds.length ? await PurchaseOrder.find({ _id: { $in: poIds } }).select('items.quantity items.billedQuantity').lean() : [];
  for (const id of poIds) {
    // "paid" means the bills raised so far are paid; fullyBilled says whether anything ordered is still waiting for a bill
    const items = pos.find(p => String(p._id) === String(id))?.items || [];
    const fullyBilled = items.length > 0 && items.every((i: any) => (i.billedQuantity || 0) >= i.quantity - 1e-9);
    const mine = bills.filter(b => String(b.order) === String(id));
    const billed = r2(mine.reduce((s, b) => s + b.totalAmount, 0));
    const paid = r2(mine.reduce((s, b) => s + (b.amountPaid || 0) + (b.creditedAmount || 0), 0));
    const status: PaymentStatus = !mine.length ? 'NOT_BILLED' : paid >= billed - 0.005 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    out.set(String(id), { status, billed, paid, outstanding: r2(billed - paid), fullyBilled });
  }
  return out;
}

interface PendingPayment { id: string; amount: number; waitingFor?: string }

/** Payments to suppliers that are waiting for approval, by bill id, oldest request first */
async function pendingByBill(): Promise<Map<string, PendingPayment[]>> {
  const reqs: any[] = await ApprovalRequest.find({ module: 'PAYMENT_VOUCHER', status: 'PENDING' }).select('payload levels currentLevel createdAt').sort({ createdAt: 1, _id: 1 }).lean();
  const out = new Map<string, PendingPayment[]>();
  for (const r of reqs) {
    const bill = r.payload?.refInvoiceId; if (!bill) continue;
    out.set(String(bill), [...(out.get(String(bill)) || []), { id: String(r._id), amount: Number(r.payload.amount || 0), waitingFor: r.levels?.[r.currentLevel]?.role }]);
  }
  return out;
}
const pendingPayments = async () => new Map([...(await pendingByBill())].map(([k, v]) => [k, r2(v.reduce((s, x) => s + x.amount, 0))]));

/** What had been paid against a bill by a given date (from its payment history; credits are taken as they stand) */
const paidBy = (b: any, asOf: Date) => {
  const history = (b.paymentHistory || []) as any[];
  if (!history.length) return r2((b.amountPaid || 0) + (b.creditedAmount || 0)); // older bills without a payment history: what is recorded now
  return r2(history.filter(h => new Date(h.paymentDate) <= asOf).reduce((t, h) => t + (h.amount || 0), 0) + (b.creditedAmount || 0));
};

/**
 * Accounts payable: every vendor bill that still has something to pay, oldest due date first.
 * `asOf` looks back: only bills dated up to then, and only payments made up to then, are counted.
 */
export async function listPayables(opts: { asOf?: Date; supplier?: string; overdueOnly?: boolean } = {}) {
  const asOf = opts.asOf || new Date();
  const filter: any = { type: 'PURCHASE', status: { $nin: ['CANCELLED', 'DRAFT'] }, date: { $lte: asOf } };
  if (opts.supplier && mongoose.isValidObjectId(opts.supplier)) filter.supplier = opts.supplier;
  const bills: any[] = await Invoice.find(filter).populate('supplier', 'name code').sort({ dueDate: 1 }).lean();
  const pending = await pendingByBill();
  const rows = bills.map(b => {
    const paid = paidBy(b, asOf), outstanding = r2(b.totalAmount - paid);
    const overdueDays = b.dueDate ? Math.max(0, Math.floor((asOf.getTime() - new Date(b.dueDate).getTime()) / 86400000)) : 0;
    const waiting = pending.get(String(b._id)) || [];
    return {
      _id: String(b._id), invoiceNumber: b.invoiceNumber, vendorBillNumber: b.vendorBillNumber, supplier: b.supplier, poNumber: b.poNumber, soNumber: b.soNumber,
      date: b.date, dueDate: b.dueDate, totalAmount: b.totalAmount, paid, outstanding, overdueDays,
      paymentStatus: paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID', pendingApproval: r2(waiting.reduce((t, x) => t + x.amount, 0)),
      waitingFor: [...new Set(waiting.map(x => x.waitingFor).filter(Boolean))] as string[],
      note: b.soNumber ? `Material received for ${b.soNumber}.` : undefined,
    };
  }).filter(r => r.outstanding > 0.004 && (!opts.overdueOnly || r.overdueDays > 0));
  return { asOf, rows, totals: { outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)), overdue: r2(rows.filter(r => r.overdueDays > 0).reduce((s, r) => s + r.outstanding, 0)), pendingApproval: r2(rows.reduce((s, r) => s + r.pendingApproval, 0)) } };
}

const csvCell = (v: any) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function payablesCsv(rows: any[]) {
  const head = ['Bill', "Supplier's bill no.", 'Supplier', 'PO', 'Sales order', 'Bill date', 'Due date', 'Total', 'Paid', 'Outstanding', 'Days overdue', 'Waiting for approval', 'Approver'];
  const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  return [head, ...rows.map(r => [r.invoiceNumber, r.vendorBillNumber, r.supplier?.name, r.poNumber, r.soNumber, day(r.date), day(r.dueDate), r.totalAmount, r.paid, r.outstanding, r.overdueDays, r.pendingApproval || '', r.waitingFor.join(' / ')])].map(l => l.map(csvCell).join(',')).join('\n');
}

export interface PayInput { requestId?: string; amount?: number; mode?: 'BANK' | 'CASH'; utr?: string; chequeNo?: string; date?: string; narration?: string }

/**
 * Releases a payment against one vendor bill. Posts the payment (or queues it for approval when a rule covers the amount) and settles the bill.
 * Refuses amounts above what is still owed, counting payments already waiting for approval, and a UTR that was already used.
 */
export async function releasePayment(billId: string, input: PayInput, user: { id?: string; name?: string; role?: string }) {
  if (!mongoose.isValidObjectId(billId)) throw new HttpError(404, 'Vendor bill not found.');
  const bill: any = await Invoice.findOne({ _id: billId, type: 'PURCHASE' }).lean();
  if (!bill) throw new HttpError(404, 'Vendor bill not found.');
  if (bill.status === 'CANCELLED') throw new HttpError(409, 'This bill is cancelled.');
  const outstanding = outstandingOf(bill);
  if (outstanding <= 0.004) throw new HttpError(409, 'This bill is already paid.');

  // the same request sent twice (double click, retry after a timeout) finds what the first one did instead of paying again
  const requestId = String(input.requestId || '').trim().slice(0, 64);
  const key = requestId ? `pay:${bill._id}:${requestId}` : undefined;
  if (key) {
    const done: any = await Voucher.findOne({ idempotencyKey: key }).lean();
    if (done) return { pending: false as const, voucher: done, amount: done.amount, billId: String(bill._id), billNumber: bill.invoiceNumber, duplicate: true };
    // a request that was queued: still waiting, or already approved and posted under the approval's own key (a rejected one may be tried again)
    const queued: any = await ApprovalRequest.findOne({ module: 'PAYMENT_VOUCHER', status: { $in: ['PENDING', 'APPROVED'] }, 'payload.requestId': requestId, 'payload.refInvoiceId': String(bill._id) });
    if (queued?.status === 'PENDING') return { pending: true as const, approval: queued, amount: Number(queued.payload.amount), billId: String(bill._id), billNumber: bill.invoiceNumber, duplicate: true };
    if (queued) {
      const posted: any = await Voucher.findOne({ idempotencyKey: String(queued._id) }).lean();
      if (posted) return { pending: false as const, voucher: posted, amount: posted.amount, billId: String(bill._id), billNumber: bill.invoiceNumber, duplicate: true };
    }
  }

  const mode = input.mode === 'CASH' ? 'CASH' : 'BANK';
  const amount = r2(input.amount === undefined || input.amount === null || (input.amount as any) === '' ? outstanding : Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than zero.');
  const waiting = (await pendingPayments()).get(String(bill._id)) || 0;
  if (amount > r2(outstanding - waiting) + 0.005) {
    throw new HttpError(409, waiting > 0
      ? `Only ${r2(outstanding - waiting)} can be paid now: ${outstanding} is outstanding and ${waiting} is already waiting for approval.`
      : `Amount exceeds the bill outstanding of ${outstanding}.`);
  }
  const utr = String(input.utr || '').trim(), chequeNo = String(input.chequeNo || '').trim();
  if (mode === 'BANK' && !utr && !chequeNo) throw new HttpError(400, 'Enter the UTR (or cheque number) of the bank transfer.');
  if (utr && (await Voucher.exists({ status: 'POSTED', 'instrument.utr': utr }) || await ApprovalRequest.exists({ module: 'PAYMENT_VOUCHER', status: 'PENDING', 'payload.instrument.utr': utr }))) throw new HttpError(409, `UTR ${utr} has already been used on another payment.`);
  if (input.date) {
    const when = new Date(input.date);
    if (Number.isNaN(when.getTime())) throw new HttpError(400, 'Invalid payment date.');
    if (when.getTime() > Date.now() + 86400000) throw new HttpError(400, 'The payment date cannot be in the future.');
  }

  let result: Awaited<ReturnType<typeof submitVoucher>>;
  try {
    result = await submitVoucher({
      type: mode === 'CASH' ? 'CASH_PAYMENT' : 'BANK_PAYMENT', amount, partyType: 'SUPPLIER', partyId: String(bill.supplier), refInvoiceId: String(bill._id),
      requestId: requestId || undefined, date: input.date, instrument: mode === 'BANK' ? { utr: utr || undefined, chequeNo: chequeNo || undefined } : undefined,
      narration: input.narration || `Payment of ${bill.vendorBillNumber || bill.invoiceNumber}${bill.poNumber ? ` (${bill.poNumber})` : ''}`,
    }, user, { key });
  } catch (err: any) {
    // a payment that lost a race for the same balance is a conflict (409), like the other refusals here
    if (err instanceof HttpError && err.status === 400 && /exceeds the invoice outstanding/.test(err.message)) throw new HttpError(409, err.message);
    throw err;
  }

  // Two payments queued at the same moment can each look fine alone. If together they are more than is owed, take this one back.
  if (result.pending) {
    // Requests are ranked by when they were raised; each one is kept only if it still fits after the ones ahead of it,
    // so when two are raised together the earlier one stays and the later one is taken back.
    let room = outstanding;
    for (const q of (await pendingByBill()).get(String(bill._id)) || []) {
      if (q.amount > room + 0.005) {
        if (q.id === String(result.approval._id)) {
          await ApprovalRequest.deleteOne({ _id: result.approval._id });
          throw new HttpError(409, `Another payment for this bill was requested at the same time; only ${r2(Math.max(0, room))} is left to pay. Check the approval inbox.`);
        }
        continue;
      }
      room = r2(room - q.amount);
    }
  }
  return { ...result, billId: String(bill._id), billNumber: bill.invoiceNumber };
}

// ---------------- advances: payments made to a supplier before there was a bill ----------------

export const advanceRemaining = (v: any, asOf = new Date()) => r2((v.amount || 0) - ((v.allocations || []) as any[]).filter(a => new Date(a.at) <= asOf).reduce((t, a) => t + (a.amount || 0), 0));

/** Unapplied advance payments to a supplier (a bank/cash payment with no bill attached), oldest first */
export async function listAdvances(supplierId: string) {
  if (!mongoose.isValidObjectId(supplierId)) return [];
  const vouchers: any[] = await Voucher.find({ type: { $in: ['BANK_PAYMENT', 'CASH_PAYMENT'] }, partyType: 'SUPPLIER', partyId: supplierId, refDoc: { $exists: false }, status: 'POSTED' }).sort({ date: 1 }).lean();
  return vouchers.map(v => ({ _id: String(v._id), number: v.number, date: v.date, amount: v.amount, remaining: advanceRemaining(v), utr: v.instrument?.utr, narration: v.narration })).filter(v => v.remaining > 0.004);
}

/**
 * Applies part or all of an advance payment to a vendor bill of the same supplier. The money was already paid (payables were reduced when
 * the advance was posted), so no journal entry is made: the bill is simply settled from it and the advance is used up by the same amount.
 * Both steps are guarded updates, so two people cannot apply more than the advance holds or more than the bill owes.
 */
export async function applyAdvance(billId: string, voucherId: string, requested: number | undefined, user: { id?: string; name?: string }) {
  if (!mongoose.isValidObjectId(billId)) throw new HttpError(404, 'Vendor bill not found.');
  if (!mongoose.isValidObjectId(voucherId)) throw new HttpError(404, 'Advance payment not found.');
  const bill: any = await Invoice.findOne({ _id: billId, type: 'PURCHASE' }).lean();
  if (!bill) throw new HttpError(404, 'Vendor bill not found.');
  if (bill.status === 'CANCELLED') throw new HttpError(409, 'This bill is cancelled.');
  const advance: any = await Voucher.findOne({ _id: voucherId, type: { $in: ['BANK_PAYMENT', 'CASH_PAYMENT'] }, partyType: 'SUPPLIER', refDoc: { $exists: false }, status: 'POSTED' }).lean();
  if (!advance) throw new HttpError(404, 'Advance payment not found.');
  if (String(advance.partyId) !== String(bill.supplier)) throw new HttpError(409, 'That advance was paid to a different supplier.');

  const outstanding = outstandingOf(bill), remaining = advanceRemaining(advance);
  if (outstanding <= 0.004) throw new HttpError(409, 'This bill is already paid.');
  if (remaining <= 0.004) throw new HttpError(409, 'That advance has already been fully applied.');
  const amount = r2(requested === undefined || requested === null || (requested as any) === '' ? Math.min(outstanding, remaining) : Number(requested));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than zero.');
  if (amount > remaining + 0.005) throw new HttpError(409, `Only ${remaining} of that advance is left.`);
  if (amount > outstanding + 0.005) throw new HttpError(409, `Amount exceeds the bill outstanding of ${outstanding}.`);

  const allocationId = new mongoose.Types.ObjectId();
  const at = new Date();
  // 1. take it from the advance (guarded: it must still hold that much)
  const claimed = await Voucher.findOneAndUpdate(
    { _id: voucherId, status: 'POSTED', refDoc: { $exists: false }, $expr: { $gte: [{ $subtract: ['$amount', { $sum: { $ifNull: ['$allocations.amount', []] } }] }, amount - 0.005] } },
    { $push: { allocations: { _id: allocationId, invoice: bill._id, invoiceNumber: bill.invoiceNumber, amount, at, by: user.name } } }, { new: true });
  if (!claimed) throw new HttpError(409, 'That advance no longer has that much left.');
  // 2. give it to the bill (guarded: it must still owe that much); give the advance back if that fails
  try {
    await settleInvoice(String(bill._id), `adv:${allocationId}`, 'BANK_PAYMENT', amount, at, `${advance.number} (advance)`);
  } catch (err) {
    await Voucher.updateOne({ _id: voucherId }, { $pull: { allocations: { _id: allocationId } } });
    throw err;
  }
  return { billNumber: bill.invoiceNumber, advanceNumber: advance.number, amount, advanceLeft: advanceRemaining(claimed), billOutstanding: r2(outstanding - amount) };
}
