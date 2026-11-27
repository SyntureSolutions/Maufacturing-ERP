import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// A2: a wrongly entered storage location can be deleted, a used one cannot. A3: transfers move stock between storage locations.
describe('storage location delete and transfers by location', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 5).toUpperCase();
  const mkLoc = async (extra: any = {}) => {
    asAdmin();
    const res = await call(r.loc.POST, 'POST', { code: `L${rnd()}`, name: 'Test location', ...extra });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    return res.json;
  };
  const mkBatch = (store?: string, qty = 10) => m.Batch.create({ batchNumber: `B-${rnd()}${rnd()}`, product: m.prod._id, initialQuantity: qty, currentQuantity: qty, allocatedQuantity: 0, purchasePrice: 5, expiryDate: new Date('2032-01-01'), qualityStatus: 'APPROVED', ...(store ? { store } : {}) });
  const transfer = (body: any, role = 'STAFF') => { asRole(role); return call(r.transfers.POST, 'POST', body); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Batch: 'Batch', Loc: 'StorageLocation' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.loc = await import('@/app/api/storage-locations/route');
    r.one = await import('@/app/api/storage-locations/[id]/route');
    r.transfers = await import('@/app/api/inventory/transfers/route');
    m.prod = await m.Product.create({ name: 'Bolt', sku: 'BOLT-LT', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7318' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('A2: delete a storage location', () => {
    it('an unused location is deleted; deleting it again is a 404', async () => {
      const loc = await mkLoc();
      asRole('SUPPLY_CHAIN_MANAGER');
      expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(loc) })).status).toBe(200);
      expect(await m.Loc.countDocuments({ _id: loc._id })).toBe(0);
      expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(loc) })).status).toBe(404);
      expect((await call(r.one.DELETE, 'DELETE', undefined, { id: 'nope' })).status).toBe(404);
    });

    it('a location that holds or once held stock is kept, with the reason', async () => {
      const loc = await mkLoc();
      await mkBatch(loc.code, 0);                                   // even empty: the batch still names it
      asRole('MANAGER');
      const res = await call(r.one.DELETE, 'DELETE', undefined, { id: id(loc) });
      expect(res.status).toBe(409);
      expect(res.json.error).toContain('out of use');
      expect(await m.Loc.countDocuments({ _id: loc._id })).toBe(1);
    });

    it('only Admin, Manager and Supply Chain may delete', async () => {
      const loc = await mkLoc();
      for (const role of ['STAFF', 'SALES', 'VIEWER', 'FINANCE_MANAGER']) { asRole(role); expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(loc) })).status, role).toBe(403); }
      expect(await m.Loc.countDocuments({ _id: loc._id })).toBe(1);
    });
  });

  describe('A3: transfers by storage location', () => {
    it('refuses an unknown or inactive origin or destination, and the same place on both ends', async () => {
      const a = await mkLoc(), b = await mkLoc();
      const batch = await mkBatch(a.code);
      const items = [{ batchId: id(batch), requestedQuantity: 1 }];
      for (const body of [{ fromWarehouse: 'Central Depot', toWarehouse: b.code }, { fromWarehouse: a.code, toWarehouse: 'Plant 1' }]) {
        const res = await transfer({ ...body, items });
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.json.error).toContain('does not exist');
      }
      expect((await transfer({ fromWarehouse: a.code, toWarehouse: a.code, items })).status).toBe(400);
      asAdmin();
      await call(r.one.PATCH, 'PATCH', { isActive: false }, { id: id(b) });
      const off = await transfer({ fromWarehouse: a.code, toWarehouse: b.code, items });
      expect(off.status).toBe(400);
      expect(off.json.error).toContain('not in use');
    });

    it('a batch must be in the origin; codes are kept in capitals; receiving puts the stock in the destination store', async () => {
      const a = await mkLoc(), b = await mkLoc();
      const elsewhere = await mkBatch(b.code), here = await mkBatch(a.code);
      const wrong = await transfer({ fromWarehouse: a.code, toWarehouse: b.code, items: [{ batchId: id(elsewhere), requestedQuantity: 1 }] });
      expect(wrong.status).toBe(409);
      expect(wrong.json.error).toContain(`is in ${b.code}`);
      const ok = await transfer({ fromWarehouse: a.code.toLowerCase(), toWarehouse: b.code.toLowerCase(), items: [{ batchId: id(here), requestedQuantity: 4 }] });
      expect(ok.status, JSON.stringify(ok.json)).toBe(201);
      expect(ok.json).toMatchObject({ fromWarehouse: a.code, toWarehouse: b.code });
      asRole('STAFF');
      expect((await call(r.transfers.PATCH, 'PATCH', { transferId: id(ok.json), action: 'DISPATCH' })).status).toBe(200);
      expect((await call(r.transfers.PATCH, 'PATCH', { transferId: id(ok.json), action: 'RECEIVE' })).status).toBe(200);
      const dest: any = await m.Batch.findOne({ batchNumber: new RegExp(`^${here.batchNumber}-T`) }).lean();
      expect(dest).toMatchObject({ store: b.code, location: b.code, currentQuantity: 4 });
    });

    it('a location used by a transfer can no longer be deleted', async () => {
      const a = await mkLoc(), b = await mkLoc();
      const batch = await mkBatch(a.code);
      expect((await transfer({ fromWarehouse: a.code, toWarehouse: b.code, items: [{ batchId: id(batch), requestedQuantity: 1 }] })).status).toBe(201);
      asAdmin();
      expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(b) })).status).toBe(409);   // named by the transfer only
    });
  });
});
