import { USABLE_STOCK } from '@/lib/stockRules';
import SalesOrder from '@/models/SalesOrder';
import Batch from '@/models/Batch';
import { HttpError } from '@/lib/httpError';

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 1e-6;

export type Counter = 'dispatchedQty' | 'invoicedQty';
export interface LineAllocation { itemId: string; product: string; quantity: number; unitPrice: number }
export interface StockMovement { batch: string; qty: number; reserved: boolean; product: string }

/** What is still to be dispatched (or invoiced) on each line of an order */
export const remainingOn = (item: any, counter: Counter) => r4((item.quantity || 0) - (item[counter] || 0));

/**
 * Works out which order lines, and how much of each, a challan or invoice covers.
 * Without `requested` it covers everything still outstanding. With it, each requested quantity must fit what is left on the
 * order (several lines of the same product are filled in order). Throws a user-facing error otherwise.
 */
export function resolveLines(so: any, counter: Counter, requested?: { product: string; quantity: number }[]): LineAllocation[] {
  const verb = counter === 'dispatchedQty' ? 'dispatched' : 'invoiced';
  const left = new Map<string, number>((so.items || []).map((i: any) => [String(i._id), remainingOn(i, counter)]));
  const out: LineAllocation[] = [];
  const take = (item: any, q: number) => { out.push({ itemId: String(item._id), product: String(item.product), quantity: r4(q), unitPrice: item.unitPrice }); left.set(String(item._id), r4((left.get(String(item._id)) || 0) - q)); };

  if (!requested) {
    for (const item of so.items || []) { const q = left.get(String(item._id)) || 0; if (q > EPS) take(item, q); }
  } else {
    if (!Array.isArray(requested) || !requested.length) throw new HttpError(400, 'Choose at least one line.');
    const seen = new Set<string>();
    for (const l of requested) {
      const product = String(l?.product || ''), q = Number(l?.quantity);
      if (!product) throw new HttpError(400, 'Every line needs a product.');
      if (seen.has(product)) throw new HttpError(400, 'A product can appear only once.');
      seen.add(product);
      if (!Number.isFinite(q) || q <= 0) throw new HttpError(400, 'Quantities must be greater than zero.');
      const items = (so.items || []).filter((i: any) => String(i.product) === product);
      if (!items.length) throw new HttpError(400, 'That product is not on the order.');
      let need = q;
      for (const item of items) { const room = left.get(String(item._id)) || 0; const t = Math.min(room, need); if (t > EPS) { take(item, t); need = r4(need - t); } }
      if (need > EPS) {
        const got = r4(q - need);
        throw new HttpError(409, got <= EPS && counter === 'invoicedQty' ? `Those goods on ${so.soNumber} are already invoiced.` : `Only ${got} left to be ${verb} for that product, but ${q} was asked for.`);
      }
    }
  }
  if (!out.length) throw new HttpError(409, counter === 'invoicedQty' ? `Sales order ${so.soNumber} is already invoiced${so.taxInvoiceNumber ? ` (${so.taxInvoiceNumber})` : ''}.` : `Everything on ${so.soNumber} has already been ${verb}.`);
  return out;
}

/** Takes the quantities off the order, line by line, each step guarded so two people cannot take the same units. Gives back what it took if a step fails. */
export async function claimQuantities(so: any, counter: Counter, allocations: LineAllocation[]) {
  const done: LineAllocation[] = [];
  try {
    for (const a of allocations) {
      const item = so.items.find((i: any) => String(i._id) === a.itemId);
      const res = await SalesOrder.updateOne(
        { _id: so._id, items: { $elemMatch: { _id: item._id, [counter]: { $lte: r4(item.quantity - a.quantity + EPS) } } } },
        { $inc: { [`items.$.${counter}`]: a.quantity } });
      if (!res.modifiedCount) throw new HttpError(409, `${counter === 'dispatchedQty' ? 'Dispatched' : 'Invoiced'} quantities on ${so.soNumber} changed while you were working. Reload and try again.`);
      done.push(a);
    }
  } catch (err) {
    await releaseQuantities(so._id, counter, done);
    throw err;
  }
}

export async function releaseQuantities(soId: any, counter: Counter, allocations: LineAllocation[]) {
  for (const a of allocations) await SalesOrder.updateOne({ _id: soId, 'items._id': a.itemId }, { $inc: { [`items.$.${counter}`]: -a.quantity } });
}

