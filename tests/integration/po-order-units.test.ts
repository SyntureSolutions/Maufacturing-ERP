import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// Buying in the item's purchase unit: a PO line typed as 4 bags at Rs 1,250 a bag is kept as 100 kg at Rs 50/kg, so
// receiving, stock and MRP work in kg as before, while the supplier's copy of the PO reads in bags.
describe('PO lines in the purchase unit', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Supplier', 'PurchaseOrder', 'Batch', 'CompanySettings']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.po = await import('@/app/api/purchase/route');
    r.poOne = await import('@/app/api/purchase/[id]/route');
    r.grn = await import('@/app/api/grn/route');
    m.print = await import('@/lib/printDocs');
    asAdmin();
    d.chilli = await m.Product.create({ name: 'Red Chilli', sku: 'RM-CHILLI', category: oid(), uom: 'kg', productType: 'RAW_MATERIAL', purchaseUom: 'bag', purchaseConversion: 25, purchasePrice: 50, hsnCode: '0904', gstRate: 5 });
    d.salt = await m.Product.create({ name: 'Salt', sku: 'RM-SALT', category: oid(), uom: 'kg', productType: 'RAW_MATERIAL', purchasePrice: 10, hsnCode: '2501', gstRate: 0 });
    d.sup = await m.Supplier.create({ name: 'Spice Traders', code: 'S-1', gstin: '27AAPFU0939F1ZV' });
  }, 120000);
  afterAll(stopDb);

  it('keeps a line typed in bags in kg, and remembers it was ordered in bags', async () => {
    const res = await call(r.po.POST, 'POST', { supplier: id(d.sup), items: [
      { product: id(d.chilli), unit: 'Bag', quantity: 4, unitPrice: 1250 },
      { product: id(d.salt), quantity: 30, unitPrice: 10 },
    ] });
    expect(res.status).toBe(201);
    const [chilli, salt] = res.json.items;
    expect(chilli).toMatchObject({ quantity: 100, unitPrice: 50, totalPrice: 5000, orderUnit: 'bag', orderFactor: 25 });
    expect(salt.orderUnit).toBeUndefined();
    expect(res.json.totalAmount).toBe(5300);
    d.po = res.json._id;
  });

  it('refuses a unit the item is not bought in', async () => {
    const res = await call(r.po.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.salt), unit: 'bag', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not one of its units/);
  });

  it('keeps the unit when the PO is edited without touching the line', async () => {
    await m.PurchaseOrder.updateOne({ _id: d.po }, { status: 'DRAFT' });
    const res = await call(r.poOne.PATCH, 'PATCH', { supplier: id(d.sup) }, { id: d.po });
    expect(res.status).toBe(200);
    const po: any = await m.PurchaseOrder.findById(d.po).lean();
    expect(po.items[0]).toMatchObject({ quantity: 100, unitPrice: 50, orderUnit: 'bag', orderFactor: 25 });
    await m.PurchaseOrder.updateOne({ _id: d.po }, { status: 'ORDERED' });
  });

  it('reads in bags on the supplier copy, with the kg beside it', async () => {
    const spec = await m.print.PRINT_TYPES['purchase-order'].load(d.po, new URLSearchParams());
    expect(spec.rows[0]).toMatchObject({ qty: '4 bag (= 100 kg)', rate: '1,250.00' });
    expect(spec.rows[1].qty).toBe('30 kg');
  });

  it('receives in kg at the cost per kg', async () => {
    const res = await call(r.grn.POST, 'POST', {
      poId: d.po, gateEntryNo: 'G-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234',
      checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true },
      items: [{ product: id(d.chilli), receivedQty: 50, expiryDate: '2027-12-31' }],
    });
    expect(res.status).toBe(201);
    const batch: any = await m.Batch.findOne({ product: d.chilli._id }).lean();
    expect(batch).toMatchObject({ initialQuantity: 50, purchasePrice: 50 });
    const po: any = await m.PurchaseOrder.findById(d.po).lean();
    expect(po.items[0].receivedQuantity).toBe(50); // 2 of the 4 bags
  });
});
