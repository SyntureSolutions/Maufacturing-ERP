import { USABLE_STOCK } from '@/lib/stockRules';
import MaterialRequisition from '@/models/MaterialRequisition';
import BillOfMaterials from '@/models/BillOfMaterials';
import Product from '@/models/Product';
import { requiredFor } from '@/lib/bom';
import Batch from '@/models/Batch';
import { nextDocNumber } from '@/lib/docNumber';
import { HttpError } from '@/lib/httpError';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Reserves up to `wanted` units of a product from approved, non-quarantined batches (earliest expiry first). Returns how much was reserved. */
export async function reserveStock(product: any, wanted: number, taken: { batch: any; qty: number }[] = []): Promise<number> {
  let remaining = wanted;
  const batches = await Batch.find({ product, ...USABLE_STOCK, currentQuantity: { $gt: 0 } }).sort({ expiryDate: 1 });
  for (const b of batches) {
    if (remaining <= 1e-9) break;
    const free = b.currentQuantity - b.allocatedQuantity;
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    // atomic: only reserve if that much is still free, so two people reserving at once cannot take the same units
    const res = await Batch.updateOne({ _id: b._id, $expr: { $gte: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, take] } }, { $inc: { allocatedQuantity: take } });
    if (!res.modifiedCount) continue;
    taken.push({ batch: b._id, qty: take });
    remaining = r4(remaining - take);
  }
  return r4(wanted - remaining);
}

const release = async (taken: { batch: any; qty: number }[]) => { for (const t of taken) await Batch.updateOne({ _id: t.batch }, { $inc: { allocatedQuantity: -t.qty } }); };

/** Creates a Material Requisition Note from the work order's BOM and reserves the stock it needs. */
export async function createMrnForWorkOrder(wo: any, actorName: string, remarks?: string) {
  if (await MaterialRequisition.exists({ workOrder: wo._id, status: { $ne: 'CANCELLED' } })) throw new HttpError(409, 'An active MRN already exists for this work order.');
  const bom: any = await BillOfMaterials.findById(wo.bom);
  if (!bom) throw new HttpError(400, 'Work order has no BOM.');
  // quantities are drawn in each component's stock unit, scaled from the BOM's base quantity
  const units = new Map((await Product.find({ _id: { $in: bom.components.map((c: any) => c.product) } }).select('uom').lean() as any[]).map(p => [String(p._id), p.uom]));

  const taken: { batch: any; qty: number }[] = [];
  try {
    const items = [];
    let shortfall = false;
    for (const comp of bom.components) {
      const requiredQty = requiredFor(bom, comp, wo.quantity);
      const got: { batch: any; qty: number }[] = [];
      const reservedQty = await reserveStock(comp.product, requiredQty, got);
      taken.push(...got); // kept so everything can be given back if a later line fails
      if (reservedQty + 1e-9 < requiredQty) shortfall = true;
      items.push({ product: comp.product, requiredQty, reservedQty, issuedQty: 0, uom: units.get(String(comp.product)) || comp.unit, holds: got.map(t => ({ batch: t.batch, quantity: t.qty, issued: 0 })) });
    }
    return await MaterialRequisition.create({ number: await nextDocNumber(MaterialRequisition, 'MRN'), workOrder: wo._id, items, shortfall, remarks, status: 'RESERVED', createdBy: actorName });
  } catch (err) {
    await release(taken); // nothing was recorded, so give the reservations back
    throw err;
  }
}

/** Tops up the reservations of an MRN that was short, using stock that has arrived since. */
export async function reserveMore(mrn: any) {
  const taken: { batch: any; qty: number }[] = [];
  try {
    for (const item of mrn.items) {
      const missing = r4(item.requiredQty - item.reservedQty);
      if (missing > 0) {
        const got: { batch: any; qty: number }[] = [];
        item.reservedQty = r4(item.reservedQty + (await reserveStock(item.product, missing, got)));
        taken.push(...got);
        for (const t of got) {
          const hold = (item.holds || []).find((h: any) => String(h.batch) === String(t.batch));
          if (hold) hold.quantity = r4(hold.quantity + t.qty); else item.holds.push({ batch: t.batch, quantity: t.qty, issued: 0 });
        }
      }
    }
    mrn.shortfall = mrn.items.some((i: any) => i.reservedQty + 1e-9 < i.requiredQty);
    await mrn.save();
  } catch (err) {
    await release(taken);
    throw err;
  }
  return mrn;
}

/** Where a work order stands on material: no MRN yet, short, fully reserved, or issued to the shop floor. */
export async function materialReadiness(woId: any) {
  const mrn: any = await MaterialRequisition.findOne({ workOrder: woId, status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }).lean();
  if (!mrn) return { status: 'NO_MRN' as const };
  const short = (mrn.items || []).filter((i: any) => i.reservedQty + 1e-9 < i.requiredQty).map((i: any) => ({ product: String(i.product), missing: r4(i.requiredQty - i.reservedQty) }));
  const status = mrn.status === 'ISSUED' ? 'ISSUED' : short.length ? 'SHORTFALL' : 'READY';
  return { status: status as 'ISSUED' | 'SHORTFALL' | 'READY', mrn: { _id: String(mrn._id), number: mrn.number, status: mrn.status }, short };
}

