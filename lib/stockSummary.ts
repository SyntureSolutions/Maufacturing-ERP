import mongoose from 'mongoose';
import Product from '@/models/Product';
import '@/models/Category';
import Batch from '@/models/Batch';
import PurchaseOrder from '@/models/PurchaseOrder';
import WorkOrder from '@/models/WorkOrder';
import { USABLE_STOCK } from '@/lib/stockRules';
import { isItemActive } from '@/lib/itemRules';

// Stock of every item, item by item, worked out from its batches the same way MRP does: usable stock is approved and
// not in quarantine or scrap; available is usable less what is reserved for orders. On order is what open POs still
// have to deliver; in production is what open work orders will make. Value counts only batches with a cost.

/** OUT: none at all. NOT_RELEASED: there is stock but it waits for QC, is on hold or in quarantine. ALL_RESERVED: usable stock is all set aside. */
export type StockStatus = 'NON_STOCK' | 'OUT' | 'NOT_RELEASED' | 'ALL_RESERVED' | 'BELOW_REORDER' | 'OK';
/** The statuses where nothing can be issued today */
export const NOTHING_AVAILABLE: StockStatus[] = ['OUT', 'NOT_RELEASED', 'ALL_RESERVED'];

export interface StockRow {
  _id: string; sku: string; name: string; productType: string; category?: string; uom: string; isActive: boolean;
  onHand: number;        // every batch, whatever its quality or store
  notUsable: number;     // waiting for QC, on hold, rejected, quarantine or scrap
  reserved: number;      // usable stock set aside for orders and work orders
  available: number;     // usable and free
  onOrder: number;
  inProduction: number;
  reorderLevel: number;
  safetyStock: number;
  value: number;         // on hand at batch cost, for items counted in stock value
  costMissing: number;   // quantity on batches with no cost
  batches: number;
  lastReceipt?: Date;
  status: StockStatus;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function stockByItem(productId?: string): Promise<StockRow[]> {
  const only = productId && mongoose.isValidObjectId(productId) ? new mongoose.Types.ObjectId(productId) : null;
  const match = only ? { product: only } : {};
  const [products, all, usable, pos, wos] = await Promise.all([
    Product.find(only ? { _id: only } : {}).populate('category', 'name').lean() as Promise<any[]>,
    Batch.aggregate([
      { $match: { ...match, currentQuantity: { $gt: 0 } } },
      { $group: {
        _id: '$product', onHand: { $sum: '$currentQuantity' }, batches: { $sum: 1 }, lastReceipt: { $max: '$createdAt' },
        value: { $sum: { $cond: [{ $gt: ['$purchasePrice', 0] }, { $multiply: ['$currentQuantity', '$purchasePrice'] }, 0] } },
        costMissing: { $sum: { $cond: [{ $gt: ['$purchasePrice', 0] }, 0, '$currentQuantity'] } },
      } },
    ]),
    Batch.aggregate([
      { $match: { ...match, ...USABLE_STOCK, currentQuantity: { $gt: 0 } } },
      { $group: { _id: '$product', usable: { $sum: '$currentQuantity' }, reserved: { $sum: { $ifNull: ['$allocatedQuantity', 0] } } } },
    ]),
    PurchaseOrder.find({ status: { $in: ['PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] }, ...(only ? { 'items.product': only } : {}) }).select('items').lean() as Promise<any[]>,
    WorkOrder.find({ status: { $in: ['PLANNED', 'IN_PROGRESS'] }, ...(only ? { product: only } : {}) }).select('product quantity fgReceivedQty').lean() as Promise<any[]>,
  ]);

  const byId = <T extends { _id: any }>(rows: T[]) => new Map(rows.map(x => [String(x._id), x]));
  const stock = byId(all), free = byId(usable);
  const onOrder = new Map<string, number>(), making = new Map<string, number>();
  for (const po of pos) for (const i of po.items || []) {
    const k = String(i.product);
    onOrder.set(k, (onOrder.get(k) || 0) + Math.max(0, (i.quantity || 0) - (i.receivedQuantity || 0)));
  }
  for (const wo of wos) {
    const k = String(wo.product);
    making.set(k, (making.get(k) || 0) + Math.max(0, (wo.quantity || 0) - (wo.fgReceivedQty || 0)));
  }

  return products.map(p => {
    const k = String(p._id), s: any = stock.get(k) || {}, u: any = free.get(k) || {};
    const onHand = s.onHand || 0, usableQty = u.usable || 0, reserved = Math.min(u.reserved || 0, usableQty);
    const available = Math.max(0, usableQty - reserved);
    const reorderLevel = p.minStockLevel || 0;
    const nonStock = p.productType === 'SERVICE' || p.stockType === 'NON_STOCK';
    const status: StockStatus = nonStock ? 'NON_STOCK'
      : available > 0 ? (available < reorderLevel ? 'BELOW_REORDER' : 'OK')
        : reserved > 0 ? 'ALL_RESERVED' : onHand > 0 ? 'NOT_RELEASED' : 'OUT';
    const valued = p.includeInValuation !== false && !p.isScrap;
    return {
      _id: k, sku: p.sku, name: p.name, productType: p.productType, category: p.category?.name, uom: p.uom, isActive: isItemActive(p),
      onHand: r3(onHand), notUsable: r3(Math.max(0, onHand - usableQty)), reserved: r3(reserved), available: r3(available),
      onOrder: r3(onOrder.get(k) || 0), inProduction: r3(making.get(k) || 0), reorderLevel, safetyStock: p.safetyStock || 0,
      value: valued ? Math.round((s.value || 0) * 100) / 100 : 0, costMissing: valued ? r3(s.costMissing || 0) : 0,
      batches: s.batches || 0, lastReceipt: s.lastReceipt, status,
    };
  }).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}
