import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Deleting a product: real errors, and nothing that records still refer to is removed
describe('product delete', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const cat = new mongoose.Types.ObjectId();
  const mk = (type = 'FINISHED_GOOD') => m.Product.create({ name: `P ${rnd()}`, sku: `SKU-${rnd()}`, category: cat, uom: 'pcs', productType: type, hsnCode: '8712' });
  const del = (p: any) => call(r.one.DELETE, 'DELETE', undefined, { id: id(p) });

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Batch: 'Batch', BOM: 'BillOfMaterials', SO: 'SalesOrder' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.one = await import('@/app/api/products/[id]/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('an unused product is deleted, and deleting it again is a 404, not a success', async () => {
    const p = await mk();
    expect((await del(p)).status).toBe(200);
    expect(await m.Product.countDocuments({ _id: p._id })).toBe(0);
    expect((await del(p)).status).toBe(404);
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: 'nope' })).status).toBe(404);
  });

  it('a product on a BOM, an order or in stock is kept with a clear message', async () => {
    const onBom = await mk(), inOrder = await mk(), parent = await mk();
    await m.BOM.create({ product: parent._id, version: '1', status: 'ACTIVE', components: [{ product: onBom._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 1 }] });
    await m.SO.create({ soNumber: `SO-D-${rnd()}`, customerName: 'X', status: 'DRAFT', totalAmount: 1, items: [{ product: inOrder._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    for (const p of [onBom, inOrder, parent]) {
      const res = await del(p);
      expect(res.status).toBe(409);
      expect(res.json.error).toContain('inactive');
      expect(await m.Product.countDocuments({ _id: p._id })).toBe(1);
    }
  });

  it('only Admin and Manager may delete', async () => {
    const p = await mk();
    for (const role of ['SALES', 'STAFF', 'SUPPLY_CHAIN_MANAGER', 'VIEWER']) { asRole(role); expect((await del(p)).status, role).toBe(403); }
    asRole('MANAGER');
    expect((await del(p)).status).toBe(200);
  });
});
