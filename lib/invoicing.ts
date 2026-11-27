import SalesOrder from '@/models/SalesOrder';
import Customer from '@/models/Customer';
import Product from '@/models/Product';
import CompanySettings from '@/models/CompanySettings';
import Invoice from '@/models/Invoice';
import { computeTax, stateCodeOf } from '@/lib/gst';
import { ACC, postJournal, revertJournal } from '@/lib/accounting';
import { nextDocNumber } from '@/lib/docNumber';
import { resolveLines, claimQuantities, releaseQuantities, refreshOrderState, LineAllocation, Counter } from '@/lib/dispatch';
import { termDays } from '@/lib/paymentTerms';
import { unbilledCharges } from '@/lib/docCharges';
import { tcsFor } from '@/lib/tcs';

export interface SalesContext {
  so: any; customer: any; company: any; placeOfSupply: string;
  kind: 'dispatch' | 'invoice';   // what the lines below are for
  allocations: LineAllocation[];  // the order lines (and how much of each) this document covers
  parties: { seller: any; buyer: any };
  tax: ReturnType<typeof computeTax>;
  tcs: ReturnType<typeof tcsFor>;   // TCS u/s 206C(1) on top of the GST total
  total: number;                     // what the customer pays: GST total plus TCS
}

/**
 * Resolves seller/buyer details and computes GST for a sales order. Throws a user-facing Error if data is incomplete.
 * Covers what is still outstanding on the order (to dispatch, or to invoice), or just the `lines` asked for.
 */
export async function loadSalesContext(salesOrderId: string, placeOfSupplyOverride?: string, opts: { kind?: 'dispatch' | 'invoice'; lines?: { product: string; quantity: number }[] } = {}): Promise<SalesContext> {
  const kind = opts.kind || 'invoice';
  const so: any = await SalesOrder.findById(salesOrderId);
  if (!so) throw new Error('Sales order not found.');
  if (!so.customer) throw new Error('This sales order is not linked to a customer master record; GST documents need the buyer details.');
  const customer: any = await Customer.findById(so.customer);
  if (!customer) throw new Error('Customer not found.');
  const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
  if (!company?.legalName || !company.stateCode) throw new Error('Complete Company Settings (legal name, GSTIN, address) before issuing GST documents.');

  const buyerState = customer.stateCode || stateCodeOf(customer.gstin);
  const placeOfSupply = placeOfSupplyOverride || buyerState;
  if (!placeOfSupply) throw new Error('Place of supply is unknown: add the customer GSTIN or state code.');

  const allocations = resolveLines(so, kind === 'dispatch' ? 'dispatchedQty' : 'invoicedQty', opts.lines);
  const products: any[] = await Product.find({ _id: { $in: allocations.map(a => a.product) } }).lean();
  const lines = allocations.map(a => {
    const p = products.find(x => String(x._id) === a.product);
    if (!p?.hsnCode) throw new Error(`Product ${p?.sku || a.product} has no HSN code. Add it on the product before invoicing.`);
    const soLine = (so.items || []).find((i: any) => String(i._id) === a.itemId);
    return { productId: a.product, description: p.name, hsnCode: p.hsnCode, quantity: a.quantity, unitPrice: a.unitPrice, gstRate: p.gstRate ?? 18, uom: p.uom,
      ...(soLine?.discountPercent ? { listPrice: soLine.listPrice, discountPercent: soLine.discountPercent } : {}), tcsGoods: p.tcsGoods, tcsRate: p.tcsRate };
  });
  // freight and other charges on the order are billed once, on the first invoice raised after they were agreed
  let charges: { label: string; amount: number }[] = [];
  if (kind === 'invoice' && (so.charges || []).length) {
    const billed: any[] = await Invoice.find({ salesOrder: so._id, type: { $ne: 'PURCHASE' }, status: { $ne: 'CANCELLED' } }).select('charges').lean();
    charges = unbilledCharges(so.charges, billed.flatMap(b => b.charges || []));
  }
  const tax = computeTax(lines, company.stateCode, placeOfSupply, charges);
  const parties = {
    seller: { gstin: company.gstin, name: company.legalName, address1: company.address1, address2: company.address2, city: company.city, pincode: company.pincode, stateCode: company.stateCode, phone: company.phone, email: company.email },
    buyer: { gstin: customer.gstin, name: customer.name, address1: customer.billingAddress, city: customer.city || '', pincode: customer.pincode || '', stateCode: buyerState, phone: customer.phone, email: customer.email },
  };
  const tcs = tcsFor(tax.items as any[], customer);
  return { so, customer, company, placeOfSupply, parties, tax, tcs, total: Math.round((tax.totalAmount + tcs.amount) * 100) / 100, kind, allocations };
}