/** Gives back what a material requisition still holds (reserved but not yet issued) and cancels it. Safe to call on one that is already cancelled or issued: nothing happens. */
export async function releaseMrn(mrn: any) {
  if (!['RESERVED', 'PARTIALLY_ISSUED'].includes(mrn.status)) return false;
  // claim first, so two cancellations cannot both give the stock back
  const claimed = await MaterialRequisition.findOneAndUpdate({ _id: mrn._id, status: { $in: ['RESERVED', 'PARTIALLY_ISSUED'] } }, { status: 'CANCELLED' }, { new: false });
  if (!claimed) return false;
  for (const item of claimed.items) {
    // what the line still holds is its reserved quantity less what was issued; take it back from the batches it reserved from first
    const owed = r4(item.reservedQty - item.issuedQty);
    let capLeft = owed, held = 0;
    for (const h of item.holds || []) {
      const unissued = r4(h.quantity - (h.issued || 0));
      held += unissued;
      const give = Math.min(unissued, capLeft);
      if (give <= 1e-9) continue;
      const res = await Batch.updateOne({ _id: h.batch, allocatedQuantity: { $gte: give - 1e-9 } }, { $inc: { allocatedQuantity: -give } });
      if (res.modifiedCount) capLeft = r4(capLeft - give);
    }
    // anything not covered by recorded holds comes from before holds were kept per batch: release from the latest-expiring reserved batches
    let toRelease = Math.max(0, r4(owed - held));
    if (toRelease <= 1e-9) continue;
    const batches = await Batch.find({ product: item.product, allocatedQuantity: { $gt: 0 } }).sort({ expiryDate: -1 });
    for (const batch of batches) {
      if (toRelease <= 1e-9) break;
      const give = Math.min(batch.allocatedQuantity, toRelease);
      await Batch.updateOne({ _id: batch._id, allocatedQuantity: { $gte: give } }, { $inc: { allocatedQuantity: -give } });
      toRelease = r4(toRelease - give);
    }
  }
  return true;
}

/** Cancels every open requisition of a work order, releasing its reserved stock */
export async function releaseWorkOrderReservations(woId: any) {
  let released = 0;
  for (const mrn of await MaterialRequisition.find({ workOrder: woId, status: { $in: ['RESERVED', 'PARTIALLY_ISSUED'] } })) if (await releaseMrn(mrn)) released++;
  return released;
}

/**
 * Hands over what the requisition reserved: each line takes only from the batches it reserved, so it can never consume units reserved for a sales order
 * or another work order. Every batch change is guarded. Returns what was taken and a function that puts it all back (used if the books cannot be posted).
 */
export async function takeReservedStock(mrn: any) {
  const takes: { batch: any; qty: number; product: any }[] = [];
  const issuedBefore = mrn.items.map((i: any) => i.issuedQty);
  const holdsBefore = mrn.items.map((i: any) => (i.holds || []).map((h: any) => h.issued || 0));
  const rollback = async () => {
    for (const t of takes) await Batch.updateOne({ _id: t.batch }, { $inc: { allocatedQuantity: t.qty, currentQuantity: t.qty } });
    mrn.items.forEach((i: any, n: number) => { i.issuedQty = issuedBefore[n]; (i.holds || []).forEach((h: any, k: number) => { h.issued = holdsBefore[n][k]; }); });
    takes.length = 0;
  };
  try {
    for (const item of mrn.items) {
      let toIssue = r4(item.reservedQty - item.issuedQty);
      if (toIssue <= 1e-9) continue;
      if (item.holds?.length) {
        for (const h of item.holds) {
          const take = Math.min(r4(h.quantity - (h.issued || 0)), toIssue);
          if (take <= 1e-9) continue;
          const res = await Batch.updateOne({ _id: h.batch, allocatedQuantity: { $gte: take - 1e-9 }, currentQuantity: { $gte: take - 1e-9 } }, { $inc: { allocatedQuantity: -take, currentQuantity: -take } });
          if (!res.modifiedCount) throw new HttpError(409, 'Reserved stock is no longer there (it may have been adjusted, moved or used). Release this requisition and reserve again.');
          takes.push({ batch: h.batch, qty: take, product: item.product });
          h.issued = r4((h.issued || 0) + take);
          toIssue = r4(toIssue - take);
        }
      }
      if (toIssue > 1e-9) {
        // whatever is not covered by recorded holds belongs to a requisition raised before holds were recorded per batch
        const batches = await Batch.find({ product: item.product, allocatedQuantity: { $gt: 0 } }).sort({ expiryDate: 1 });
        for (const batch of batches) {
          if (toIssue <= 1e-9) break;
          const take = Math.min(batch.allocatedQuantity, toIssue);
          const res = await Batch.updateOne({ _id: batch._id, allocatedQuantity: { $gte: take - 1e-9 }, currentQuantity: { $gte: take - 1e-9 } }, { $inc: { allocatedQuantity: -take, currentQuantity: -take } });
          if (!res.modifiedCount) continue;
          takes.push({ batch: batch._id, qty: take, product: item.product });
          toIssue = r4(toIssue - take);
        }
      }
      if (toIssue > 1e-9) throw new HttpError(409, 'Not all of the reserved quantity could be found in stock. Nothing was issued.');
      item.issuedQty = item.reservedQty;
    }
  } catch (err) { await rollback(); throw err; }
  return { takes, rollback };
}
