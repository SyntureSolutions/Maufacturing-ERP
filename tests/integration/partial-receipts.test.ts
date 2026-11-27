import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// PO -> partial GRN -> PO partially received -> receive pending -> fully received
describe('partial deliveries against a purchase order', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const receive = (qty: number, extra: any = {}) => call(r.grns.POST, 'POST', { poId: d.poId, ...gate, items: [{ product: id(d.rm), receivedQty: qty, expiryDate: '2030-01-01' }], ...extra });
  const poNow = async () => m.PO.findById(d.poId);

  beforeAll(async () => {
    await startDb();
    m.Product = (await import('@/models/Product')).default;
    m.Supplier = (await import('@/models/Supplier')).default;
    m.PO = (await import('@/models/PurchaseOrder')).default;
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    d.rm = await m.Product.create({ name: 'Steel Tube', sku: 'RM-TUBE', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL' });
    d.s = await m.Supplier.create({ name: 'Vendor', code: 'S-1' });
    d.po = await m.PO.create({ poNumber: 'PO-P-1', supplier: d.s._id, status: 'ORDERED', totalAmount: 1000, items: [{ product: d.rm._id, quantity: 100, receivedQuantity: 0, unitPrice: 10, totalPrice: 1000 }] });
    d.poId = id(d.po);
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('a half delivery marks the PO partially received and leaves the rest pending', async () => {
    const g1 = await receive(50);
    expect(g1.status).toBe(201);
    d.grn1 = id(g1.json);
    const po = await poNow();
    expect(po.status).toBe('PARTIALLY_RECEIVED');
    expect(po.items[0].receivedQuantity).toBe(50);
    expect(po.items[0].quantity - po.items[0].receivedQuantity).toBe(50); // pending shown / pre-filled in the form
  });

  it('cannot receive more than what is still pending', async () => {
    const over = await receive(51);
    expect(over.status).toBe(400);
    expect(over.json.error).toContain('(50)');
    expect((await poNow()).items[0].receivedQuantity).toBe(50); // unchanged
  });

  it('a short second delivery keeps it partially received; the final one completes it', async () => {
    expect((await receive(30)).status).toBe(201);
    let po = await poNow();
    expect(po.status).toBe('PARTIALLY_RECEIVED');
    expect(po.items[0].receivedQuantity).toBe(80);

    expect((await receive(20)).status).toBe(201); // exactly the pending quantity
    po = await poNow();
    expect(po.status).toBe('RECEIVED');
    expect(po.items[0].receivedQuantity).toBe(100);

    const closed = await receive(1);
    expect(closed.status).toBe(409); // nothing pending, PO is closed for receiving
  });

  it('goods returned to the vendor at QC become pending again on the PO', async () => {
    asRole('QUALITY_INSPECTOR');
    // GRN 1 had 50 units: accept 40, return 10 to the vendor
    const res = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 40, scrapQty: 0, returnQty: 10 }] }, { id: d.grn1 });
    expect(res.status).toBe(200);
    const po = await poNow();
    expect(po.items[0].receivedQuantity).toBe(90); // 100 - 10 owed again
    expect(po.status).toBe('PARTIALLY_RECEIVED');

    asAdmin();
    expect((await receive(11)).status).toBe(400); // only 10 pending
    expect((await receive(10)).status).toBe(201); // vendor sends the replacement
    expect((await poNow()).status).toBe('RECEIVED');
  });

  it('non-returnable scrap is not re-opened on the PO', async () => {
    const po2 = await m.PO.create({ poNumber: 'PO-P-2', supplier: d.s._id, status: 'ORDERED', totalAmount: 100, items: [{ product: d.rm._id, quantity: 10, receivedQuantity: 0, unitPrice: 10, totalPrice: 100 }] });
    const g = await call(r.grns.POST, 'POST', { poId: id(po2), ...gate, items: [{ product: id(d.rm), receivedQty: 10, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 8, scrapQty: 2, returnQty: 0 }] }, { id: id(g.json) });
    const after = await m.PO.findById(po2._id);
    expect(after.status).toBe('RECEIVED');
    expect(after.items[0].receivedQuantity).toBe(10);
  });
});