/** Order status follows the quantities: nothing sent = approved, some sent = in fulfilment, all sent = fulfilled; invoiced the same way */
export async function refreshOrderState(soId: any) {
  const so: any = await SalesOrder.findById(soId).lean();
  if (!so) return;
  const items: any[] = so.items || [];
  const allDone = (c: Counter) => items.length > 0 && items.every(i => (i[c] || 0) >= i.quantity - EPS);
  const anyDone = (c: Counter) => items.some(i => (i[c] || 0) > EPS);
  const set: any = {};
  if (['APPROVED', 'IN_FULFILLMENT', 'FULFILLED'].includes(so.status)) set.status = allDone('dispatchedQty') ? 'FULFILLED' : anyDone('dispatchedQty') ? 'IN_FULFILLMENT' : 'APPROVED';
  if (allDone('invoicedQty')) set.taxInvoiceStatus = 'INVOICED';
  else if (anyDone('invoicedQty')) set.taxInvoiceStatus = 'PARTIAL';
  else if (['INVOICED', 'PARTIAL'].includes(so.taxInvoiceStatus)) set.taxInvoiceStatus = 'UNINVOICED';
  if (Object.keys(set).length) await SalesOrder.updateOne({ _id: soId }, { $set: set });
}

/**
 * Takes the dispatched goods out of stock: first from what was reserved for this order, then from free approved stock (earliest expiry first).
 * Anything that cannot be found in stock is reported, not refused: the goods may have been produced and shipped before they were booked in.
 */
export async function consumeStock(so: any, allocations: LineAllocation[]) {
  const movements: StockMovement[] = [];
  const shortfall: { product: string; qty: number }[] = [];
  for (const a of allocations) {
    let need = a.quantity;
    // 1. what was reserved for this order
    for (const res of so.allocatedBatches || []) {
      if (need <= EPS) break;
      if (String(res.product) !== a.product || (res.quantity || 0) <= EPS) continue;
      const take = Math.min(res.quantity, need);
      const claimedRes = await SalesOrder.updateOne({ _id: so._id, allocatedBatches: { $elemMatch: { batch: res.batch, product: res.product, quantity: { $gte: take - EPS } } } }, { $inc: { 'allocatedBatches.$.quantity': -take } });
      if (!claimedRes.modifiedCount) continue;
      const b = await Batch.updateOne({ _id: res.batch, allocatedQuantity: { $gte: take - EPS }, currentQuantity: { $gte: take - EPS } }, { $inc: { allocatedQuantity: -take, currentQuantity: -take } });
      if (!b.modifiedCount) { await SalesOrder.updateOne({ _id: so._id, allocatedBatches: { $elemMatch: { batch: res.batch, product: res.product } } }, { $inc: { 'allocatedBatches.$.quantity': take } }); continue; }
      movements.push({ batch: String(res.batch), qty: r4(take), reserved: true, product: a.product });
      need = r4(need - take);
    }
    // 2. free stock
    if (need > EPS) {
      const batches = await Batch.find({ product: a.product, ...USABLE_STOCK, currentQuantity: { $gt: 0 } }).sort({ expiryDate: 1 });
      for (const b of batches) {
        if (need <= EPS) break;
        const free = b.currentQuantity - b.allocatedQuantity;
        if (free <= EPS) continue;
        const take = Math.min(free, need);
        const res = await Batch.updateOne({ _id: b._id, $expr: { $gte: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, take - EPS] } }, { $inc: { currentQuantity: -take } });
        if (!res.modifiedCount) continue;
        movements.push({ batch: String(b._id), qty: r4(take), reserved: false, product: a.product });
        need = r4(need - take);
      }
    }
    if (need > EPS) shortfall.push({ product: a.product, qty: r4(need) });
  }
  return { movements, shortfall };
}

/** Puts goods back exactly where consumeStock took them from (used when a challan is cancelled or fails part way) */
export async function restoreStock(soId: any, movements: StockMovement[]) {
  for (const m of movements) {
    await Batch.updateOne({ _id: m.batch }, { $inc: m.reserved ? { currentQuantity: m.qty, allocatedQuantity: m.qty } : { currentQuantity: m.qty } });
    if (m.reserved) {
      const bumped = await SalesOrder.updateOne({ _id: soId, allocatedBatches: { $elemMatch: { batch: m.batch, product: m.product } } }, { $inc: { 'allocatedBatches.$.quantity': m.qty } });
      if (!bumped.modifiedCount) await SalesOrder.updateOne({ _id: soId }, { $push: { allocatedBatches: { batch: m.batch, product: m.product, quantity: m.qty } } });
    }
  }
}

/** Takes quantities back off the order by product (used when a challan is cancelled): later lines of a product are cleared first */
export async function returnQuantitiesByProduct(soId: any, counter: Counter, lines: { product: string; quantity: number }[]) {
  const so: any = await SalesOrder.findById(soId).lean();
  if (!so) return;
  for (const l of lines) {
    let back = Number(l.quantity);
    for (const item of [...(so.items || [])].reverse().filter((i: any) => String(i.product) === String(l.product))) {
      if (back <= EPS) break;
      const t = Math.min(back, item[counter] || 0);
      if (t <= EPS) continue;
      await SalesOrder.updateOne({ _id: soId, items: { $elemMatch: { _id: item._id, [counter]: { $gte: t - EPS } } } }, { $inc: { [`items.$.${counter}`]: -t } });
      back = r4(back - t);
    }
  }
}
