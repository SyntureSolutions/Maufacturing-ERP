import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// P1/U1/U2: one sales order can be read with its customer, products, hold history and below-MSP record
describe('sales order view', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.one = await import('@/app/api/sales-orders/[id]/route');
    r.hold = await import('@/app/api/sales-orders/[id]/hold/route');
    m.prod = await m.Product.create({ name: 'Frame', sku: 'FR-VIEW', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 12, minSellingPrice: 900 });
    m.cust = await m.Customer.create({ name: 'View Buyer', code: `C-${rnd()}`, billingAddress: '5 Lake Road', city: 'Pune', gstin: '27AAPFU0939F1ZV', creditLimit: 100000 });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const mkOrder = (extra: any = {}) => m.SO.create({
    soNumber: `SO-V-${rnd()}`, customer: m.cust._id, customerName: 'View Buyer', status: 'APPROVED', totalAmount: 800, poNumber: 'CPO-1',
    items: [{ product: m.prod._id, quantity: 1, unitPrice: 800, totalPrice: 800, requiredDeliveryDate: new Date('2026-12-01') }], ...extra,
  });
  const get = (o: any, role = 'ADMIN') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.one.GET, 'GET', undefined, { id: id(o) }); };

  it('returns the order with customer and product details filled in', async () => {
    const o = await mkOrder();
    const res = await get(o);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ soNumber: o.soNumber, poNumber: 'CPO-1' });
    expect(res.json.customer).toMatchObject({ name: 'View Buyer', gstin: '27AAPFU0939F1ZV', city: 'Pune', creditLimit: 100000 });
    expect(res.json.items[0].product).toMatchObject({ sku: 'FR-VIEW', name: 'Frame', hsnCode: '8714', gstRate: 12 });
    expect(res.json.items[0].product.minSellingPrice).toBeUndefined();          // the minimum price itself is not sent to the page
  });

  it('shows who held and released the order, and why', async () => {
    const o = await mkOrder();
    asRole('MANAGER');
    expect((await call(r.hold.POST, 'POST', { action: 'hold', reason: 'customer asked to wait' }, { id: id(o) })).status).toBe(200);
    expect((await call(r.hold.POST, 'POST', { action: 'release', remarks: 'cleared by customer' }, { id: id(o) })).status).toBe(200);
    const res = await get(o);
    expect(res.json.holdHistory).toHaveLength(2);
    expect(res.json.holdHistory[0]).toMatchObject({ action: 'HOLD', reason: 'customer asked to wait', role: 'MANAGER' });
    expect(res.json.holdHistory[1]).toMatchObject({ action: 'RELEASE', role: 'MANAGER' });
    expect(res.json.status).toBe('APPROVED');
  });

  it('carries the below-minimum-price approval record', async () => {
    const o = await mkOrder({ mspOverride: { by: 'Test MANAGER', role: 'MANAGER', reason: 'bulk deal, margin accepted', at: new Date(), lines: [10] } });
    const res = await get(o);
    expect(res.json.mspOverride).toMatchObject({ by: 'Test MANAGER', reason: 'bulk deal, margin accepted', lines: [10] });
  });

  it('answers 404 for an unknown or malformed id and 401 without a login', async () => {
    asAdmin();
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await call(r.one.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
    state.user = null;
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(401);
    asAdmin();
  });
});
