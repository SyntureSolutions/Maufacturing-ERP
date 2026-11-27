import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// Item master settings that documents and planning now follow: inactive items stay off new documents; MRP keeps safety
// stock, dates each need and says when to order using the lead time, and leaves "do not plan" items alone.
describe('item master rules', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const days = (n: number) => new Date(Date.now() + n * 86400000);

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Customer', 'Supplier', 'PurchaseOrder', 'BillOfMaterials']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    for (const [k, p] of Object.entries({ so: 'sales-orders', po: 'purchase', indent: 'purchase-indents', quote: 'quotations', wo: 'production' })) r[k] = await import(/* @vite-ignore */ `@/app/api/${p}/route`);
    r.poOne = await import('@/app/api/purchase/[id]/route');
    m.mrp = await import('@/lib/mrpEngine');
    asAdmin();
    const item = (sku: string, extra: any = {}) => m.Product.create({ name: sku, sku, category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', price: 100, ...extra });
    d.live = await item('RM-LIVE');
    d.off = await item('RM-OFF', { isActive: false });
    d.retired = await item('RM-RETIRED', { deactivatedFrom: days(-1) });
    d.retiring = await item('RM-RETIRING', { deactivatedFrom: days(30) });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'C-1', billingAddress: 'x', creditLimit: 1e9 });
    d.sup = await m.Supplier.create({ name: 'Vendor', code: 'S-1', gstin: '27AAPFU0939F1ZV' });
  }, 120000);
  afterAll(stopDb);

  const line = (p: any) => ({ product: id(p), quantity: 2, unitPrice: 100 });

  it('keeps inactive items off new documents of every kind', async () => {
    for (const p of [d.off, d.retired]) {
      expect((await call(r.so.POST, 'POST', { customer: id(d.cust), items: [line(p)] })).json.error, 'SO').toMatch(/no longer in use/);
      expect((await call(r.po.POST, 'POST', { supplier: id(d.sup), items: [line(p)] })).json.error, 'PO').toMatch(/no longer in use/);
      expect((await call(r.indent.POST, 'POST', { items: [{ product: id(p), quantity: 2 }] })).status, 'indent').toBe(400);
      expect((await call(r.quote.POST, 'POST', { customer: id(d.cust), items: [line(p)], validUntil: '2026-12-31' })).json.error, 'quotation').toMatch(/no longer in use/);
      expect((await call(r.wo.POST, 'POST', { product: id(p), bom: String(oid()), quantity: 1 })).json.error, 'WO').toMatch(/no longer in use/);
    }
    // an item retiring next month is still in use today
    expect((await call(r.so.POST, 'POST', { customer: id(d.cust), items: [line(d.retiring)] })).status).toBe(201);
  });

  it('lets a document raised before the item was retired be finished', async () => {
    const po = await call(r.po.POST, 'POST', { supplier: id(d.sup), items: [line(d.live)] });
    expect(po.status).toBe(201);
    await m.PurchaseOrder.updateOne({ _id: po.json._id }, { status: 'DRAFT' }); // lines can change while it is a draft
    await m.Product.updateOne({ _id: d.live._id }, { isActive: false });
    // the existing line can still be edited; a new inactive line cannot be added
    expect((await call(r.poOne.PATCH, 'PATCH', { items: [{ product: id(d.live), quantity: 3, unitPrice: 100 }] }, { id: po.json._id })).status).toBe(200);
    expect((await call(r.poOne.PATCH, 'PATCH', { items: [{ product: id(d.live), quantity: 3, unitPrice: 100 }, line(d.off)] }, { id: po.json._id })).status).toBe(400);
    await m.Product.updateOne({ _id: d.live._id }, { isActive: true });
  });

  it('plans with safety stock, dates each need and says when to order from the lead time', async () => {
    const fg = await m.Product.create({ name: 'Bike', sku: 'FG-B', category: oid(), uom: 'pcs', productType: 'FINISHED_GOOD', plannedDeliveryDays: 3 });
    const tube = await m.Product.create({ name: 'Tube', sku: 'RM-TUBE', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', minStockLevel: 5, safetyStock: 8, plannedDeliveryDays: 10 });
    const paint = await m.Product.create({ name: 'Paint', sku: 'RM-PAINT', category: oid(), uom: 'ltr', productType: 'RAW_MATERIAL', plannedDeliveryDays: 2 });
    await m.BillOfMaterials.create({ product: fg._id, version: '1', status: 'ACTIVE', isDefault: true, components: [{ product: tube._id, quantity: 2, unit: 'pcs' }, { product: paint._id, quantity: 1, unit: 'ltr' }] });
    const rows = await m.mrp.runMRP([{ product: id(fg), quantity: 10, requiredDate: days(5), source: 'test' }]);
    const row = (sku: string) => rows.find((x: any) => x.sku === sku);
    // tube: 20 needed + the higher of reorder 5 and safety 8 = 28
    expect(row('RM-TUBE')).toMatchObject({ grossReq: 20, netIndentQty: 28, safetyStock: 8, leadTimeDays: 10 });
    // the bike is needed in 5 days and takes 3 to make: parts by day 2; tubes take 10 days to arrive => already late
    const at = (x: Date) => Math.round((new Date(x).getTime() - Date.now()) / 86400000) || 0;
    expect(at(row('FG-B').needBy)).toBe(5);
    expect(at(row('RM-TUBE').needBy)).toBe(2);
    expect(at(row('RM-TUBE').orderBy)).toBe(-8);
    expect(row('RM-TUBE').late).toBe(true);
    expect(at(row('RM-PAINT').orderBy)).toBe(0);
    expect(row('RM-PAINT').late).toBe(false);
    d.fg = fg; d.tube = tube; d.paint = paint;
  });

  it('leaves "do not plan" items out: their need shows, nothing is bought or made for them, nor below them', async () => {
    await m.Product.updateOne({ _id: d.fg._id }, { mrpType: 'ND' });
    const rows = await m.mrp.runMRP([{ product: id(d.fg), quantity: 10, requiredDate: days(5), source: 'test' }]);
    expect(rows.map((x: any) => [x.sku, x.netIndentQty, !!x.notPlanned])).toEqual([['FG-B', 0, true]]);
    await m.Product.updateOne({ _id: d.fg._id }, { mrpType: 'PD' });
  });
});
