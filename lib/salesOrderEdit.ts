import mongoose from 'mongoose';
import { HttpError } from '@/lib/httpError';
import { numberLines } from '@/lib/lineNumbers';
import { applyDiscount, chargesTotal, cleanCharges } from '@/lib/docCharges';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Commercial terms frozen when a quotation is won; changing any of them needs a recorded override. */
export const LOCKED_TERMS = ['discounts', 'paymentTerms', 'terms', 'currency', 'exchangeRate', 'incoterm'] as const;
const PLAIN = ['poNumber', 'deliveryDate', 'portOfLoading', 'portOfDischarge', 'country'] as const;

type Line = { lineNo?: number; product: string; quantity: number; unitPrice: number; listPrice?: number; discountPercent?: number; totalPrice: number; requiredDeliveryDate?: Date };

function dateOf(v: any, what: string) {
  if (v === null || v === '') return undefined;
  const d = new Date(v);
  if (isNaN(+d)) throw new HttpError(400, `${what} is not a valid date.`);
  return d;
}
const same = (a: any, b: any) => (a ?? '') === (b ?? '');

/**
 * Works out what an edit to a sales order would change and whether the price lock allows it.
 * Quantities and delivery details stay editable on a locked order; prices, the item list and the frozen terms do not
 * unless the caller supplies an override (`allowOverride`), in which case the changes are returned for the audit trail.
 */
