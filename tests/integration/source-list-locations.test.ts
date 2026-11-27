import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Source list (who may supply a product, and when) and storage locations as master data.
describe('source list and storage locations', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const year = { validFrom: '2026-01-01', validTo: '2027-12-31' };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', Indent: 'PurchaseIndent', Batch: 'Batch', GRN: 'GRN', Run: 'MRPRun', Loc: 'StorageLocation' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.sources = await import('@/app/api/source-lists/route');
    r.source = await import('@/app/api/source-lists/[id]/route');
    r.purchase = await import('@/app/api/purchase/route');
    r.rfqs = await import('@/app/api/rfqs/route');
    r.rfq = await import('@/app/api/rfqs/[id]/route');
    r.mrpIndents = await import('@/app/api/mrp/indents/route');
    r.locations = await import('@/app/api/storage-locations/route');
    r.location = await import('@/app/api/storage-locations/[id]/route');
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    const cat = new mongoose.Types.ObjectId();
    d.motor = await m.Product.create({ name: 'Motor', sku: 'SL-MOTOR', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL' });
    d.free = await m.Product.create({ name: 'Washer', sku: 'SL-FREE', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL' });
    d.approved = await m.Supplier.create({ name: 'Approved Motors', code: 'SL-A' });
    d.other = await m.Supplier.create({ name: 'Other Motors', code: 'SL-B' });
    d.blocked = await m.Supplier.create({ name: 'Blocked Motors', code: 'SL-X' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const entry = (extra: any) => call(r.sources.POST, 'POST', { product: id(d.motor), ...year, ...extra });

  describe('source list', () => {
    it('keeps entries consistent', async () => {
      expect((await entry({ supplier: id(d.approved), fixed: true })).status).toBe(201);
      expect((await entry({ supplier: id(d.blocked), blocked: true })).status).toBe(201);
      expect((await entry({ supplier: id(d.approved), validFrom: '2027-06-01', validTo: '2028-06-01' })).status).toBe(409); // same supplier, overlapping
      expect((await entry({ supplier: id(d.other), fixed: true })).status).toBe(409);                                         // a second fixed source
      expect((await entry({ supplier: id(d.other), validFrom: '2027-01-01', validTo: '2026-01-01' })).status).toBe(400);
      expect((await entry({ supplier: id(d.other), fixed: true, blocked: true, validFrom: '2030-01-01', validTo: '2030-12-31' })).status).toBe(400);
      asRole('SALES');
      expect((await entry({ supplier: id(d.other), validFrom: '2030-01-01', validTo: '2030-12-31' })).status).toBe(403);
      asAdmin();
    });

    it('a PO for a listed product must use a listed, unblocked supplier', async () => {
      const po = (supplier: any, product: any) => call(r.purchase.POST, 'POST', { supplier: id(supplier), items: [{ product: id(product), quantity: 1, unitPrice: 10 }] });
      const notListed = await po(d.other, d.motor);
      expect(notListed.status).toBe(409);
      expect(notListed.json.error).toContain('Approved Motors');
      expect((await po(d.blocked, d.motor)).json.error).toContain('blocked');
      expect((await po(d.approved, d.motor)).status).toBe(201);
      expect((await po(d.other, d.free)).status).toBe(201); // no source list: anyone
    });

    it('an RFQ cannot be awarded to a supplier the source list does not allow', async () => {
      const created = await m.Indent.create({ number: 'IND-SL-1', status: 'APPROVED', items: [{ product: d.motor._id, quantity: 4 }] });
      const rfq = await call(r.rfqs.POST, 'POST', { indentIds: [id(created)], supplierIds: [id(d.approved), id(d.other)] });
      expect(rfq.status, JSON.stringify(rfq.json)).toBe(201);
      for (const s of [d.approved, d.other]) await call(r.rfq.PATCH, 'PATCH', { action: 'quote', supplier: id(s), unitPrices: [{ product: id(d.motor), unitPrice: 90 }] }, { id: rfq.json._id });
      expect((await call(r.rfq.PATCH, 'PATCH', { action: 'award', supplier: id(d.other) }, { id: rfq.json._id })).status).toBe(409);
      expect((await call(r.rfq.PATCH, 'PATCH', { action: 'award', supplier: id(d.approved) }, { id: rfq.json._id })).status).toBe(200);
    });

    it('planning proposes the fixed supplier on its requisitions', async () => {
      const run = await m.Run.collection.insertOne({ runDate: new Date(), matrix: [{ product: d.motor._id, orderType: 'PURCHASE', netIndentQty: 7, category: 'Motors' }], createdAt: new Date() });
      const res = await call(r.mrpIndents.POST, 'POST', { runId: String(run.insertedId) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(String(res.json.created[0].items[0].preferredSupplier)).toBe(id(d.approved));
    });

    it('can be changed and removed', async () => {
      const row = (await call(r.sources.GET, 'GET', undefined, undefined, `?product=${id(d.motor)}`)).json.find((e: any) => e.blocked);
      const unblocked = await call(r.source.PATCH, 'PATCH', { blocked: false }, { id: row._id });
      expect(unblocked.status, JSON.stringify(unblocked.json)).toBe(200);
      expect((await call(r.purchase.POST, 'POST', { supplier: id(d.blocked), items: [{ product: id(d.motor), quantity: 1, unitPrice: 10 }] })).status).toBe(201);
      expect((await call(r.source.DELETE, 'DELETE', undefined, { id: row._id })).status).toBe(200);
    });
  });

  describe('storage locations', () => {
    it('starts with the original three warehouses and takes new ones', async () => {
      const list = (await call(r.locations.GET, 'GET')).json;
      expect(list.map((l: any) => l.code)).toEqual(['W1', 'W2', 'W3']);
      const created = await call(r.locations.POST, 'POST', { code: '1106', name: 'Consumables', plant: 'pl01', zones: 'a, b', racks: [], bins: [] });
      expect(created.status, JSON.stringify(created.json)).toBe(201);
      expect(created.json).toMatchObject({ code: '1106', plant: 'PL01', zones: ['A', 'B'] });
      expect((await call(r.locations.POST, 'POST', { code: 'QUARANTINE', name: 'x' })).status).toBe(400); // a system store
      expect((await call(r.locations.POST, 'POST', { code: '1106', name: 'again' })).status).toBe(409);
      asRole('SALES');
      expect((await call(r.locations.POST, 'POST', { code: '1107', name: 'Site Returns' })).status).toBe(403);
      asAdmin();
    });

    it('put-away goes only to an active location and a zone it lists', async () => {
      const po = await m.PO.create({ poNumber: 'PO-SL-LOC', supplier: d.approved._id, status: 'ORDERED', totalAmount: 100, items: [{ product: d.free._id, quantity: 10, unitPrice: 10, totalPrice: 100 }] });
      const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.free), receivedQty: 10, expiryDate: '2030-01-01' }] });
      expect(g.status, JSON.stringify(g.json)).toBe(201);
      expect((await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 10, scrapQty: 0, returnQty: 0 }] }, { id: g.json._id })).status).toBe(200);

      const put = (body: any) => call(r.grn.PATCH, 'PATCH', { action: 'putaway', index: 0, ...body }, { id: g.json._id });
      expect((await put({ warehouse: '1106', zone: 'C' })).status).toBe(400);     // zone not in the location
      expect((await put({ warehouse: 'W9', zone: 'A', rack: 'R1', bin: 'B1' })).status).toBe(400);
      const ok = await put({ warehouse: '1106', zone: 'b' });                     // racks and bins are not used there
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      const batch = await m.Batch.findOne({ grn: g.json._id }).lean();
      expect(batch).toMatchObject({ store: '1106', zone: 'B' });

      // a location holding stock cannot be taken out of use
      const loc = await m.Loc.findOne({ code: '1106' });
      expect((await call(r.location.PATCH, 'PATCH', { isActive: false }, { id: id(loc) })).status).toBe(409);
      expect((await call(r.location.PATCH, 'PATCH', { code: '1199' }, { id: id(loc) })).status).toBe(400);
    });

    it('an emptied location can be taken out of use, and then nothing can be put there', async () => {
      const loc = await m.Loc.findOne({ code: 'W3' });
      const off = await call(r.location.PATCH, 'PATCH', { isActive: false }, { id: id(loc) });
      expect(off.status, JSON.stringify(off.json)).toBe(200);
      expect((await call(r.locations.GET, 'GET')).json.map((l: any) => l.code)).not.toContain('W3');
      expect((await call(r.locations.GET, 'GET', undefined, undefined, '?all=1')).json.map((l: any) => l.code)).toContain('W3');
      const { checkPlace } = await import('@/lib/storageLocations');
      expect(await checkPlace('W3', 'A', 'R1', 'B1')).toContain('not in use');
    });
  });
});
