import mongoose from 'mongoose';
import Invoice from '@/models/Invoice';
import Customer from '@/models/Customer';
import Supplier from '@/models/Supplier';
import { randomUUID } from 'crypto';
import Voucher from '@/models/Voucher';
import { postVoucher } from '@/lib/accounting';
import { noteDetails } from '@/lib/gstNote';
import { buildVoucher } from '@/lib/voucherBuilder';
import { HttpError } from '@/lib/httpError';
import type { ApprovalModule } from '@/lib/approvalModules';
import { requestApproval } from '@/lib/approvals';

/** Which approval rule set (if any) a voucher type falls under */
export function approvalModuleFor(type: string): ApprovalModule | null {
  if (type === 'EXPENSE') return 'EXPENSE_VOUCHER';
  if (type === 'BANK_PAYMENT' || type === 'CASH_PAYMENT') return 'PAYMENT_VOUCHER';
  if (type === 'CREDIT_NOTE') return 'CREDIT_NOTE';
  return null;
}

/** Validates the input and returns the amount that approval thresholds are compared with */
export function voucherAmount(input: any): number {
  const built = buildVoucher(input);
  if (built.errors.length) throw new HttpError(400, built.errors[0]);
  return built.amount;
}

/**
 * Everything that can be checked without posting: the entry itself and the invoice it refers to.
 * Used before a voucher is queued for approval, so a request that could never be posted is refused up front.
 */
