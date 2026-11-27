import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// I11: when a save fails the caller is told so. Nothing is invented, and nothing pretends to have been approved, won or created.
describe('no fake success', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const down = () => new Error('connection lost');

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Enquiry: 'Enquiry', Quotation: 'Quotation', WO: 'WorkOrder' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.so = await import('@/app/api/sales-orders/route');
    r.soApprove = await import('@/app/api/sales-orders/[id]/approval/route');
    r.customers = await import('@/app/api/customers/route');
    r.products = await import('@/app/api/products/route');
    r.enquiries = await import('@/app/api/enquiries/route');
    r.quotation = await import('@/app/api/quotations/[id]/route');
    r.prodOne = await import('@/app/api/production/[id]/route');
    d.prod = await m.Product.create({ name: 'Widget', sku: 'W-NF', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', price: 250 });
    d.cust = await m.Customer.create({ name: 'Acme', code: 'C-NF', billingAddress: 'x' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('sales order create', () => {
    it('works out the totals itself and ignores what the client claims', async () => {
      asRole('SALES');
      const res = await call(r.so.POST, 'POST', { customer: id(d.cust), totalAmount: 1, creditCheckPassed: true, items: [{ product: id(d.prod), quantity: 4, unitPrice: 100, totalPrice: 1 }, { product: id(d.prod), quantity: 2 }] });
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.totalAmount).toBe(900);                          // 4 x 100 + 2 x the product price of 250
      expect(res.json.items.map((i: any) => i.totalPrice)).toEqual([400, 500]);
      expect(res.json.customerName).toBe('Acme');
      expect(String(res.json.customer)).toBe(id(d.cust));
      expect(res.json.creditCheckPassed).toBe(false);
      expect(res.json.status).toBe('DRAFT');
    });

    it('refuses bad input instead of inventing an order', async () => {
      asRole('SALES');
      const before = await m.SO.countDocuments({});
      const post = (b: any) => call(r.so.POST, 'POST', b);
      const line = { product: id(d.prod), quantity: 1, unitPrice: 10 };
      expect((await post({ customer: id(d.cust), items: [] })).status).toBe(400);
      expect((await post({ items: [line] })).status).toBe(400);                                              // no customer
      expect((await post({ customer: String(new mongoose.Types.ObjectId()), items: [line] })).status).toBe(404);
      expect((await post({ customer: id(d.cust), items: [{ ...line, product: String(new mongoose.Types.ObjectId()) }] })).status).toBe(400);
      expect((await post({ customer: id(d.cust), items: [{ ...line, quantity: 0 }] })).status).toBe(400);
      expect((await post({ customer: id(d.cust), items: [{ ...line, unitPrice: -5 }] })).status).toBe(400);
      expect(await m.SO.countDocuments({})).toBe(before);
    });

    it('only sales-side roles can raise one', async () => {
      asRole('STAFF');
      expect((await call(r.so.POST, 'POST', { customer: id(d.cust), items: [{ product: id(d.prod), quantity: 1, unitPrice: 10 }] })).status).toBe(403);
    });
  });

  describe('when the database fails mid-request', () => {
    it('a customer is not reported as saved', async () => {
      const spy = vi.spyOn(m.Customer, 'create').mockRejectedValueOnce(down());
      asAdmin();
      const before = (await call(r.customers.GET, 'GET')).json.length;
      const res = await call(r.customers.POST, 'POST', { name: 'Ghost Ltd', billingAddress: 'nowhere' });
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(res.json.error).toMatch(/connection lost/);
      expect((await call(r.customers.GET, 'GET')).json.length).toBe(before);
    });

    it('a product is not reported as saved, and a bad product is a 400', async () => {
      const spy = vi.spyOn(m.Product, 'create').mockRejectedValueOnce(down());
      asAdmin();
      expect((await call(r.products.POST, 'POST', { name: 'Ghost', sku: 'G-1' })).status).toBe(500);
      spy.mockRestore();
      expect((await call(r.products.POST, 'POST', {})).status).toBe(400);
    });

    it('an enquiry is not reported as saved', async () => {
      const spy = vi.spyOn(m.Enquiry, 'create').mockRejectedValueOnce(down());
      asAdmin();
      const res = await call(r.enquiries.POST, 'POST', { customerName: 'Ghost', email: 'g@x.com', items: [{ productName: 'Thing', estimatedQuantity: 1 }] });
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await m.Enquiry.countDocuments({ customerName: 'Ghost' })).toBe(0);
    });

    it('a sales order is not reported as approved and nothing is reserved', async () => {
      const so = await m.SO.create({ soNumber: `SO-NF-${rnd()}`, customer: d.cust._id, customerName: 'Acme', items: [{ product: d.prod._id, quantity: 1, unitPrice: 10, totalPrice: 10 }], totalAmount: 10, status: 'DRAFT' });
      const spy = vi.spyOn(m.SO, 'findById').mockImplementationOnce(() => { throw down(); });
      asAdmin();
      const res = await call(r.soApprove.POST, 'POST', {}, { id: id(so) });
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(res.json)).not.toMatch(/Demo Mode/);
      expect((await m.SO.findById(so._id)).status).toBe('DRAFT');
    });

    it('a deal is not reported as won when nothing was saved', async () => {
      const q = await m.Quotation.create({ quoteNumber: `QT-NF-${rnd()}`, customerName: 'Acme', items: [{ productName: 'x', quantity: 1, unitPrice: 10, totalPrice: 10 }], totalAmount: 10, stage: 'QUOTATION_SENT' });
      const spy = vi.spyOn(m.Quotation, 'findById').mockImplementationOnce(() => { throw down(); });
      asAdmin();
      const res = await call(r.quotation.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'PO-1' }, { id: id(q) });
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(res.json)).not.toMatch(/demo/i);
      expect(await m.SO.countDocuments({ poNumber: 'PO-1' })).toBe(0);
    });
  });

  it('changing the status of a work order that does not exist is a 404, not a pretend success', async () => {
    asRole('PRODUCTION_MANAGER');
    const res = await call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS' }, { id: String(new mongoose.Types.ObjectId()) });
    expect(res.status).toBe(404);
  });
});
