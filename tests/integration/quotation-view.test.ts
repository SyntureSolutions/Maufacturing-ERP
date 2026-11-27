import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// P2: one quotation can be read with its customer, products, discounts and revisions
describe('quotation view', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', Quote: 'Quotation' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.one = await import('@/app/api/quotations/[id]/route');
    r.list = await import('@/app/api/quotations/route');
    m.prod = await m.Product.create({ name: 'Frame', sku: 'FR-QV', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 12 });
    m.cust = await m.Customer.create({ name: 'Quote Buyer', code: `C-${rnd()}`, billingAddress: '9 Hill Road', city: 'Nashik', gstin: '27AAPFU0939F1ZV', paymentTerms: 'Net 45' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const mk = (extra: any = {}) => m.Quote.create({
    quoteNumber: `QT-V-${rnd()}`, customer: m.cust._id, customerName: 'Quote Buyer', stage: 'QUOTATION_SENT', totalAmount: 900,
    items: [{ product: m.prod._id, productName: 'Frame', quantity: 3, unitPrice: 300, totalPrice: 900 }], ...extra,
  });
  const get = (q: any, role = 'ADMIN') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.one.GET, 'GET', undefined, { id: id(q) }); };

  it('returns the quotation with customer and product details filled in', async () => {
    const q = await mk({ poNumber: 'CPO-9', terms: 'Delivery in 4 weeks' });
    const res = await get(q);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ quoteNumber: q.quoteNumber, stage: 'QUOTATION_SENT', poNumber: 'CPO-9', terms: 'Delivery in 4 weeks' });
    expect(res.json.customer).toMatchObject({ name: 'Quote Buyer', gstin: '27AAPFU0939F1ZV', city: 'Nashik' });
    expect(res.json.items[0].product).toMatchObject({ sku: 'FR-QV', hsnCode: '8714', gstRate: 12 });
  });

  it('carries the discount requests and the revision history', async () => {
    const at = new Date();
    const q = await mk({
      revision: 2,
      discountRequests: [{ percent: 5, amount: 45, reason: 'volume order', requiredRole: 'MANAGER', status: 'APPROVED', requestedBy: 'Sales A', requestedAt: at, decidedBy: 'Manager B', decidedAt: at }],
      revisions: [{ rev: 1, items: [], totalAmount: 1000, changedBy: 'Sales A', note: 'first price', at }],
    });
    const res = await get(q);
    expect(res.json.discountRequests[0]).toMatchObject({ percent: 5, status: 'APPROVED', decidedBy: 'Manager B', reason: 'volume order' });
    expect(res.json.revisions[0]).toMatchObject({ rev: 1, totalAmount: 1000, note: 'first price' });
    expect(res.json.revision).toBe(2);
  });

  it('answers 404 for an unknown or malformed id and 401 without a login', async () => {
    asAdmin();
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await call(r.one.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
    state.user = null;
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(401);
    asAdmin();
  });

  it('the list is an error, not sample quotations, when the database fails (outside demo mode)', async () => {
    const spy = vi.spyOn(m.Quote, 'find').mockImplementationOnce((() => { throw new Error('database is down'); }) as any);
    asAdmin();
    const res = await call(r.list.GET, 'GET');
    spy.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.json)).toContain('database is down');
  });
});
