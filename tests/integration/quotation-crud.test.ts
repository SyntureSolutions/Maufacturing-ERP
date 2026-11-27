import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Quotations made, changed and deleted from the Quotation screen: numbers, totals and GST worked out on the server,
// drafts changed in place, sent quotations only by revision, and a won quotation raising exactly one sales order.
describe('quotation create, change and delete', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', Quote: 'Quotation', SO: 'SalesOrder', Enquiry: 'Enquiry' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.list = await import('@/app/api/quotations/route');
    r.one = await import('@/app/api/quotations/[id]/route');
    r.revise = await import('@/app/api/quotations/[id]/revise/route');
    r.company = await import('@/app/api/settings/company/route');
    m.frame = await m.Product.create({ name: 'Frame', sku: 'FR-QC', category: new mongoose.Types.ObjectId(), uom: 'pcs', hsnCode: '8714', gstRate: 12 });
    m.tyre = await m.Product.create({ name: 'Tyre', sku: 'TY-QC', category: new mongoose.Types.ObjectId(), uom: 'pcs', hsnCode: '4011', gstRate: 28 });
    m.local = await m.Customer.create({ name: 'Pune Cycles', code: `C-${rnd()}`, billingAddress: '1 FC Road', city: 'Pune', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 45', creditLimit: 1e9 });
    asRole('FINANCE_MANAGER');
    await call(r.company.PUT, 'PUT', { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const create = (body: any, role = 'SALES') => { asRole(role); return call(r.list.POST, 'POST', body); };
  const lines = () => [{ product: id(m.frame), quantity: 2, unitPrice: 1000 }, { product: id(m.tyre), quantity: 4, unitPrice: 500, totalPrice: 1 }];

  it('an empty list is empty, not sample quotations', async () => {
    asAdmin();
    const res = await call(r.list.GET, 'GET');
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]);
  });

  it('creates a numbered draft with totals and GST worked out on the server', async () => {
    const res = await create({ customer: id(m.local), items: lines(), totalAmount: 1, validUntil: '2026-12-31', terms: 'Ex-works' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ quoteNumber: expect.stringMatching(/^QT-/), stage: 'ENQUIRY_RECEIVED', customerName: 'Pune Cycles', paymentTerms: 'NET 45', totalAmount: 4000, terms: 'Ex-works' });
    expect(res.json.items[1]).toMatchObject({ productName: 'Tyre', totalPrice: 2000 }); // the sent line total is ignored
    // same state: CGST + SGST; 2000 × 12% + 2000 × 28% = 800 of tax
    expect(res.json.taxSummary).toMatchObject({ subTotal: 4000, totalCGST: 400, totalSGST: 400, totalIGST: 0, grandTotal: 4800 });
    const next = await create({ customerName: 'Walk-in Prospect', items: [{ productName: 'Custom frame', quantity: 1, unitPrice: 5000 }] });
    expect(next.status, JSON.stringify(next.json)).toBe(201);
    expect(Number(next.json.quoteNumber.split('-').pop())).toBe(Number(res.json.quoteNumber.split('-').pop()) + 1); // numbers follow on
  });

  it('refuses bad quotations and people who may not make them', async () => {
    expect((await create({ items: lines() })).status).toBe(400); // no customer
    expect((await create({ customer: id(m.local), items: [] })).status).toBe(400);
    expect((await create({ customer: id(m.local), items: [{ product: String(new mongoose.Types.ObjectId()), quantity: 1, unitPrice: 1 }] })).status).toBe(400);
    expect((await create({ customer: id(m.local), items: [{ product: id(m.frame), quantity: 0, unitPrice: 1 }] })).status).toBe(400);
    expect((await create({ customer: id(m.local), items: [lines()[0], lines()[0]] })).status).toBe(400); // same item twice
    expect((await create({ customer: id(m.local), items: lines(), orderType: 'EXPORT' })).status).toBe(400); // export needs currency, ports…
    for (const role of ['STAFF', 'VIEWER', 'FINANCE_MANAGER']) expect((await create({ customer: id(m.local), items: lines() }, role)).status, role).toBe(403);
  });

  it('changes a draft in place, but a sent quotation only by revision', async () => {
    const q = (await create({ customer: id(m.local), items: lines() })).json;
    const ed = await call(r.one.PATCH, 'PATCH', { items: [{ product: id(m.frame), quantity: 5, unitPrice: 900 }], paymentTerms: 'ADVANCE' }, { id: q._id });
    expect(ed.status, JSON.stringify(ed.json)).toBe(200);
    expect(ed.json.quotation).toMatchObject({ totalAmount: 4500, paymentTerms: 'ADVANCE', revision: 1 });
    expect(ed.json.quotation.revisions).toHaveLength(0);

    expect((await call(r.one.PATCH, 'PATCH', { stage: 'QUOTATION_SENT' }, { id: q._id })).status).toBe(200);
    expect((await call(r.one.PATCH, 'PATCH', { items: lines() }, { id: q._id })).status).toBe(409);
    const rev = await call(r.revise.POST, 'POST', { items: lines(), note: 'Customer asked for tyres too' }, { id: q._id });
    expect(rev.status, JSON.stringify(rev.json)).toBe(200);
    expect(rev.json).toMatchObject({ revision: 2, totalAmount: 4000 });
    expect(rev.json.revisions[0]).toMatchObject({ rev: 1, totalAmount: 4500 });
    asRole('STAFF');
    expect((await call(r.one.PATCH, 'PATCH', { stage: 'UNDER_REVIEW' }, { id: q._id })).status).toBe(403);
    asRole('SALES');
    expect((await call(r.one.PATCH, 'PATCH', { stage: 'WON' }, { id: q._id })).status).toBe(400);
  });

  it('a won quotation raises exactly one sales order, however often it is won', async () => {
    const q = (await create({ customer: id(m.local), items: lines() })).json;
    const won = await Promise.all([1, 2, 3].map(() => call(r.one.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'CPO-77' }, { id: q._id })));
    expect(won.filter(w => w.status === 200)).toHaveLength(1);
    expect(won.filter(w => w.status === 409)).toHaveLength(2);
    expect(await m.SO.countDocuments({ quotation: q._id })).toBe(1);
    expect((await call(r.one.PATCH, 'PATCH', { stage: 'LOST_DECLINED', lossCategory: 'PRICE', lossReason: 'too late' }, { id: q._id })).status).toBe(409);
  });

  it('a typed-in line must be matched to an item before the order is taken', async () => {
    const q = (await create({ customerName: 'Prospect Two', items: [{ productName: 'Special frame', quantity: 1, unitPrice: 100 }] })).json;
    const res = await call(r.one.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'P-1' }, { id: q._id });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not linked to an item/);
    expect(await m.SO.countDocuments({ quotation: q._id })).toBe(0);
    expect(((await m.Quote.findById(q._id).lean()) as any).salesOrderRef).toBeUndefined();
  });

  it('deletes a draft that was never sent, and frees its enquiry; anything sent is kept', async () => {
    const enq = await m.Enquiry.create({ enquiryNumber: `ENQ-${rnd()}`, customerName: 'Pune Cycles', status: 'QUALIFIED', items: [{ productName: 'Frame', estimatedQuantity: 2 }] });
    const draft = (await create({ customer: id(m.local), items: lines() })).json;
    await m.Quote.updateOne({ _id: draft._id }, { enquiry: enq._id });
    asRole('SALES');
    const del = await call(r.one.DELETE, 'DELETE', undefined, { id: draft._id });
    expect(del.status, JSON.stringify(del.json)).toBe(200);
    expect(await m.Quote.countDocuments({ _id: draft._id })).toBe(0);
    expect(((await m.Enquiry.findById(enq._id).lean()) as any).status).toBe('NEW');

    const sent = (await create({ customer: id(m.local), items: lines() })).json;
    await call(r.one.PATCH, 'PATCH', { stage: 'QUOTATION_SENT' }, { id: sent._id });
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: sent._id })).status).toBe(409);
    asRole('STAFF');
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: sent._id })).status).toBe(403);
    asAdmin();
  });
});