/** Issues a GST tax invoice for the lines in the context (all that is still to invoice, or the lines of one challan) and posts the sales journal. */
export async function createTaxInvoice(ctx: SalesContext, opts: { createdByRole: string; createdById?: string; proformaRef?: string; dcRef?: string; dcId?: any }) {
  const { so, customer, tax, parties, placeOfSupply } = ctx;
  if (ctx.kind !== 'invoice') throw new Error('This context was prepared for dispatch, not for invoicing.');
  const date = new Date();
  const invoiceNumber = await nextDocNumber(Invoice, 'INV', 'invoiceNumber');

  // take the quantities off the order first (guarded), so the same goods cannot be invoiced twice; give them back if anything below fails
  await claimQuantities(so, 'invoicedQty', ctx.allocations);
  let journal: any = null;
  try {
  // Post first: if the accounting period is locked this throws before any document is created
  journal = await postJournal({
    date, description: `Tax invoice ${invoiceNumber} to ${customer.name}`, reference: invoiceNumber, referenceType: 'INVOICE', createdBy: opts.createdById,
    lines: [
      { acc: ACC.AR, debit: ctx.total },
      { acc: ACC.SALES, credit: tax.subTotal },
      { acc: ACC.GST_OUTPUT, credit: Math.round((tax.totalCGST + tax.totalSGST + tax.totalIGST) * 100) / 100 },
      ...(ctx.tcs.amount > 0 ? [{ acc: ACC.TCS_PAYABLE, credit: ctx.tcs.amount }] : []),
    ],
  });

  const invoice = await Invoice.create({
    invoiceNumber, type: 'SALES', customer: customer._id, salesOrder: so._id, soNumber: so.soNumber, quotationRef: so.quotationRef,
    proformaRef: opts.proformaRef, dcRef: opts.dcRef, deliveryChallan: opts.dcId || undefined, issuedByRole: opts.createdByRole, date,
    dueDate: new Date(date.getTime() + termDays(so.paymentTerms || customer.paymentTerms) * 86400000),
    items: tax.items.map((i: any) => ({ product: i.productId, description: i.description, hsnCode: i.hsnCode, quantity: i.quantity, unitPrice: i.unitPrice, listPrice: i.listPrice, discountPercent: i.discountPercent, chargeShare: i.chargeShare || undefined, taxableValue: i.taxableValue, cgstRate: i.cgstRate, cgstAmount: i.cgstAmount, sgstRate: i.sgstRate, sgstAmount: i.sgstAmount, igstRate: i.igstRate, igstAmount: i.igstAmount, totalAmount: i.totalAmount })),
    charges: tax.charges, goodsTotal: tax.goodsTotal, subTotal: tax.subTotal, totalCGST: tax.totalCGST, totalSGST: tax.totalSGST, totalIGST: tax.totalIGST, tcs: ctx.tcs.rows, tcsAmount: ctx.tcs.amount, totalAmount: ctx.total,
    amountPaid: 0, status: 'ISSUED', placeOfSupply, reverseCharge: false, parties, hsnSummary: tax.hsnSummary,
  });
  await SalesOrder.updateOne({ _id: so._id }, { taxInvoiceNumber: invoiceNumber, taxInvoiceId: invoice._id, $addToSet: { invoices: invoice._id } });
  await refreshOrderState(so._id);
  return invoice;
  } catch (err) {
    if (journal) await revertJournal(journal).catch(() => {});
    await releaseQuantities(so._id, 'invoicedQty', ctx.allocations).catch(() => {});
    throw err;
  }
}
