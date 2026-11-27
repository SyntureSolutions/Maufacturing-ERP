import mongoose from 'mongoose';
import Customer from '@/models/Customer';
import Product from '@/models/Product';
import CompanySettings from '@/models/CompanySettings';
import { computeTax, stateCodeOf } from '@/lib/gst';
import { INCOTERMS } from '@/lib/quoteTerms';
import { HttpError } from '@/lib/httpError';
import { assertItemsActive } from '@/lib/itemRules';
import { chargesTotal, cleanCharges, keptDiscount } from '@/lib/docCharges';

export const OPEN_STAGES = ['ENQUIRY_RECEIVED', 'QUOTATION_SENT', 'UNDER_REVIEW'];
/** Who may create, change, revise and delete quotations. Stage moves (won, lost) are open to Finance too, for the credit override. */
export const QUOTE_EDIT_ROLES = ['ADMIN', 'MANAGER', 'SALES'];
export const QUOTE_STAGE_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'FINANCE_MANAGER'];

/**
 * Puts the content of `b` on a quotation: lines (products checked, line totals worked out here), payment terms, validity,
 * terms, domestic/export details, and GST for a domestic quote. Fields not sent keep their current value. Does not save.
 */
export async function applyQuoteContent(quote: any, b: any) {
  const raw = b.items ?? quote.items;
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Add at least one item.');
  const ids = raw.map((i: any) => String(i.product?._id || i.product || '')).filter(Boolean);
  for (const id of ids) if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'An item on the quotation is not valid.');
  // items retired in the item master cannot be offered again; lines already on this quotation may stay
  await assertItemsActive(ids, 'quotation', (quote.items || []).map((i: any) => i.product));
  const products: any[] = ids.length ? await Product.find({ _id: { $in: ids } }).select('name hsnCode gstRate').lean() : [];
  const seen = new Set<string>();
  const items = raw.map((i: any, n: number) => {
    const pid = String(i.product?._id || i.product || '');
    const p = pid ? products.find(x => String(x._id) === pid) : null;
    if (pid && !p) throw new HttpError(400, `Line ${n + 1}: that item does not exist.`);
    if (pid && seen.has(pid)) throw new HttpError(400, `Line ${n + 1}: the item appears twice. Combine the quantities into one line.`);
    if (pid) seen.add(pid);
    const productName = String(i.productName || p?.name || '').trim();
    const quantity = Number(i.quantity), unitPrice = Number(i.unitPrice);
    if (!productName || !(quantity > 0) || !(unitPrice >= 0) || !Number.isFinite(unitPrice)) throw new HttpError(400, `Line ${n + 1}: every item needs a name, a quantity above zero and a price.`);
    // the list rate and % of an approved discount stay while the price is the discounted one
    return { product: p?._id, productName, quantity, unitPrice, ...keptDiscount(i, unitPrice), totalPrice: Math.round(quantity * unitPrice * 100) / 100 };
  });

  const orderType = b.orderType === 'EXPORT' ? 'EXPORT' : (b.orderType === 'DOMESTIC' ? 'DOMESTIC' : quote.orderType || 'DOMESTIC');
  // an export quotation keeps its terms unless new ones are sent
  const exp = { currency: b.currency ?? quote.currency, exchangeRate: b.exchangeRate ?? quote.exchangeRate, incoterm: b.incoterm ?? quote.incoterm, portOfLoading: b.portOfLoading ?? quote.portOfLoading, portOfDischarge: b.portOfDischarge ?? quote.portOfDischarge, country: b.country ?? quote.country };
  if (orderType === 'EXPORT') {
    if (!exp.currency || !(Number(exp.exchangeRate) > 0) || !INCOTERMS.includes(exp.incoterm) || !String(exp.portOfLoading || '').trim() || !String(exp.portOfDischarge || '').trim()) {
      throw new HttpError(400, 'Export quotations need currency, exchange rate, Incoterm and both ports.');
    }
  }
  if (b.validUntil) {
    const v = new Date(b.validUntil);
    if (isNaN(+v)) throw new HttpError(400, 'Valid-until is not a valid date.');
    quote.validUntil = v;
  }

  const charges = cleanCharges(b.charges !== undefined ? b.charges : (quote.charges || []).map((c: any) => ({ label: c.label, amount: c.amount })));
  quote.items = items;
  quote.charges = charges;
  quote.totalAmount = Math.round((items.reduce((s: number, i: any) => s + i.totalPrice, 0) + chargesTotal(charges)) * 100) / 100;
  if (b.paymentTerms) quote.paymentTerms = b.paymentTerms;
  if (b.terms !== undefined) quote.terms = b.terms;
  Object.assign(quote, { orderType, currency: orderType === 'EXPORT' ? exp.currency : 'INR', exchangeRate: orderType === 'EXPORT' ? Number(exp.exchangeRate) : undefined, incoterm: orderType === 'EXPORT' ? exp.incoterm : undefined, portOfLoading: orderType === 'EXPORT' ? exp.portOfLoading : undefined, portOfDischarge: orderType === 'EXPORT' ? exp.portOfDischarge : undefined, country: orderType === 'EXPORT' ? exp.country : undefined });

  // GST (domestic supplies only; exports are zero-rated / LUT and carry no GST on the quote)
  quote.taxSummary = null;
  if (orderType === 'DOMESTIC') {
    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const customer: any = quote.customer ? await Customer.findById(quote.customer).lean() : null;
    const pos = b.placeOfSupply || customer?.stateCode || stateCodeOf(customer?.gstin);
    if (company?.stateCode && pos) {
      const t = computeTax(quote.items.map((i: any) => { const p = products.find(x => String(x._id) === String(i.product)); return { description: i.productName, hsnCode: p?.hsnCode || '', quantity: i.quantity, unitPrice: i.unitPrice, gstRate: p?.gstRate ?? 18 }; }), company.stateCode, pos, charges);
      quote.taxSummary = { goodsTotal: t.goodsTotal, subTotal: t.subTotal, totalCGST: t.totalCGST, totalSGST: t.totalSGST, totalIGST: t.totalIGST, grandTotal: t.totalAmount };
      quote.placeOfSupply = pos;
    }
  }
  return quote;
}

/**
 * Makes the next revision of a quotation: the current state is kept in `revisions`, then the changes in `b` are applied
 * and GST recalculated. Used for hand revisions and for applying an approved discount. Saves the quotation.
 */
export async function reviseQuotation(quote: any, b: any, changedBy: string) {
  if (!OPEN_STAGES.includes(quote.stage)) throw new HttpError(409, 'Only open quotations can be revised.');
  if (!String(b.note || '').trim()) throw new HttpError(400, 'Add a note describing what changed in this revision.');
  const before = { rev: quote.revision || 1, items: quote.items, charges: quote.charges, totalAmount: quote.totalAmount, paymentTerms: quote.paymentTerms, validUntil: quote.validUntil, terms: quote.terms, taxSummary: quote.taxSummary, note: b.note, changedBy, at: new Date() };
  await applyQuoteContent(quote, b);
  quote.revisions.push(before);
  quote.revision = (quote.revision || 1) + 1;
  await quote.save();
  return quote;
}
