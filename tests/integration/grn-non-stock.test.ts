import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// Items marked non-stock in the item master (consumables, services) are received and paid for like anything else, but
// never become stock: no batch, no expiry, nothing to put away, and their value is an expense, not inventory.
describe('GRN of non-stock items', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const bal = async (code: string) => (await m.Account.findOne({ code }).lean())?.balance ?? 0;

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Supplier', 'PurchaseOrder', 'Batch', 'GRN', 'Account']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.grn = await import('@/app/api/grn/route');
    r.grnOne = await import('@/app/api/grn/[id]/route');
    asAdmin();
    d.steel = await m.Product.create({ name: 'Steel tube', sku: 'RM-STEEL', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL' });
    d.gloves = await m.Product.create({ name: 'Cotton gloves', sku: 'CN-GLOVE', category: oid(), uom: 'pair', productType: 'SPARE_PART', stockType: 'NON_STOCK' });
    d.sup = await m.Supplier.create({ name: 'Mill Stores', code: 'S-1' });
    d.po = await m.PurchaseOrder.create({ poNumber: 'PO-NS-1', supplier: d.sup._id, status: 'ORDERED', totalAmount: 1500, items: [
      { product: d.steel._id, quantity: 10, unitPrice: 100, totalPrice: 1000 },
      { product: d.gloves._id, quantity: 50, unitPrice: 10, totalPrice: 500 },
    ] });
  }, 120000);
  afterAll(stopDb);

  it('receives a non-stock line with no expiry and no batch', async () => {
    const res = await call(r.grn.POST, 'POST', {
      poId: id(d.po), gateEntryNo: 'G-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234',
      checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true },
      items: [{ product: id(d.steel), receivedQty: 10, expiryDate: '2030-01-01' }, { product: id(d.gloves), receivedQty: 50 }],
    });
    expect(res.status).toBe(201);
    const [steel, gloves] = res.json.items;
    expect(steel).toMatchObject({ nonStock: false });
    expect(steel.batch).toBeTruthy();
    expect(gloves).toMatchObject({ nonStock: true });
    expect(gloves.batch).toBeUndefined();
    expect(await m.Batch.countDocuments({ product: d.gloves._id })).toBe(0);
    d.grn = res.json._id;
  });

  it("records the supplier's batch number and manufacturing date on the receipt and the batch", async () => {
    const po = await m.PurchaseOrder.create({ poNumber: 'PO-NS-3', supplier: d.sup._id, status: 'ORDERED', totalAmount: 300, items: [{ product: d.steel._id, quantity: 3, unitPrice: 100, totalPrice: 300 }] });
    const receive = (line: any) => call(r.grn.POST, 'POST', { poId: id(po), gateEntryNo: 'G-3', vendorChallanNo: 'VC-3', vehicleNo: 'X', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true }, items: [{ product: id(d.steel), receivedQty: 1, expiryDate: '2030-01-01', ...line }] });
    expect((await receive({ manufacturingDate: '2031-01-01' })).json.error).toMatch(/future/);
    expect((await receive({ manufacturingDate: 'nope' })).json.error).toMatch(/not a valid date/);
    expect((await receive({ supplierBatchNo: 'X'.repeat(41) })).json.error).toMatch(/40 characters/);
    const res = await receive({ supplierBatchNo: ' LOT-77A ', manufacturingDate: '2026-01-15' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.items[0]).toMatchObject({ supplierBatchNo: 'LOT-77A' });
    const batch: any = await m.Batch.findById(res.json.items[0].batch).lean();
    expect(batch.supplierBatchNo).toBe('LOT-77A');
    expect(batch.manufacturingDate.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(batch.batchNumber).toMatch(/^BN-/); // our own number stays unique; the supplier's is kept beside it
  });

  it('still needs an expiry for stocked items', async () => {
    const po = await m.PurchaseOrder.create({ poNumber: 'PO-NS-2', supplier: d.sup._id, status: 'ORDERED', totalAmount: 100, items: [{ product: d.steel._id, quantity: 1, unitPrice: 100, totalPrice: 100 }] });
    const res = await call(r.grn.POST, 'POST', { poId: id(po), gateEntryNo: 'G-2', vendorChallanNo: 'VC-2', vehicleNo: 'X', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true }, items: [{ product: id(d.steel), receivedQty: 1 }] });
    expect(res.json.error).toMatch(/Expiry date is required/);
  });

  it('books accepted non-stock goods as an expense, stock as inventory, and returns from the same accounts', async () => {
    const inv0 = await bal('1030'), exp0 = await bal('5040');
    const res = await call(r.grnOne.PATCH, 'PATCH', { action: 'inspect', items: [
      { index: 0, acceptedQty: 10, scrapQty: 0, returnQty: 0 },
      { index: 1, acceptedQty: 40, scrapQty: 0, returnQty: 10 },
    ] }, { id: d.grn });
    expect(res.status).toBe(200);
    // steel 10 x 100 into inventory; gloves 50 x 10 expensed, then 10 returned out of the expense again
    expect(await bal('1030') - inv0).toBe(1000);
    expect(await bal('5040') - exp0).toBe(400);
    const grn: any = await m.GRN.findById(d.grn).lean();
    expect(grn.status).toBe('QC_DONE'); // the steel still waits for put-away; the gloves do not
  });

  it('has nothing to put away for a non-stock line', async () => {
    const res = await call(r.grnOne.PATCH, 'PATCH', { action: 'putaway', index: 1, warehouse: 'W1', zone: 'A', rack: '1', bin: '1' }, { id: d.grn });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/not kept in stock/);
  });
});
