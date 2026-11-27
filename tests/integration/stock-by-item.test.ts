import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, id } from './harness';

// Stock by Item: every item from the item master with its stock from batches, open POs and open work orders,
// counted the way MRP counts it, and a status the stock list and the item master both show.
describe('stock by item', () => {
  const m: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const batch = (product: any, qty: number, extra: any = {}) => m.Batch.create({
    product: product._id, batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`, expiryDate: new Date('2030-01-01'),
    initialQuantity: qty, currentQuantity: qty, purchasePrice: 100, qualityStatus: 'APPROVED', store: 'MAIN', ...extra,
  });

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Batch', 'PurchaseOrder', 'WorkOrder']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    m.route = await import('@/app/api/inventory/stock/route');
    const item = (sku: string, extra: any = {}) => m.Product.create({ name: sku, sku, category: oid(), uom: 'pcs', minStockLevel: 10, ...extra });
    d.tube = await item('RM-TUBE');           // stock, some waiting for QC, some reserved, some on order
    d.paint = await item('RM-PAINT');         // a little stock, below reorder
    d.bolt = await item('RM-BOLT');           // none at all
    d.frame = await item('FG-FRAME', { productType: 'FINISHED_GOOD', minStockLevel: 0 });
    d.design = await item('SV-DESIGN', { productType: 'SERVICE' });
    d.scrap = await item('SC-SWARF', { isScrap: true, minStockLevel: 0 });

    await batch(d.tube, 50, { allocatedQuantity: 12 });
    await batch(d.tube, 20, { qualityStatus: 'PENDING_QC', store: 'QUARANTINE' });
    await batch(d.tube, 5, { purchasePrice: 0 });
    await batch(d.paint, 4);
    await batch(d.frame, 3);
    await batch(d.scrap, 40);
    await m.PurchaseOrder.create({ poNumber: 'PO-S-1', supplier: oid(), status: 'PARTIALLY_RECEIVED', totalAmount: 1, items: [{ product: d.tube._id, quantity: 100, receivedQuantity: 30, unitPrice: 100, totalPrice: 10000 }] });
    await m.PurchaseOrder.create({ poNumber: 'PO-S-2', supplier: oid(), status: 'RECEIVED', totalAmount: 1, items: [{ product: d.tube._id, quantity: 999, receivedQuantity: 999, unitPrice: 1, totalPrice: 1 }] });
    await m.WorkOrder.create({ woNumber: 'WO-S-1', product: d.frame._id, bom: oid(), quantity: 8, fgReceivedQty: 3, demandType: 'MTS', status: 'IN_PROGRESS' });
  }, 120000);
  afterAll(stopDb);

  const all = async (q = '') => (await call(m.route.GET, 'GET', undefined, undefined, q)).json;

  it('lists every item, stocked or not, with on hand, usable, reserved, available, on order and in production', async () => {
    const rows = await all();
    expect(rows.map((r: any) => r.sku)).toEqual(['FG-FRAME', 'RM-BOLT', 'RM-PAINT', 'RM-TUBE', 'SC-SWARF', 'SV-DESIGN']);
    const tube = rows.find((r: any) => r.sku === 'RM-TUBE');
    expect(tube).toMatchObject({ onHand: 75, notUsable: 20, reserved: 12, available: 43, onOrder: 70, batches: 3, status: 'OK' });
    expect(rows.find((r: any) => r.sku === 'FG-FRAME')).toMatchObject({ onHand: 3, inProduction: 5, status: 'OK' });
  });

  it('marks out of stock, below reorder and not-stocked items', async () => {
    const rows = await all();
    const st = (sku: string) => rows.find((r: any) => r.sku === sku).status;
    expect(st('RM-BOLT')).toBe('OUT');
    expect(st('RM-PAINT')).toBe('BELOW_REORDER'); // 4 available, reorder at 10
    expect(st('SV-DESIGN')).toBe('NON_STOCK');
  });

  it('says why nothing is available: still in QC, or all reserved', async () => {
    const qc = await m.Product.create({ name: 'QC', sku: 'RM-QC', category: oid(), uom: 'pcs' });
    const held = await m.Product.create({ name: 'Held', sku: 'RM-HELD', category: oid(), uom: 'pcs' });
    await batch(qc, 9, { qualityStatus: 'PENDING_QC' });
    await batch(held, 6, { allocatedQuantity: 6 });
    const rows = await all();
    expect(rows.find((r: any) => r.sku === 'RM-QC')).toMatchObject({ onHand: 9, available: 0, status: 'NOT_RELEASED' });
    expect(rows.find((r: any) => r.sku === 'RM-HELD')).toMatchObject({ onHand: 6, reserved: 6, available: 0, status: 'ALL_RESERVED' });
    await m.Batch.deleteMany({ product: { $in: [qc._id, held._id] } });
    await m.Product.deleteMany({ _id: { $in: [qc._id, held._id] } });
  });

  it('values stock at batch cost, says how much has no cost, and leaves scrap out of the value', async () => {
    const rows = await all();
    const tube = rows.find((r: any) => r.sku === 'RM-TUBE');
    expect(tube.value).toBe(7000);      // 50 + 20 at Rs 100; the 5 with no cost are not given a made-up one
    expect(tube.costMissing).toBe(5);
    expect(rows.find((r: any) => r.sku === 'SC-SWARF')).toMatchObject({ onHand: 40, value: 0, costMissing: 0 });
  });

  it('gives one item for the item master', async () => {
    const one = await all(`?product=${id(d.paint)}`);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ sku: 'RM-PAINT', available: 4, reorderLevel: 10 });
  });
});
