import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// G4: the inward GRN inspection is the one authority over a delivery's QC status; the Quality module cannot override it.
// G5: allocation, reservation, planning and dispatch share one definition of usable stock (not quarantined, not scrapped).
describe('one QC authority and one quarantine definition', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };

  const delivery = async (qty = 10) => {
    const po = await m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * 100, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: 100, totalPrice: qty * 100 }] });
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: qty, expiryDate: '2030-01-01' }] });
    expect(g.status, JSON.stringify(g.json)).toBe(201);
    const batch = await m.Batch.findById(g.json.items[0].batch);
    return { grn: g.json, batch };
  };
  const inspect = async (grn: any, line: any) => { asRole('QUALITY_INSPECTOR'); const res = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, ...line }] }, { id: grn._id }); expect(res.status, JSON.stringify(res.json)).toBe(200); };
  const check = (batch: any, status: string, extra: any = {}) => { asRole('QUALITY_INSPECTOR'); return call(r.quality.POST, 'POST', { type: 'INCOMING', batch: id(batch), status, parameters: [{ name: 'Hardness', standard: '40 HRC', actual: status === 'FAILED' ? '30' : '41', result: status === 'FAILED' ? 'FAIL' : 'PASS' }], ...extra }); };
  const fresh = (b: any) => m.Batch.findById(b._id);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Batch: 'Batch', NCR: 'NonConformance', Check: 'QualityCheck' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.quality = await import('@/app/api/quality/route');
    r.alloc = await import('@/lib/allocation');
    d.prod = await m.Product.create({ name: 'Bearing', sku: 'RM-QC', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '8482', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Bearings Ltd', code: 'S-QC', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
  }, 120000);
  afterAll(stopDb);

  describe('G4: the GRN decision is not overridden by the Quality module', () => {
    it('a passing check cannot approve a delivery that has not been inspected at the gate', async () => {
      const { batch } = await delivery();
      const res = await check(batch, 'PASSED');
      expect(res.status).toBe(201);
      expect(res.json.batchOutcome.changed).toBe(false);
      expect(await fresh(batch)).toMatchObject({ qualityStatus: 'PENDING_QC', store: 'QUARANTINE' });
    });

    it('a delivery scrapped at the gate cannot be flipped back to approved', async () => {
      const { grn, batch } = await delivery();
      await inspect(grn, { acceptedQty: 0, scrapQty: 10, returnQty: 0 });
      expect(await fresh(batch)).toMatchObject({ qualityStatus: 'REJECTED', store: 'SCRAP' });
      const res = await check(batch, 'PASSED');
      expect(res.status).toBe(201);
      expect(res.json.batchOutcome.changed).toBe(false);
      expect(await fresh(batch)).toMatchObject({ qualityStatus: 'REJECTED', store: 'SCRAP' });
    });

    it('a failing check on accepted stock puts it ON HOLD (not rejected), raises an NCR, and a later pass releases it', async () => {
      const { grn, batch } = await delivery();
      await inspect(grn, { acceptedQty: 10, scrapQty: 0, returnQty: 0 });
      expect((await fresh(batch)).qualityStatus).toBe('APPROVED');
      const failed = await check(batch, 'FAILED');
      expect(failed.status).toBe(201);
      expect(failed.json.batchOutcome).toMatchObject({ changed: true, status: 'ON_HOLD' });
      expect((await fresh(batch)).qualityStatus).toBe('ON_HOLD');
      expect(await m.NCR.countDocuments({ qualityCheck: failed.json._id })).toBe(1);
      const passed = await check(batch, 'PASSED');
      expect(passed.json.batchOutcome).toMatchObject({ changed: true, status: 'APPROVED' });
      expect((await fresh(batch)).qualityStatus).toBe('APPROVED');
    });

    it('a failing check on an uninspected delivery leaves the gate decision to the GRN', async () => {
      const { batch } = await delivery();
      const res = await check(batch, 'FAILED');
      expect(res.json.batchOutcome.changed).toBe(false);
      expect((await fresh(batch)).qualityStatus).toBe('PENDING_QC');
    });

    it('a decided check cannot be changed or decided twice', async () => {
      const { grn, batch } = await delivery();
      await inspect(grn, { acceptedQty: 10, scrapQty: 0, returnQty: 0 });
      const pending = await check(batch, 'PENDING');
      expect(pending.status).toBe(201);
      asRole('QUALITY_INSPECTOR');
      expect((await call(r.quality.PATCH, 'PATCH', { id: pending.json._id, status: 'PASSED' })).status).toBe(200);
      expect((await call(r.quality.PATCH, 'PATCH', { id: pending.json._id, status: 'FAILED' })).status).toBe(409);
      expect((await call(r.quality.PATCH, 'PATCH', { id: pending.json._id, status: 'PENDING' })).status).toBe(409);
      expect((await fresh(batch)).qualityStatus).toBe('APPROVED');
    });

    it('only quality-side roles can record or decide a check', async () => {
      const { batch } = await delivery();
      asRole('SALES');
      expect((await call(r.quality.POST, 'POST', { type: 'INCOMING', batch: id(batch), status: 'PASSED' })).status).toBe(403);
      expect((await call(r.quality.PATCH, 'PATCH', { id: String(new mongoose.Types.ObjectId()), status: 'PASSED' })).status).toBe(403);
    });

    it('a bad request is refused instead of answered with a made-up success', async () => {
      asRole('QUALITY_INSPECTOR');
      expect((await call(r.quality.POST, 'POST', { type: 'NOPE', status: 'PASSED', batch: String(new mongoose.Types.ObjectId()) })).status).toBe(400);
      expect((await call(r.quality.POST, 'POST', { type: 'INCOMING', status: 'PASSED' })).status).toBe(400);
      expect((await call(r.quality.POST, 'POST', { type: 'INCOMING', status: 'PASSED', batch: 'not-an-id' })).status).toBe(400);
      expect((await call(r.quality.POST, 'POST', { type: 'INCOMING', status: 'PASSED', batch: String(new mongoose.Types.ObjectId()), parameters: [{ name: 'x', standard: 'y', actual: 'z', result: 'FAIL' }] })).status).toBe(400);
      expect((await call(r.quality.PATCH, 'PATCH', { id: String(new mongoose.Types.ObjectId()), status: 'PASSED' })).status).toBe(404);
    });
  });

  describe('G5: accepted stock is usable only after it has left the quarantine bay', () => {
    it('sales allocation ignores accepted-but-not-put-away stock, and sees it after put-away', async () => {
      const prod = await m.Product.create({ name: 'Seal', sku: 'RM-SEAL', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '4016', gstRate: 18 });
      const mk = (over: any) => m.Batch.create({ product: prod._id, batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`, initialQuantity: 10, currentQuantity: 10, allocatedQuantity: 0, purchasePrice: 5, expiryDate: new Date('2031-01-01'), qualityStatus: 'APPROVED', ...over });
      const inBay = await mk({ store: 'QUARANTINE' });
      const scrap = await mk({ store: 'SCRAP' });
      const shelf = await mk({ store: 'W1' });

      const part = await r.alloc.allocateUpTo(id(prod), 25);
      expect(part.allocations.map((a: any) => a.batchId)).toEqual([id(shelf)]);
      expect(part.short).toBe(15);
      await r.alloc.deallocateStock(part.allocations);
      await expect(r.alloc.allocateStock(id(prod), 11)).rejects.toThrow(/Insufficient stock/);

      await m.Batch.updateOne({ _id: inBay._id }, { store: 'W2' }); // put-away
      const after = await r.alloc.allocateUpTo(id(prod), 25);
      expect(after.allocations.map((a: any) => a.batchId).sort()).toEqual([id(inBay), id(shelf)].sort());
      expect(after.short).toBe(5);
      expect((await m.Batch.findById(scrap._id)).allocatedQuantity).toBe(0);
    });
  });
});

describe('G7: inward scrap reaches the scrap register', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-9', vendorChallanNo: 'VC-9', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Scrap: 'ScrapEntry' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    d.prod = await m.Product.create({ name: 'Gasket', sku: 'RM-G7', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '4016', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Gaskets Ltd', code: 'S-G7', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
  }, 120000);
  afterAll(stopDb);

  it('scrap is written to the register, and the PO quantity stays received (the vendor is paid for scrap)', async () => {
    const po = await m.PO.create({ poNumber: 'PO-G7-1', supplier: d.sup._id, status: 'ORDERED', totalAmount: 1000, items: [{ product: d.prod._id, quantity: 10, receivedQuantity: 0, unitPrice: 100, totalPrice: 1000 }] });
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: 10, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    const res = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 7, scrapQty: 3, returnQty: 0 }] }, { id: g.json._id });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const entries = await m.Scrap.find({ product: d.prod._id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ store: 'RM_SCRAP', quantity: 3 });
    expect((await m.PO.findById(po._id)).items[0].receivedQuantity).toBe(10);
  });
});
