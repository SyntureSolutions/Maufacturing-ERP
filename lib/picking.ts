import PickList from '@/models/PickList';
import Batch from '@/models/Batch';
import { USABLE_STOCK } from '@/lib/stockRules';
import { HttpError } from '@/lib/httpError';
import CompanySettings from '@/models/CompanySettings';

// Picking: when the company uses pick lists (the default), a delivery challan may only go out for goods that were picked. Pick lists are planned from the batches
// reserved for the order, then from free usable stock, earliest expiry first.

/** Who may make and confirm pick lists: the people who work the warehouse and dispatch. */
export const PICK_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];

/** Whether challans need picked goods (Company profile > Use pick lists before dispatch). On unless turned off. */
export async function usesPickLists() {
  const c: any = await CompanySettings.findOne({ key: 'company' }, { usePickLists: 1 }).lean();
  return c?.usePickLists !== false;
}

const EPS = 1e-9;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface PickClaim { pickList: string; line: string; qty: number }

const sum = (xs: number[]) => r4(xs.reduce((a, b) => a + b, 0));

/** Per product: what is picked and not yet dispatched, and what is on open (unconfirmed) lists, for one order. */
export async function pickedPosition(soId: any) {
  const lists: any[] = await PickList.find({ salesOrder: soId, status: { $in: ['OPEN', 'PICKED'] } }).lean();
  const picked = new Map<string, number>(), planned = new Map<string, number>();
  for (const l of lists) for (const line of l.lines) {
    const p = String(line.product);
    if (l.status === 'PICKED') picked.set(p, r4((picked.get(p) || 0) + (line.pickedQty - (line.dispatchedQty || 0))));
    else planned.set(p, r4((planned.get(p) || 0) + line.quantity));
  }
  return { picked, planned };
}

/** The lines a new pick list should carry: for each product, what the order still needs that is not already picked or planned. */
export async function planPickLines(so: any) {
  const { picked, planned } = await pickedPosition(so._id);
  const needByProduct = new Map<string, number>();
  for (const item of so.items || []) {
    const p = String(item.product?._id || item.product);
    needByProduct.set(p, r4((needByProduct.get(p) || 0) + Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0))));
  }
  const lines: { product: string; batch: string; batchNumber: string; location: string; quantity: number }[] = [];
  const unplanned: { product: string; quantity: number }[] = [];
  for (const [product, outstanding] of needByProduct) {
    let need = r4(outstanding - (picked.get(product) || 0) - (planned.get(product) || 0));
    if (need <= EPS) continue;
    // 1. batches reserved for this order
    for (const res of so.allocatedBatches || []) {
      if (need <= EPS) break;
      if (String(res.product) !== product || (res.quantity || 0) <= EPS) continue;
      const b: any = await Batch.findOne({ _id: res.batch, ...USABLE_STOCK }).lean();
      if (!b) continue;
      const take = Math.min(res.quantity, b.currentQuantity || 0, need);
      if (take <= EPS) continue;
      lines.push({ product, batch: String(b._id), batchNumber: b.batchNumber, location: b.location || b.store || '', quantity: r4(take) });
      need = r4(need - take);
    }
    // 2. free usable stock
    if (need > EPS) {
      const batches: any[] = await Batch.find({ product, ...USABLE_STOCK, currentQuantity: { $gt: 0 } }).sort({ expiryDate: 1 }).lean();
      for (const b of batches) {
        if (need <= EPS) break;
        const alreadyPlanned = sum(lines.filter(l => l.batch === String(b._id)).map(l => l.quantity));
        const free = r4((b.currentQuantity || 0) - (b.allocatedQuantity || 0) - alreadyPlanned);
        if (free <= EPS) continue;
        const take = Math.min(free, need);
        lines.push({ product, batch: String(b._id), batchNumber: b.batchNumber, location: b.location || b.store || '', quantity: r4(take) });
        need = r4(need - take);
      }
    }
    if (need > EPS) unplanned.push({ product, quantity: need });
  }
  return { lines, unplanned };
}

/**
 * Takes the picked goods for a challan: for each product, from picked lines that still have undispatched quantity.
 * Each take is a compare-and-set on the line, so two challans at the same moment cannot both use the same picked units.
 * Throws a 409 (after giving back anything already taken) when a product has not been picked in full.
 */
export async function claimPicked(soId: any, allocations: { product: string; quantity: number }[], productName?: (id: string) => string): Promise<PickClaim[]> {
  const claims: PickClaim[] = [];
  try {
    for (const a of allocations) {
      let need = a.quantity;
      for (let attempt = 0; attempt < 4 && need > EPS; attempt++) {
        const lists: any[] = await PickList.find({ salesOrder: soId, status: 'PICKED', 'lines.product': a.product }).sort({ createdAt: 1 }).lean();
        let took = false;
        for (const l of lists) for (const line of l.lines) {
          if (need <= EPS) break;
          if (String(line.product) !== String(a.product)) continue;
          const avail = r4(line.pickedQty - (line.dispatchedQty || 0));
          if (avail <= EPS) continue;
          const take = Math.min(avail, need);
          const res = await PickList.updateOne(
            { _id: l._id, status: 'PICKED', lines: { $elemMatch: { _id: line._id, dispatchedQty: line.dispatchedQty || 0 } } },
            { $set: { 'lines.$.dispatchedQty': r4((line.dispatchedQty || 0) + take) } },
          );
          if (!res.modifiedCount) continue; // someone else took from it; look again
          claims.push({ pickList: String(l._id), line: String(line._id), qty: r4(take) });
          need = r4(need - take);
          took = true;
        }
        if (!took) break;
      }
      if (need > EPS) {
        const name = productName?.(String(a.product)) || 'an item';
        throw new HttpError(409, `Only ${r4(a.quantity - need)} of ${name} has been picked, and ${a.quantity} is being dispatched. Pick the goods first (Dispatch > Pick lists).`);
      }
    }
    return claims;
  } catch (err) {
    await releasePicked(claims).catch(() => {});
    throw err;
  }
}

/** Gives picked goods back to their lines (a challan failed or was cancelled), so they can be dispatched again. */
export async function releasePicked(claims: PickClaim[] | undefined) {
  for (const c of claims || []) {
    await PickList.updateOne({ _id: c.pickList, lines: { $elemMatch: { _id: c.line } } }, { $inc: { 'lines.$.dispatchedQty': -c.qty } });
  }
}
