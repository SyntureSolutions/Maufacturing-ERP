import mongoose from 'mongoose';
import PurchaseOrder from '@/models/PurchaseOrder';
import Supplier from '@/models/Supplier';
import Product from '@/models/Product';
import Invoice from '@/models/Invoice';
import CompanySettings from '@/models/CompanySettings';
import { ACC, assertPeriodOpen, postJournal, revertJournal } from '@/lib/accounting';
import { chargesTotal, cleanCharges, unbilledCharges } from '@/lib/docCharges';
import { computeTax, stateCodeOf } from '@/lib/gst';
import { nextDocNumber } from '@/lib/docNumber';
import GRN from '@/models/GRN';
import SalesOrder from '@/models/SalesOrder';
import { unbilledLines, ReceivedLine, UnbilledLine } from '@/lib/creditorAging';
import { HttpError } from '@/lib/httpError';
import { termDays } from '@/lib/paymentTerms';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface VendorBillInput {
  poId: string;
  vendorBillNumber: string;
  billDate: string;
  lines: { product: string; quantity: number; rate?: number }[];
  unregistered?: boolean; // supplier without GSTIN: no GST input credit
  charges?: { label: string; amount: number }[]; // freight, packing... as on the supplier's bill; not sent = what the PO has left to bill
  notes?: string;
}

/** Goods-receipt lines that have passed inspection (the ones that are a liability in the books), for the given orders */
export async function acceptedLines(poIds: string[]): Promise<ReceivedLine[]> {
  const grns: any[] = await GRN.find({ po: { $in: poIds } }).lean();
  return grns.flatMap(g => g.items.filter((i: any) => i.inspection !== 'PENDING').map((i: any) => ({
    poId: String(g.po), poNumber: g.poNumber, supplierId: String(g.supplier), product: String(i.product), productName: '', grnNumber: g.number, date: new Date(g.createdAt),
    kept: r4((i.receivedQty || 0) - (i.returnQty || 0)), price: i.unitPrice || 0,
  })).filter((l: ReceivedLine) => l.kept > 0));
}

/**
 * What can still be billed on each line of a purchase order. Only goods that passed inspection count, net of anything
 * returned to the vendor; oldest receipts are treated as billed first. `fifo` is what is left, oldest first, at the price
 * the goods were received at (that is what payables were credited with).
 */
export function billable(po: any, lines: ReceivedLine[]) {
  const mine = lines.filter(l => l.poId === String(po._id));
  const billedMap = new Map<string, number>((po.items || []).map((i: any) => [`${po._id}|${i.product?._id || i.product}`, i.billedQuantity || 0]));
  const left = unbilledLines(mine, billedMap);
  return (po.items || []).map((i: any) => {
    const product = String(i.product?._id || i.product);
    const fifo: UnbilledLine[] = left.filter(l => l.product === product).sort((x, y) => x.date.getTime() - y.date.getTime());
    const received = i.receivedQuantity || 0;
    const accepted = r4(mine.filter(l => l.product === product).reduce((s, l) => s + l.kept, 0));
    return { product, received, accepted, awaitingQc: r4(Math.max(0, received - accepted)), billed: i.billedQuantity || 0, unbilled: r4(fifo.reduce((s, l) => s + l.unbilledQty, 0)), price: i.unitPrice, fifo };
  });
}

/** Numbers of the goods receipts the next `quantity` units come from (oldest first) */
export function consumedGrns(fifo: UnbilledLine[], quantity: number) {
  const out: string[] = []; let need = quantity;
  for (const l of fifo) { if (need <= 1e-9) break; out.push(l.grnNumber); need = r4(need - Math.min(need, l.unbilledQty)); }
  return out;
}

/** A purchase order's charges that its bills (not cancelled) have not covered yet */
export async function poChargesLeft(po: any) {
  if (!(po.charges || []).length) return [];
  const bills: any[] = await Invoice.find({ type: 'PURCHASE', order: po._id, status: { $ne: 'CANCELLED' } }).select('charges').lean();
  return unbilledCharges(po.charges, bills.flatMap(b => b.charges || []));
}

/** Cost of the next `quantity` units to be billed, at the price they were received at (oldest first) */
export function receiptCost(fifo: UnbilledLine[], quantity: number) {
  let need = quantity, cost = 0;
  for (const l of fifo) {
    if (need <= 1e-9) break;
    const take = Math.min(need, l.unbilledQty);
    cost += take * l.price; need = r4(need - take);
  }
  return r2(cost);
}


