import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// A4: a product update changes only the product's own fields
describe('product update', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const mk = (extra: any = {}) => m.Product.create({ name: `P ${rnd()}`, sku: `SKU-${rnd()}`, category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', price: 100, ...extra });
  const patch = (p: any, body: any, role = 'ADMIN') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.one.PATCH, 'PATCH', body, { id: id(p) }); };

  beforeAll(async () => {
    await startDb();
    const mod: any = await import('@/models/Product'); m.Product = mod.default || mod;
    r.one = await import('@/app/api/products/[id]/route');
    r.list = await import('@/app/api/products/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('changes the fields sent and leaves the rest', async () => {
    const p = await mk({ barcode: '123', oemName: 'Acme' });
    const res = await patch(p, { price: 150, minSellingPrice: 120, mrpType: 'vb', safetyStock: 5 });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ name: p.name, sku: p.sku, barcode: '123', oemName: 'Acme', price: 150, minSellingPrice: 120, mrpType: 'VB', safetyStock: 5 });
  });

  it('ignores update operators and fields that are not product fields', async () => {
    const p = await mk();
    const res = await patch(p, { name: 'Renamed', $unset: { sku: 1 }, $inc: { price: 5000 }, createdAt: '2001-01-01', __v: 99, notAField: 'x' });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const after: any = await m.Product.findById(p._id).lean();
    expect(after).toMatchObject({ name: 'Renamed', sku: p.sku, price: 100 });
    expect(new Date(after.createdAt).getFullYear()).not.toBe(2001);
    expect(after.notAField).toBeUndefined();
  });

  it('a cleared optional number is cleared', async () => {
    const p = await mk({ minSellingPrice: 90, plannedDeliveryDays: 4 });
    const res = await patch(p, { minSellingPrice: null, plannedDeliveryDays: null });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const after: any = await m.Product.findById(p._id).lean();
    expect(after.minSellingPrice ?? null).toBeNull();
    expect(after.plannedDeliveryDays ?? null).toBeNull();
  });

  it('net weight cannot be more than gross weight, also when only one of them is sent', async () => {
    const p = await mk({ grossWeight: 10, netWeight: 8 });
    expect((await patch(p, { netWeight: 11 })).status).toBe(400);               // against the stored gross weight
    expect((await patch(p, { grossWeight: 7 })).status).toBe(400);              // against the stored net weight
    expect((await patch(p, { grossWeight: 5, netWeight: 6 })).status).toBe(400);
    expect((await patch(p, { grossWeight: 12, netWeight: 11 })).status).toBe(200);
    const after: any = await m.Product.findById(p._id).lean();
    expect(after).toMatchObject({ grossWeight: 12, netWeight: 11 });
  });

  it('refuses a body that is not an object, unknown products, and other roles', async () => {
    const p = await mk();
    expect((await patch(p, ['x'])).status).toBe(400);
    expect((await call(r.one.PATCH, 'PATCH', { price: 1 }, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await call(r.one.PATCH, 'PATCH', { price: 1 }, { id: 'nope' })).status).toBe(404);
    for (const role of ['SALES', 'STAFF', 'VIEWER']) expect((await patch(p, { price: 1 }, role)).status, role).toBe(403);
    expect(((await m.Product.findById(p._id).lean()) as any).price).toBe(100);
  });

  it('creating a product also takes only product fields and checks the weights', async () => {
    asAdmin();
    const cat = new mongoose.Types.ObjectId();
    const bad = await call(r.list.POST, 'POST', { name: 'Heavy', sku: `H-${rnd()}`, category: String(cat), uom: 'pcs', grossWeight: 1, netWeight: 2 });
    expect(bad.status).toBe(400);
    const ok = await call(r.list.POST, 'POST', { name: 'Light', sku: `L-${rnd()}`, category: String(cat), uom: 'pcs', grossWeight: 2, netWeight: 1, notAField: 'x' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    expect(ok.json.notAField).toBeUndefined();
  });
});