export async function precheckVoucher(input: any): Promise<number> {
  if (['CREDIT_NOTE', 'DEBIT_NOTE'].includes(input.type) && !input.refInvoiceId) throw new HttpError(400, 'Pick the invoice this note is raised against.');
  await prepareNote(input);
  const amount = voucherAmount(input);
  if (input.refInvoiceId) {
    const invoice: any = await Invoice.findById(input.refInvoiceId).lean();
    if (!invoice) throw new HttpError(404, 'Referenced invoice not found.');
    const outstanding = Math.round((invoice.totalAmount - (invoice.amountPaid || 0) - (invoice.creditedAmount || 0)) * 100) / 100;
    const settles = ['BANK_RECEIPT', 'CASH_RECEIPT', 'BANK_PAYMENT', 'CASH_PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(input.type);
    if (settles && amount > outstanding + 0.005) throw new HttpError(400, `Amount exceeds the invoice outstanding of ${outstanding}.`);
  }
  return amount;
}

/**
 * A credit / debit note: its GST details are checked against the invoice it adjusts and kept on `b.noteDetails`;
 * a rate difference sets the taxable value. Safe to run twice (on request and again when approved).
 */
async function prepareNote(b: any) {
  if (!['CREDIT_NOTE', 'DEBIT_NOTE'].includes(b.type)) return;
  const invoice: any = b.refInvoiceId && mongoose.isValidObjectId(b.refInvoiceId) ? await Invoice.findById(b.refInvoiceId).select('invoiceNumber date').lean() : null;
  const { details, taxableAmount } = noteDetails(b.type, b, invoice);
  b.noteDetails = details;
  b.noteReason = details.reason;
  b.taxableAmount = taxableAmount;
}

/** Applies a voucher to its invoice in one atomic, guarded step. Safe to repeat: the same key is never applied twice. */
export async function settleInvoice(invoiceId: string, key: string, type: string, amount: number, date: Date, voucherNumber?: string) {
  const isPayment = ['BANK_RECEIPT', 'CASH_RECEIPT', 'BANK_PAYMENT', 'CASH_PAYMENT'].includes(type);
  const update: any = { $inc: isPayment ? { amountPaid: amount } : { creditedAmount: amount }, $push: { appliedVouchers: key } };
  if (isPayment) update.$push.paymentHistory = { amount, paymentDate: date, method: type, reference: voucherNumber || key };
  const res: any = await Invoice.findOneAndUpdate({
    _id: invoiceId, appliedVouchers: { $ne: key },
    $expr: { $gte: [{ $subtract: [{ $subtract: ['$totalAmount', { $ifNull: ['$amountPaid', 0] }] }, { $ifNull: ['$creditedAmount', 0] }] }, amount - 0.005] },
  }, update, { returnDocument: 'after' });
  if (!res) {
    const current: any = await Invoice.findById(invoiceId).lean();
    if (current?.appliedVouchers?.includes(key)) return; // already applied by an earlier attempt
    throw new HttpError(409, 'The invoice no longer has that much outstanding.');
  }
  await refreshInvoiceStatus(invoiceId);
}

async function refreshInvoiceStatus(invoiceId: string) {
  const inv: any = await Invoice.findById(invoiceId).lean();
  if (!inv) return;
  const settled = (inv.amountPaid || 0) + (inv.creditedAmount || 0);
  const status = settled >= inv.totalAmount - 0.005 ? 'PAID' : settled > 0 ? 'PARTIAL' : inv.status;
  if (status !== inv.status) await Invoice.updateOne({ _id: invoiceId }, { status });
}

export async function unsettleInvoice(invoiceId: string, key: string, type: string, amount: number) {
  const isPayment = ['BANK_RECEIPT', 'CASH_RECEIPT', 'BANK_PAYMENT', 'CASH_PAYMENT'].includes(type);
  const res = await Invoice.updateOne({ _id: invoiceId, appliedVouchers: key }, { $inc: isPayment ? { amountPaid: -amount } : { creditedAmount: -amount }, $pull: { appliedVouchers: key, ...(isPayment ? { paymentHistory: { reference: key } } : {}) } });
  if (res.modifiedCount) await refreshInvoiceStatus(invoiceId);
}

/**
 * Validates, posts the journal and settles any linked invoice. Used both for direct posting and when an approval
 * request for the voucher is finally approved.
 *
 * Exactly-once: with a `key` (the approval request id) a retry after a partial failure finds the voucher it already
 * created instead of posting a second one. The invoice is claimed atomically before posting, so two vouchers cannot
 * both settle the same balance, and it is released again if the voucher cannot be saved.
 */
export async function createVoucher(b: any, actor: { id?: string; name?: string }, opts: { key?: string } = {}) {
  const key = opts.key || randomUUID();
  await prepareNote(b);
  const built = buildVoucher(b);
  if (built.errors.length) throw new HttpError(400, built.errors[0]);

  const date = b.date ? new Date(b.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid date.');

  // A retry: the voucher already exists, so only make sure the invoice side was applied too
  const existing: any = opts.key ? await Voucher.findOne({ idempotencyKey: key }) : null;
  if (existing) {
    if (b.refInvoiceId) await settleInvoice(b.refInvoiceId, key, b.type, built.amount, date, existing.number);
    return existing;
  }

  // Resolve the party and any linked invoice before posting
  let partyName: string | undefined;
  let invoice: any = null;
  if (b.partyId && mongoose.isValidObjectId(b.partyId)) {
    const party: any = b.partyType === 'SUPPLIER' ? await Supplier.findById(b.partyId).lean() : await Customer.findById(b.partyId).lean();
    partyName = party?.name;
  }
  if (b.refInvoiceId) {
    invoice = await Invoice.findById(b.refInvoiceId).lean();
    if (!invoice) throw new HttpError(404, 'Referenced invoice not found.');
    if (['BANK_RECEIPT', 'CASH_RECEIPT', 'BANK_PAYMENT', 'CASH_PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(b.type) && !partyName) partyName = invoice.parties?.buyer?.name;
  }
  if (['CREDIT_NOTE', 'DEBIT_NOTE'].includes(b.type) && !invoice) throw new HttpError(400, 'Pick the invoice this note is raised against.');

  // claim the invoice balance first (atomic), then post; undo the claim if posting fails
  if (invoice) await settleInvoice(String(invoice._id), key, b.type, built.amount, date);
  try {
    const voucher = await postVoucher({
      type: b.type, date, lines: built.lines, amount: built.amount, narration: b.narration, createdBy: actor.id,
      extra: {
        partyType: b.partyType, partyId: mongoose.isValidObjectId(b.partyId) ? b.partyId : undefined, partyName,
        refDoc: invoice ? { kind: 'INVOICE', number: invoice.invoiceNumber, ...(b.noteDetails ? { date: invoice.date } : {}) } : undefined, // a note keeps the date of the invoice it adjusts
        noteDetails: b.noteDetails,
        taxableAmount: b.taxableAmount ? Number(b.taxableAmount) : undefined, gstPercent: b.gstPercent ? Number(b.gstPercent) : undefined,
        gstAmount: b.gstPercent && b.taxableAmount ? Math.round(Number(b.taxableAmount) * Number(b.gstPercent)) / 100 : undefined,
        tdsAmount: b.tdsPercent && b.taxableAmount ? Math.round(Number(b.taxableAmount) * Number(b.tdsPercent)) / 100 : undefined,
        instrument: { mode: b.type.startsWith('CASH') ? 'CASH' : b.type.startsWith('BANK') ? 'BANK' : undefined, ...b.instrument, bank: b.instrument?.bank },
        costCenter: b.costCenter, category: b.category, attachmentUrl: b.attachmentUrl,
        idempotencyKey: opts.key,
      },
    });
    if (invoice) await Invoice.updateOne({ _id: invoice._id, 'paymentHistory.reference': key }, { $set: { 'paymentHistory.$.reference': voucher.number } }); // show the voucher number, not the key
    return voucher;
  } catch (err) {
    if (invoice) await unsettleInvoice(String(invoice._id), key, b.type, built.amount);
    throw err;
  }
}

/** One-line description shown in the approval inbox */
export function voucherSummary(b: any, amount: number) {
  const inr = `₹${amount.toLocaleString('en-IN')}`;
  const what = b.type === 'EXPENSE' ? 'Expense' : b.type === 'CREDIT_NOTE' ? 'Credit note' : b.type === 'CASH_PAYMENT' ? 'Cash payment' : 'Bank payment';
  return `${what} ${inr}${b.narration ? ` - ${b.narration}` : ''}`;
}

/**
 * Validates a voucher and either posts it or, when an approval rule covers its amount, queues it for approval (nothing is posted until then).
 * Used by the voucher screen and by "release payment" on a vendor bill.
 */
export async function submitVoucher(b: any, user: { id?: string; name?: string; role?: string }, opts: { key?: string } = {}) {
  const amount = await precheckVoucher(b); // validates the entry and its invoice before anything is queued or posted
  const module = approvalModuleFor(b.type);
  if (module) {
    const approval: any = await requestApproval({
      module, refNumber: b.type.replace(/_/g, ' '), amount, requestedBy: user.name || '', requestedById: user.id, requestedByRole: user.role,
      summary: voucherSummary(b, amount),
      payload: { ...b, date: b.date || new Date().toISOString().slice(0, 10) }, // dated when raised, not when approved
    });
    if (approval) return { pending: true as const, approval, amount };
  }
  return { pending: false as const, voucher: await createVoucher(b, user, opts), amount };
}