/**
 * Books a supplier's bill against received goods (a three-way match: order, receipt, bill).
 *  - you cannot bill more than has been received and not yet billed
 *  - GST input credit and any price difference from the order price are posted to the books
 *  - the bill number is unique per supplier
 * The goods receipt already credited payables at the price the goods were received at, so the bill only adds GST and the price difference.
 */
export async function createVendorBill(input: VendorBillInput, actor: { id?: string; name?: string; role?: string }) {
  const vendorBillNumber = String(input.vendorBillNumber || '').trim();
  if (!vendorBillNumber) throw new HttpError(400, 'Enter the supplier\'s bill number.');
  const billDate = new Date(input.billDate);
  if (Number.isNaN(billDate.getTime())) throw new HttpError(400, 'Enter a valid bill date.');
  if (billDate.getTime() > Date.now() + 86400000) throw new HttpError(400, 'The bill date cannot be in the future.');
  if (!mongoose.isValidObjectId(input.poId)) throw new HttpError(400, 'Select a purchase order.');
  const lines = (input.lines || []).filter(l => Number(l.quantity) > 0);
  if (!lines.length) throw new HttpError(400, 'Enter the quantity billed for at least one item.');
  if (new Set(lines.map(l => String(l.product))).size !== lines.length) throw new HttpError(400, 'Each item can appear only once on a bill.');
  await assertPeriodOpen('ACCOUNTING', billDate);

  const po: any = await PurchaseOrder.findById(input.poId);
  if (!po) throw new HttpError(404, 'Purchase order not found.');
  if (['DRAFT', 'CANCELLED'].includes(po.status)) throw new HttpError(409, `A ${po.status.toLowerCase()} purchase order cannot be billed.`);
  const supplier: any = await Supplier.findById(po.supplier).lean();
  if (!supplier) throw new HttpError(404, 'Supplier not found.');
  if (await Invoice.exists({ supplier: supplier._id, vendorBillNumber })) throw new HttpError(409, `Bill ${vendorBillNumber} from ${supplier.name} is already booked.`);

  // match every line against what was received, accepted and is still unbilled
  const open = billable(po, await acceptedLines([String(po._id)]));
  const products: any[] = await Product.find({ _id: { $in: lines.map(l => l.product) } }).lean();
  const priced: { product: any; poItem: any; quantity: number; rate: number; receiptCost: number; grns: string[] }[] = [];
  for (const l of lines) {
    const poItem = po.items.find((i: any) => String(i.product) === String(l.product));
    if (!poItem) throw new HttpError(400, 'An item on the bill is not on this purchase order.');
    const product = products.find(p => String(p._id) === String(l.product));
    const line = open.find((o: any) => o.product === String(l.product))!;
    const room = line.unbilled;
    const quantity = Number(l.quantity);
    if (quantity > room + 1e-9) throw new HttpError(409, `${product?.name || 'Item'}: only ${room} received and not yet billed${line.awaitingQc > 0 ? ` (${line.awaitingQc} still awaiting quality inspection)` : ''}, but the bill says ${quantity}.`);
    const rate = l.rate === undefined || l.rate === null || l.rate === ('' as any) ? poItem.unitPrice : Number(l.rate);
    if (!(rate >= 0)) throw new HttpError(400, 'Rates cannot be negative.');
    priced.push({ product, poItem, quantity, rate, receiptCost: receiptCost(line.fifo, quantity), grns: consumedGrns(line.fifo, quantity) });
  }

  // freight and other charges on the bill: as typed, else the order's charges that earlier bills have not covered
  const charges = input.charges !== undefined ? cleanCharges(input.charges) : await poChargesLeft(po);

  // GST: input credit for registered suppliers; intra-state -> CGST + SGST, inter-state -> IGST
  const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
  let tax: ReturnType<typeof computeTax>;
  if (input.unregistered) {
    tax = computeTax(priced.map(p => ({ productId: String(p.poItem.product), description: p.product?.name || 'Item', hsnCode: p.product?.hsnCode || '', quantity: p.quantity, unitPrice: p.rate, gstRate: 0 })), '', '', charges);
  } else {
    if (!supplier.gstin) throw new HttpError(400, 'The supplier has no GSTIN. Add it on the supplier record, or mark the bill as from an unregistered supplier.');
    if (!company?.stateCode) throw new HttpError(400, 'Complete Company Settings (GSTIN) so the GST on the bill can be split correctly.');
    tax = computeTax(priced.map(p => ({ productId: String(p.poItem.product), description: p.product?.name || 'Item', hsnCode: p.product?.hsnCode || '', quantity: p.quantity, unitPrice: p.rate, gstRate: p.product?.gstRate ?? 18 })), stateCodeOf(supplier.gstin), company.stateCode, charges);
  }
  const gst = r2(tax.totalCGST + tax.totalSGST + tax.totalIGST);
  const variance = r2(priced.reduce((s, p) => s + (p.quantity * p.rate - p.receiptCost), 0)); // billed value vs what the goods were booked at on receipt

  // 1. claim the quantities (optimistic: only if nobody changed the order's receipts/billing since we read it)
  const claimed: { product: any; quantity: number }[] = [];
  const unclaim = async () => { for (const c of claimed) await PurchaseOrder.updateOne({ _id: po._id }, { $inc: { 'items.$[it].billedQuantity': -c.quantity } }, { arrayFilters: [{ 'it.product': c.product }] }); };
  let journal: any = null;
  try {
    for (const p of priced) {
      const received = p.poItem.receivedQuantity || 0, billed = p.poItem.billedQuantity || 0;
      const res = await PurchaseOrder.updateOne(
        { _id: po._id, items: { $elemMatch: { product: p.poItem.product, receivedQuantity: received, billedQuantity: billed === 0 ? { $in: [0, null] } : billed } } },
        { $inc: { 'items.$[it].billedQuantity': p.quantity } }, { arrayFilters: [{ 'it.product': p.poItem.product }] });
      if (!res.modifiedCount) throw new HttpError(409, 'The purchase order changed while the bill was being booked (a receipt or another bill). Reload and try again.');
      claimed.push({ product: p.poItem.product, quantity: p.quantity });
    }

    // 2. the books: GST input credit and price variance; payables rise by exactly what the bill adds beyond the receipt
    const chargesAmt = chargesTotal(charges); // the goods are already in stock at their receipt cost, so charges are a cost of buying
    const apNet = r2(gst + variance + chargesAmt);
    const entries: any[] = [];
    if (gst > 0) entries.push({ acc: ACC.GST_INPUT, debit: gst });
    if (chargesAmt > 0) entries.push({ acc: ACC.FREIGHT_INWARD, debit: chargesAmt });
    if (variance > 0) entries.push({ acc: ACC.PURCHASE_PRICE_VARIANCE, debit: variance });
    if (variance < 0) entries.push({ acc: ACC.PURCHASE_PRICE_VARIANCE, credit: -variance });
    if (apNet > 0) entries.push({ acc: ACC.AP, credit: apNet });
    if (apNet < 0) entries.push({ acc: ACC.AP, debit: -apNet });
    const invoiceNumber = await nextDocNumber(Invoice, 'BILL', 'invoiceNumber');
    if (entries.length) journal = await postJournal({ date: billDate, description: `Vendor bill ${vendorBillNumber} from ${supplier.name} (${po.poNumber})`, reference: invoiceNumber, referenceType: 'VENDOR_BILL', createdBy: actor.id, lines: entries });

    // 3. the bill itself
    const subTotal = r2(tax.subTotal);
    const forOrder: any = po.salesOrder ? await SalesOrder.findById(po.salesOrder).select('soNumber').lean() : null;
    return await Invoice.create({
      grnRefs: [...new Set(priced.flatMap(p => p.grns))], ...(forOrder ? { salesOrder: forOrder._id, soNumber: forOrder.soNumber } : {}),
      invoiceNumber, type: 'PURCHASE', supplier: supplier._id, order: po._id, poNumber: po.poNumber, vendorBillNumber, issuedByRole: actor.role, date: billDate,
      dueDate: new Date(billDate.getTime() + termDays(supplier.paymentTerms) * 86400000),
      items: tax.items.map(i => ({ product: i.productId, description: i.description, hsnCode: i.hsnCode, quantity: i.quantity, unitPrice: i.unitPrice, chargeShare: i.chargeShare || undefined, taxableValue: i.taxableValue, cgstRate: i.cgstRate, cgstAmount: i.cgstAmount, sgstRate: i.sgstRate, sgstAmount: i.sgstAmount, igstRate: i.igstRate, igstAmount: i.igstAmount, totalAmount: i.totalAmount })),
      charges: tax.charges, goodsTotal: tax.goodsTotal, subTotal, totalCGST: tax.totalCGST, totalSGST: tax.totalSGST, totalIGST: tax.totalIGST, totalAmount: r2(subTotal + gst),
      amountPaid: 0, status: 'ISSUED', reverseCharge: false,
    });
  } catch (err) {
    if (journal) await revertJournal(journal).catch(() => {});
    await unclaim().catch(() => {});
    throw err;
  }
}
