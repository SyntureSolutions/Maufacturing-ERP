import Product from '@/models/Product';
import PurchaseIndent from '@/models/PurchaseIndent';
import { stockByItem } from '@/lib/stockSummary';
import { defaultBoms } from '@/lib/bom';
import { nextDocNumber } from '@/lib/docNumber';

// Reorder-level check for bought items, item by item, from the item master: when what is free in stock plus what is
// already coming (open purchase orders and open indents) falls to the reorder level, raise an indent for enough to get
// back to reorder level + safety stock (the same rule MRP uses, with the safety buffer on top). Supplier, price and
// approval are decided on the way to a purchase order, not guessed here. Items made from a BOM are left to MRP.

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const REORDER_REMARK = 'Reorder-level check';
const MADE_TYPES = ['FINISHED_GOOD', 'SEMI_FINISHED'];

export interface ReorderLine {
  product: string; sku: string; name: string; uom: string;
  available: number; onOrder: number; onIndent: number; reorderLevel: number; safetyStock: number; orderQty: number;
}

/** Bought items at or below their reorder level, with what should be indented. Nothing is created. */
export async function reorderCheck(): Promise<ReorderLine[]> {
  const [rows, made, scrap, indents] = await Promise.all([
    stockByItem(),
    defaultBoms(),
    Product.find({ $or: [{ isScrap: true }, { mrpType: 'ND' }] }).select('_id').lean() as Promise<any[]>, // scrap, and items marked do not plan
    PurchaseIndent.find({ status: { $in: ['PENDING', 'APPROVED'] } }).select('items').lean() as Promise<any[]>,
  ]);
  const skip = new Set([...made.keys(), ...scrap.map(p => String(p._id))]);
  const onIndent = new Map<string, number>();
  for (const ind of indents) for (const i of ind.items || []) onIndent.set(String(i.product), (onIndent.get(String(i.product)) || 0) + (i.quantity || 0));

  return rows
    // made items (finished goods, sub-assemblies, anything with a BOM) are planned by MRP, never bought on a reorder check
    .filter(r => r.isActive && r.status !== 'NON_STOCK' && r.reorderLevel > 0 && !skip.has(r._id) && !MADE_TYPES.includes(r.productType))
    .map(r => {
      const indented = onIndent.get(r._id) || 0;
      const cover = r.available + r.onOrder + indented;
      return { product: r._id, sku: r.sku, name: r.name, uom: r.uom, available: r.available, onOrder: r.onOrder, onIndent: r3(indented),
        reorderLevel: r.reorderLevel, safetyStock: r.safetyStock, cover, orderQty: cover <= r.reorderLevel ? r3(r.reorderLevel + r.safetyStock - cover) : 0 };
    })
    .filter(r => r.orderQty > 0)
    .map(({ cover, ...r }) => r);
}

/** Raises one indent for every bought item at or below its reorder level. Returns the lines and the indent (none when nothing is due). */
export async function runReorderScan(requestedBy: string) {
  const lines = await reorderCheck();
  if (!lines.length) return { lines, indent: null };
  const indent = await PurchaseIndent.create({
    number: await nextDocNumber(PurchaseIndent, 'IND'), source: 'MRP', requestedBy,
    remarks: `${REORDER_REMARK}: ${lines.length} item${lines.length > 1 ? 's' : ''} at or below reorder level.`,
    items: lines.map(l => ({ product: l.product, quantity: l.orderQty, uom: l.uom })),
  });
  return { lines, indent };
}
