import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

describe('sales order price lock', () => {
  const m: any = {}, r: any = {};
  let prodA = '', prodB = '';
  const make = (over: any = {}) => m.SO.create({
    soNumber: `SO-T-${Math.random().toString(36).slice(2, 8)}`, customerName: 'Acme', status: 'DRAFT', priceLocked: true, paymentTerms: 'NET 30', totalAmount: 1180,
    items: [{ product: prodA, quantity: 10, unitPrice: 100, totalPrice: 1000 }], ...over,
  });
  const patch = (so: any, body: any) => call(r.so.PATCH, 'PATCH', body, { id: id(so) });

  beforeAll(async () => {
    await startDb();
    m.SO = (await import('@/models/SalesOrder')).default;
    r.so = await import('@/app/api/sales-orders/[id]/route');
    const P = (await import('@/models/Product')).default;
    const mk = (sku: string) => P.create({ name: sku, sku, price: 100, uom: 'NOS', category: new mongoose.Types.ObjectId() } as any);
    prodA = String((await mk('PL-A'))._id); prodB = String((await mk('PL-B'))._id);
    asAdmin();
  });
  afterAll(stopDb);

  it('lets a locked order change quantity and delivery details, keeping the price', async () => {
    const so = await make();
    asRole('SALES');
    const res = await patch(so, { items: [{ product: prodA, quantity: 20 }], poNumber: 'CUST-9', deliveryDate: '2030-01-15' });
    expect(res.status).toBe(200);
    expect(res.json.items[0].unitPrice).toBe(100);
    expect(res.json.items[0].totalPrice).toBe(2000);
    expect(res.json.totalAmount).toBe(2360);          // the 18% on top of the original total scales with the quantity
    expect(res.json.poNumber).toBe('CUST-9');
    expect(res.json.priceOverrides?.length ?? 0).toBe(0);
  });

  it('refuses price, item and term changes on a locked order', async () => {
    const so = await make();
    asRole('SALES');
    for (const body of [
      { items: [{ product: prodA, quantity: 10, unitPrice: 80 }] },
      { items: [{ product: prodA, quantity: 10 }, { product: prodB, quantity: 1, unitPrice: 5 }] },
      { items: [{ product: prodB, quantity: 10, unitPrice: 100 }] },
      { paymentTerms: 'NET 90' }, { discounts: 50 }, { currency: 'USD' },
    ]) {
      const res = await patch(so, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.json.error).toContain('locked');
    }
    const after = await m.SO.findById(so._id).lean();
    expect(after.items[0].unitPrice).toBe(100);
    expect(after.paymentTerms).toBe('NET 30');
    expect(after.totalAmount).toBe(1180);
  });

  it('a sales user cannot override even with a reason; a manager can, with an audit trail', async () => {
    const so = await make();
    asRole('SALES');
    expect((await patch(so, { items: [{ product: prodA, quantity: 10, unitPrice: 90 }], overrideReason: 'customer negotiated a better rate' })).status).toBe(403);
    asRole('MANAGER', 'Mona Manager');
    expect((await patch(so, { items: [{ product: prodA, quantity: 10, unitPrice: 90 }], overrideReason: 'short' })).status).toBe(400);
    const ok = await patch(so, { items: [{ product: prodA, quantity: 10, unitPrice: 90 }], overrideReason: 'customer negotiated a better rate' });
    expect(ok.status).toBe(200);
    expect(ok.json.items[0].unitPrice).toBe(90);
    expect(ok.json.priceLocked).toBe(true);           // still locked afterwards
    expect(ok.json.priceOverrides).toHaveLength(1);
    expect(ok.json.priceOverrides[0]).toMatchObject({ by: 'Mona Manager', reason: 'customer negotiated a better rate' });
    const audit = await (await import('@/models/AuditLog')).default.findOne({ resourceName: so.soNumber, action: 'OVERRIDE' }).lean();
    expect(audit).toBeTruthy();
  });

  it('an unlocked order can be repriced freely', async () => {
    const so = await make({ priceLocked: false });
    asRole('SALES');
    const res = await patch(so, { items: [{ product: prodA, quantity: 10, unitPrice: 120 }], paymentTerms: 'NET 45' });
    expect(res.status).toBe(200);
    expect(res.json.items[0].totalPrice).toBe(1200);
    expect(res.json.paymentTerms).toBe('NET 45');
  });

  it('orders that are in fulfilment, invoiced or cancelled cannot be edited, and viewers/others are refused', async () => {
    asRole('SALES');
    for (const over of [{ status: 'IN_FULFILLMENT' }, { status: 'CANCELLED' }, { status: 'APPROVED', taxInvoiceStatus: 'INVOICED' }]) {
      expect((await patch(await make(over), { poNumber: 'X' })).status).toBe(409);
    }
    const so = await make();
    for (const role of ['VIEWER', 'STAFF', 'HR_MANAGER']) { asRole(role); expect((await patch(so, { poNumber: 'X' })).status).toBe(403); }
    asRole('SALES');
    expect((await patch(so, {})).status).toBe(400);
    expect((await patch(so, { items: [{ product: prodA, quantity: 0 }] })).status).toBe(400);
  });

  it('items and terms are fixed once the order is approved or waiting for approval; delivery details are not', async () => {
    asRole('MANAGER');
    const approved = await make({ status: 'APPROVED' });
    expect((await patch(approved, { items: [{ product: prodA, quantity: 99 }] })).status).toBe(409);
    expect((await patch(approved, { items: [{ product: prodA, quantity: 99, unitPrice: 1 }], overrideReason: 'customer asked for more' })).status).toBe(409);
    expect((await patch(approved, { poNumber: 'LATE-1' })).status).toBe(200);
    const waiting = await make({ approvalPending: true, priceLocked: false });
    expect((await patch(waiting, { items: [{ product: prodA, quantity: 5 }] })).status).toBe(409);
    expect((await m.SO.findById(approved._id).lean()).items[0].quantity).toBe(10);
  });

  it('rejects malformed input instead of failing with a server error', async () => {
    asRole('MANAGER');
    const so = await make({ priceLocked: false });
    expect((await patch(so, { items: [{ product: 'nope', quantity: 1, unitPrice: 1 }] })).status).toBe(400);
    expect((await patch(so, { items: [{ product: String(new mongoose.Types.ObjectId()), quantity: 1, unitPrice: 1 }] })).status).toBe(400);
    expect((await patch(so, { poNumber: { $ne: 1 } })).status).toBe(400);
    expect((await call(r.so.PATCH, 'PATCH', null as any, { id: id(so) })).status).toBe(400);
    expect((await call(r.so.PATCH, 'PATCH', { poNumber: 'x' }, { id: 'zzz' })).status).toBe(404);
  });

  it('two simultaneous edits do not both win', async () => {
    const so = await make();
    asRole('SALES');
    const rs = await Promise.all([patch(so, { poNumber: 'A' }), patch(so, { poNumber: 'B' })]);
    expect(rs.filter(x => x.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(rs.every(x => [200, 409].includes(x.status))).toBe(true);
  });
});
