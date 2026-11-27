import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Line-level detail on requisitions, RFQs, POs and sales orders: line numbers, per-line dates, and requisition line -> PO line links.
describe('line detail on PR, RFQ, PO and SO', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', Indent: 'PurchaseIndent', RFQ: 'RFQ', SO: 'SalesOrder', Customer: 'Customer' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.purchase = await import('@/app/api/purchase/route');
    r.purchaseId = await import('@/app/api/purchase/[id]/route');
    r.indents = await import('@/app/api/purchase-indents/route');
    r.rfqs = await import('@/app/api/rfqs/route');
    r.rfq = await import('@/app/api/rfqs/[id]/route');
    r.so = await import('@/app/api/sales-orders/route');
    r.soId = await import('@/app/api/sales-orders/[id]/route');
    const cat = new mongoose.Types.ObjectId();
    d.tube = await m.Product.create({ name: 'Steel Tube', sku: 'LD-TUBE', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', price: 500 });
    d.bolt = await m.Product.create({ name: 'Bolt', sku: 'LD-BOLT', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', price: 5 });
    d.s1 = await m.Supplier.create({ name: 'Supplier One', code: 'LD-S1' });
    d.s2 = await m.Supplier.create({ name: 'Supplier Two', code: 'LD-S2' });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'LD-C1', billingAddress: 'x' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const indent = async (lines: any[], status = 'APPROVED') => {
    const created = (await call(r.indents.POST, 'POST', { items: lines })).json[0];
    await m.Indent.updateOne({ _id: created._id }, { status });
    return m.Indent.findById(created._id);
  };

  it('numbers requisition lines 10, 20, ...', async () => {
    const ind = await indent([{ product: id(d.tube), quantity: 10 }, { product: id(d.bolt), quantity: 100 }], 'PENDING');
    expect(ind.items.map((i: any) => i.lineNo)).toEqual([10, 20]);
  });

  it('an RFQ keeps the requisition lines it covers, and the awarded PO line says what it orders and when', async () => {
    const a = await indent([{ product: id(d.tube), quantity: 10, requiredBy: day('2026-12-20') }]);
    const b = await indent([{ product: id(d.tube), quantity: 5, requiredBy: day('2026-12-10') }, { product: id(d.bolt), quantity: 50 }]);
    const rfq = await call(r.rfqs.POST, 'POST', { indentIds: [id(a), id(b)], supplierIds: [id(d.s1), id(d.s2)] });
    expect(rfq.status, JSON.stringify(rfq.json)).toBe(201);
    const tubeLine = rfq.json.items.find((i: any) => String(i.product) === id(d.tube));
    expect(tubeLine.quantity).toBe(15);
    expect(new Date(tubeLine.requiredBy).toISOString()).toBe(day('2026-12-10').toISOString()); // the earliest need
    expect(tubeLine.sources).toEqual([{ indent: id(a), lineNo: 10, quantity: 10 }, { indent: id(b), lineNo: 10, quantity: 5 }]);

    expect((await call(r.rfq.PATCH, 'PATCH', { action: 'quote', supplier: id(d.s1), unitPrices: [{ product: id(d.tube), unitPrice: 400 }, { product: id(d.bolt), unitPrice: 4 }] }, { id: rfq.json._id })).status).toBe(200);
    const award = await call(r.rfq.PATCH, 'PATCH', { action: 'award', supplier: id(d.s1) }, { id: rfq.json._id });
    expect(award.status, JSON.stringify(award.json)).toBe(200);
    const po = await m.PO.findById(award.json.purchaseOrder._id).lean();
    expect(po.items.map((i: any) => i.lineNo)).toEqual([10, 20]);
    const poTube = po.items.find((i: any) => String(i.product) === id(d.tube));
    expect(poTube.sources.map((s: any) => [String(s.indent), s.lineNo, s.quantity])).toEqual([[id(a), 10, 10], [id(b), 10, 5]]);
    expect(poTube.deliveryDate.toISOString()).toBe(day('2026-12-10').toISOString());
    expect(po.expectedDeliveryDate.toISOString()).toBe(day('2026-12-10').toISOString()); // the PO is due with its first line

    const list = (await call(r.indents.GET, 'GET', undefined, undefined, '?status=RFQ_CREATED')).json;
    const shown = list.find((i: any) => String(i._id) === id(b));
    expect(shown.items.map((i: any) => [i.lineNo, i.orderedQty, i.openQty])).toEqual([[10, 5, 0], [20, 50, 0]]);
  });

  it('a hand-made PO can order requisition lines, but never more than is open', async () => {
    const ind = await indent([{ product: id(d.tube), quantity: 20 }]);
    const line = (quantity: number, sources: any[]) => ({ supplier: id(d.s2), items: [{ product: id(d.tube), quantity, unitPrice: 100, deliveryDate: '2026-11-30', sources }] });

    const first = await call(r.purchase.POST, 'POST', line(12, [{ indent: id(ind), lineNo: 10, quantity: 12 }]));
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    expect(first.json.items[0]).toMatchObject({ lineNo: 10, sources: [{ indent: id(ind), lineNo: 10, quantity: 12 }] });

    expect((await call(r.purchase.POST, 'POST', line(10, [{ indent: id(ind), lineNo: 10, quantity: 10 }]))).status).toBe(409); // only 8 open
    expect((await call(r.purchase.POST, 'POST', line(5, [{ indent: id(ind), lineNo: 10, quantity: 8 }]))).status).toBe(400);  // more than the PO line
    expect((await call(r.purchase.POST, 'POST', { supplier: id(d.s2), items: [{ product: id(d.bolt), quantity: 5, unitPrice: 1, sources: [{ indent: id(ind), lineNo: 10, quantity: 5 }] }] })).status).toBe(400); // other product
    expect((await call(r.purchase.POST, 'POST', line(5, [{ indent: id(ind), lineNo: 90, quantity: 5 }]))).status).toBe(400); // no such line

    const pending = await indent([{ product: id(d.tube), quantity: 5 }], 'PENDING');
    expect((await call(r.purchase.POST, 'POST', line(5, [{ indent: id(pending), lineNo: 10, quantity: 5 }]))).status).toBe(409);

    // cancelling the first PO frees its quantity again
    await m.PO.updateOne({ _id: first.json._id }, { status: 'CANCELLED' });
    expect((await call(r.purchase.POST, 'POST', line(20, [{ indent: id(ind), lineNo: 10, quantity: 20 }]))).status).toBe(201);
  });

  it('editing a PO keeps its line numbers, dates and requisition links, and its own quantity does not count against it', async () => {
    const ind = await indent([{ product: id(d.bolt), quantity: 30 }]);
    asRole('SUPPLY_CHAIN_MANAGER');
    const po = await call(r.purchase.POST, 'POST', { supplier: id(d.s2), items: [{ product: id(d.bolt), quantity: 30, unitPrice: 50000, deliveryDate: '2026-12-01', sources: [{ indent: id(ind), lineNo: 10, quantity: 30 }] }] });
    expect(po.status, JSON.stringify(po.json)).toBe(201);
    expect(po.json.status).toBe('PENDING_APPROVAL');
    asAdmin();
    const edit = await call(r.purchaseId.PATCH, 'PATCH', { supplier: id(d.s1) }, { id: po.json._id });
    expect(edit.status, JSON.stringify(edit.json)).toBe(200);
    const saved = await m.PO.findById(po.json._id).lean();
    expect(saved.items[0]).toMatchObject({ lineNo: 10, quantity: 30 });
    expect(saved.items[0].deliveryDate.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(saved.items[0].sources).toHaveLength(1);
  });

  it('sales order lines carry their own dates, and the order is due with its first line', async () => {
    const res = await call(r.so.POST, 'POST', { customer: id(d.cust), deliveryDate: '2026-12-31', items: [
      { product: id(d.tube), quantity: 2, unitPrice: 500, requiredDeliveryDate: '2026-12-15' },
      { product: id(d.bolt), quantity: 100, unitPrice: 5 },
    ] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.items.map((i: any) => i.lineNo)).toEqual([10, 20]);
    expect(res.json.deliveryDate.slice(0, 10)).toBe('2026-12-15');
    expect(res.json.items[1].requiredDeliveryDate).toBeUndefined(); // due with the order

    // line dates can be moved; the order's date follows them, and cannot be set on its own while lines are dated
    const moved = await call(r.soId.PATCH, 'PATCH', { lineDates: [{ lineNo: 10, requiredDeliveryDate: '2027-01-10' }, { lineNo: 20, requiredDeliveryDate: '2027-01-05' }] }, { id: res.json._id });
    expect(moved.status, JSON.stringify(moved.json)).toBe(200);
    expect(moved.json.deliveryDate.slice(0, 10)).toBe('2027-01-05');
    expect((await call(r.soId.PATCH, 'PATCH', { deliveryDate: '2027-02-01' }, { id: res.json._id })).status).toBe(400);
    expect((await call(r.soId.PATCH, 'PATCH', { lineDates: [{ lineNo: 70, requiredDeliveryDate: '2027-01-05' }] }, { id: res.json._id })).status).toBe(400);

    // an edit of the items keeps line numbers; a new line continues after the highest
    const edited = await call(r.soId.PATCH, 'PATCH', { items: [{ product: id(d.bolt), quantity: 50 }, { product: id(d.tube), quantity: 1 }] }, { id: res.json._id });
    expect(edited.status, JSON.stringify(edited.json)).toBe(200);
    expect(edited.json.items.map((i: any) => [i.lineNo, i.quantity])).toEqual([[20, 50], [10, 1]]);
  });

  it('refuses two lines with the same number', async () => {
    const res = await call(r.so.POST, 'POST', { customer: id(d.cust), items: [{ product: id(d.tube), quantity: 1, lineNo: 10 }, { product: id(d.bolt), quantity: 1, lineNo: 10 }] });
    expect(res.status).toBe(400);
  });
});
