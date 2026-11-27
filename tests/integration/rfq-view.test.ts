import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id, state } from './harness';

// P3: one RFQ can be read with its vendors, quotes, requisitions and award
describe('rfq view', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', RFQ: 'RFQ', Indent: 'PurchaseIndent' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.one = await import('@/app/api/rfqs/[id]/route');
    m.prod = await m.Product.create({ name: 'Steel Tube', sku: 'TUBE-RV', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306' });
    m.s1 = await m.Supplier.create({ name: 'Alpha Steels', code: `A-${rnd()}`, address: 'x', paymentTerms: 'Net 30' });
    m.s2 = await m.Supplier.create({ name: 'Beta Metals', code: `B-${rnd()}`, address: 'y', paymentTerms: 'Net 30' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('returns the RFQ with vendors, quotes and products filled in', async () => {
    const rfq = await m.RFQ.create({
      number: `RFQ-V-${rnd()}`, status: 'OPEN',
      items: [{ product: m.prod._id, quantity: 100, uom: 'pcs' }],
      suppliers: [m.s1._id, m.s2._id],
      quotes: [{ supplier: m.s1._id, unitPrices: [{ product: m.prod._id, unitPrice: 50 }], freight: 200, gstPercent: 18, leadTimeDays: 7, paymentTerms: 'Net 45' }],
    });
    const res = await call(r.one.GET, 'GET', undefined, { id: id(rfq) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ number: rfq.number, status: 'OPEN' });
    expect(res.json.items[0].product).toMatchObject({ sku: 'TUBE-RV', name: 'Steel Tube' });
    expect(res.json.suppliers.map((s: any) => s.name).sort()).toEqual(['Alpha Steels', 'Beta Metals']);
    expect(res.json.quotes).toHaveLength(1);
    expect(res.json.quotes[0]).toMatchObject({ freight: 200, leadTimeDays: 7, paymentTerms: 'Net 45' });
    expect(res.json.quotes[0].supplier.name).toBe('Alpha Steels');
    expect(res.json.quotes[0].unitPrices[0].product.sku).toBe('TUBE-RV');
  });

  it('shows who the RFQ was awarded to', async () => {
    const rfq = await m.RFQ.create({
      number: `RFQ-W-${rnd()}`, status: 'AWARDED', awardedSupplier: m.s2._id, awardRemarks: 'best lead time',
      items: [{ product: m.prod._id, quantity: 10 }], suppliers: [m.s1._id, m.s2._id], quotes: [],
    });
    const res = await call(r.one.GET, 'GET', undefined, { id: id(rfq) });
    expect(res.json.awardedSupplier).toMatchObject({ name: 'Beta Metals' });
    expect(res.json.awardRemarks).toBe('best lead time');
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