export function planSalesOrderEdit(so: any, patch: any, allowOverride: boolean) {
  if (!['DRAFT', 'APPROVED'].includes(so.status)) throw new HttpError(409, `A ${String(so.status).replace('_', ' ').toLowerCase()} sales order can no longer be edited.`);
  if (so.taxInvoiceStatus && so.taxInvoiceStatus !== 'UNINVOICED') throw new HttpError(409, 'This order has been invoiced (or an invoice is pending) and can no longer be edited.');

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Send the fields to change as an object.');
  // Items, prices and totals feed the stock reservation made at approval and the approval value, so they are fixed once the order leaves draft.
  const touchesValue = patch.items !== undefined || patch.charges !== undefined || LOCKED_TERMS.some(k => patch[k] !== undefined);
  if (touchesValue && so.status !== 'DRAFT') throw new HttpError(409, 'Items, prices and terms can only be changed while the order is a draft. Cancel and re-raise the order to change them.');
  if (touchesValue && so.approvalPending) throw new HttpError(409, 'This order is waiting for an approval decision and cannot be changed meanwhile.');
  for (const k of [...PLAIN, ...LOCKED_TERMS]) if (patch[k] !== undefined && patch[k] !== null && typeof patch[k] === 'object') throw new HttpError(400, k + ' is not valid.');

  const set: Record<string, any> = {};
  const lockedChanges: string[] = [];

  for (const k of PLAIN) if (patch[k] !== undefined) {
    const v = k === 'deliveryDate' && patch[k] ? new Date(patch[k]) : patch[k];
    if (k === 'deliveryDate' && v && isNaN(+v)) throw new HttpError(400, 'Delivery date is not a valid date.');
    set[k] = v;
  }
  for (const k of LOCKED_TERMS) if (patch[k] !== undefined) {
    const cur = so[k];
    if (k === 'discounts' || k === 'exchangeRate') { const n = Number(patch[k]); if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} must be a non-negative number.`); if (n !== Number(cur ?? 0) && !(cur == null && n === 0)) { set[k] = n; lockedChanges.push(k); } }
    else if (!same(patch[k], cur)) { set[k] = patch[k]; lockedChanges.push(k); }
  }

  if (patch.items !== undefined) {
    if (!Array.isArray(patch.items) || !patch.items.length) throw new HttpError(400, 'A sales order needs at least one item.');
    const old = new Map<string, any>((so.items || []).map((i: any) => [String(i.product?._id || i.product), i]));
    const seen = new Set<string>();
    const items: Line[] = patch.items.map((i: any, n: number) => {
      const product = String(i.product?._id || i.product || '');
      const quantity = Number(i.quantity);
      if (!mongoose.Types.ObjectId.isValid(product)) throw new HttpError(400, 'Every line needs a valid product.');
      if (seen.has(product)) throw new HttpError(400, 'A product can appear only once on an order.');
      seen.add(product);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Quantity must be greater than zero.');
      const was = old.get(product);
      // with a discount % the price sent is the list rate; without one, a line whose price is unchanged keeps its discount
      const sent = i.unitPrice === undefined ? (i.discountPercent !== undefined ? was?.listPrice ?? was?.unitPrice : was?.unitPrice) ?? NaN : Number(i.unitPrice);
      if (!Number.isFinite(sent) || sent < 0) throw new HttpError(400, 'Every new line needs a valid unit price.');
      const disc = i.discountPercent !== undefined ? applyDiscount({ unitPrice: sent, discountPercent: i.discountPercent }, `Line ${n + 1}`)
        : sent === was?.unitPrice ? { unitPrice: sent, listPrice: was.listPrice, discountPercent: was.discountPercent } : { unitPrice: sent };
      const unitPrice = disc.unitPrice;
      if (!was) lockedChanges.push('item added');
      else if (unitPrice !== was.unitPrice) lockedChanges.push(`price changed`);
      const requiredDeliveryDate = i.requiredDeliveryDate !== undefined ? dateOf(i.requiredDeliveryDate, 'Line delivery date') : was?.requiredDeliveryDate;
      return { lineNo: was?.lineNo, product, quantity, unitPrice, ...(disc.discountPercent ? { listPrice: disc.listPrice, discountPercent: disc.discountPercent } : {}), totalPrice: r2(quantity * unitPrice), requiredDeliveryDate };
    });
    numberLines(items); // a line keeps its number; new lines continue after the highest
    if ([...old.keys()].some(p => !seen.has(p))) lockedChanges.push('item removed');
    set.items = items;
  }
  if (patch.charges !== undefined) {
    const charges = cleanCharges(patch.charges);
    const was = (so.charges || []).map((c: any) => `${c.label}=${c.amount}`).join('|');
    if (charges.map(c => `${c.label}=${c.amount}`).join('|') !== was) { set.charges = charges; lockedChanges.push('charges'); }
  }
  // the order total is its lines plus its charges (before GST)
  if (set.items || set.charges) {
    const sub = (ls: any[]) => ls.reduce((s, i) => s + (i.totalPrice || 0), 0);
    const oldSub = sub(so.items || []), newSub = sub((set.items || so.items || []) as any[]);
    const oldCharges = chargesTotal(so.charges || []), newCharges = chargesTotal(set.charges || so.charges || []);
    // an older order whose total included more than lines and charges (tax, say) keeps that part in proportion to the lines
    const legacy = oldSub > 0 && so.totalAmount && Math.abs(so.totalAmount - oldSub - oldCharges) > 0.01;
    set.totalAmount = legacy ? r2(((so.totalAmount - oldCharges) * newSub) / oldSub + newCharges) : r2(newSub + newCharges);
  }

  // Line delivery dates are delivery details: they can change after approval, like the order's date.
  if (patch.lineDates !== undefined) {
    if (!Array.isArray(patch.lineDates) || !patch.lineDates.length) throw new HttpError(400, 'lineDates must list { lineNo, requiredDeliveryDate }.');
    if (set.items) throw new HttpError(400, 'Send line dates on the items when changing items.');
    const lines = (so.items || []).map((i: any) => ({ ...(typeof i.toObject === 'function' ? i.toObject() : i) }));
    for (const d of patch.lineDates) {
      const line = lines.find((l: any) => l.lineNo === Number(d?.lineNo));
      if (!line) throw new HttpError(400, `The order has no line ${d?.lineNo}.`);
      line.requiredDeliveryDate = dateOf(d.requiredDeliveryDate, `Delivery date for line ${line.lineNo}`);
    }
    set.items = lines;
  }
  // The order is due when its first dated line is due, so with dated lines the order's date follows them.
  const lineDates = ((set.items || so.items || []) as any[]).map(i => i.requiredDeliveryDate).filter(Boolean).map((d: any) => new Date(d).getTime());
  if (lineDates.length) {
    if (patch.deliveryDate !== undefined && !set.items) throw new HttpError(400, 'This order has delivery dates per line; change the line dates instead.');
    set.deliveryDate = new Date(Math.min(...lineDates));
  }

  const locked = !!so.priceLocked && lockedChanges.length > 0;
  if (locked && !allowOverride) {
    throw new HttpError(409, `The price is locked on ${so.soNumber} (${[...new Set(lockedChanges)].join(', ')}). Only a Manager or Admin can change locked terms, with a written reason.`);
  }
  if (!Object.keys(set).length) throw new HttpError(400, 'Nothing to change.');
  return { set, overridden: locked ? [...new Set(lockedChanges)] : [] };
}
