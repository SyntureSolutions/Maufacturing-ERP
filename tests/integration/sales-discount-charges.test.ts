import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Freight and other charges on the sales side: typed on the quotation (or sales order), carried to the order, billed
// once on the first invoice and taxed with the goods. An approved quotation discount keeps the list rate and % on the line.
describe('sales discount and charges', () => {
  const m: any = {}, r: any = {}, d: any = {};

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Customer', 'Quotation', 'SalesOrder', 'Invoice', 'CompanySettings']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.quotes = await import('@/app/api/quotations/route');
    r.quote = await import('@/app/api/quotations/[id]/route');
    r.discount = await import('@/app/api/quotations/[id]/discount/route');
    r.sos = await import('@/app/api/sales-orders/route');
    r.so = await import('@/app/api/sales-orders/[id]/route');
    r.pi = await import('@/app/api/proforma/route');
    r.invOne = await import('@/app/api/dispatch/invoices/[id]/route');
    r.invoicing = await import('@/lib/invoicing');
    r.charges = await import('@/lib/docCharges');
    m.print = await import('@/lib/printDocs');
    asAdmin();
    await m.CompanySettings.create({ key: 'company', legalName: 'Prodexa', gstin: '27AABCP1234F1Z8', stateCode: '27', address1: '1 Factory Rd', city: 'Pune', pincode: '411001' });
    const cat = new mongoose.Types.ObjectId();
    d.bike = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, price: 1000 });
    d.bell = await m.Product.create({ name: 'Bell', sku: 'FG-BELL', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 5, price: 100 });
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-1', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004' });
  }, 120000);
  afterAll(stopDb);

  it('puts charges on a quotation: in its total and taxed with the goods', async () => {
    asRole('SALES');
    const res = await call(r.quotes.POST, 'POST', { customer: id(d.cust), items: [
      { product: id(d.bike), quantity: 3, unitPrice: 1000 },
      { product: id(d.bell), quantity: 10, unitPrice: 100 },
    ], charges: [{ label: 'Freight', amount: 400 }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.charges).toEqual([{ label: 'Freight', amount: 400 }]);
    expect(res.json.totalAmount).toBe(4400);
    // freight 300 with the bikes (18%: 594) and 100 with the bells (5%: 55)
    expect(res.json.taxSummary).toMatchObject({ goodsTotal: 4000, subTotal: 4400, totalCGST: 324.5, totalSGST: 324.5, grandTotal: 5049 });
    d.quote = res.json;
  });

  it('keeps the list rate and the whole % when approved discounts are applied, and the charges with them', async () => {
    asRole('SALES');
    const one = await call(r.discount.POST, 'POST', { action: 'request', percent: 10, reason: 'Volume order' }, { id: id(d.quote) });
    expect(one.status, JSON.stringify(one.json)).toBe(201);
    const two = await call(r.discount.POST, 'POST', { action: 'request', percent: 5, reason: 'Festival offer' }, { id: id(d.quote) });
    expect(two.status, JSON.stringify(two.json)).toBe(201);
    const q: any = await m.Quotation.findById(d.quote._id).lean();
    expect(q.items[0]).toMatchObject({ listPrice: 1000, discountPercent: 14.5, unitPrice: 855 });
    expect(q.items[1]).toMatchObject({ listPrice: 100, discountPercent: 14.5, unitPrice: 85.5 });
    expect(q.charges).toEqual([{ label: 'Freight', amount: 400 }]);
    expect(q.totalAmount).toBe(3420 + 400);
    const spec = await m.print.PRINT_TYPES.quotation.load(id(d.quote), new URLSearchParams());
    expect(spec.rows[0]).toMatchObject({ rate: '1,000.00', disc: '14.5%' });
    expect(Object.fromEntries(spec.totals.map((t: any) => [t[0], t[1]]))).toMatchObject({ 'Goods value': 'Rs. 3,420.00', Freight: 'Rs. 400.00', 'Taxable value': 'Rs. 3,820.00' });
  });

  it('drops the discount from a line whose price is typed again', () => {
    const { keptDiscount } = r.charges;
    expect(keptDiscount({ listPrice: 1000, discountPercent: 14.5 }, 855)).toEqual({ listPrice: 1000, discountPercent: 14.5 });
    expect(keptDiscount({ listPrice: 1000, discountPercent: 14.5 }, 900)).toEqual({});
    expect(keptDiscount({}, 900)).toEqual({});
  });

  it('carries discounts and charges to the sales order when the quotation is won', async () => {
    asRole('SALES');
    const res = await call(r.quote.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'CUST-1' }, { id: id(d.quote) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const so: any = await m.SalesOrder.findById(res.json.createdSalesOrder._id).lean();
    expect(so.items[0]).toMatchObject({ listPrice: 1000, discountPercent: 14.5, unitPrice: 855 });
    expect(so.charges).toEqual([{ label: 'Freight', amount: 400 }]);
    expect(so.totalAmount).toBe(3820);
  });

  it('takes a discount and charges on a hand-made sales order, and keeps them through a draft edit', async () => {
    asRole('SALES');
    const res = await call(r.sos.POST, 'POST', { customer: id(d.cust), items: [
      { product: id(d.bike), quantity: 4, unitPrice: 1000, discountPercent: 5 },
      { product: id(d.bell), quantity: 10, unitPrice: 100 },
    ], charges: [{ label: 'Freight', amount: 200 }, { label: 'Packing & Forwarding', amount: 100 }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.items[0]).toMatchObject({ listPrice: 1000, discountPercent: 5, unitPrice: 950, totalPrice: 3800 });
    expect(res.json.totalAmount).toBe(3800 + 1000 + 300);
    d.so = res.json;

    // the screen sends the list rate with the %; an unchanged line is not a price change
    const same = await call(r.so.PATCH, 'PATCH', { items: [
      { product: id(d.bike), quantity: 5, unitPrice: 1000, discountPercent: 5 },
      { product: id(d.bell), quantity: 10, unitPrice: 100, discountPercent: 0 },
    ] }, { id: id(d.so) });
    expect(same.status, JSON.stringify(same.json)).toBe(200);
    let so: any = await m.SalesOrder.findById(d.so._id).lean();
    expect(so.items[0]).toMatchObject({ quantity: 5, listPrice: 1000, discountPercent: 5, unitPrice: 950 });
    expect(so.totalAmount).toBe(4750 + 1000 + 300); // lines plus charges

    // charges can change on a draft
    expect((await call(r.so.PATCH, 'PATCH', { charges: [{ label: 'Freight', amount: 250 }, { label: 'Packing & Forwarding', amount: 100 }] }, { id: id(d.so) })).status).toBe(200);
    so = await m.SalesOrder.findById(d.so._id).lean();
    expect(so.totalAmount).toBe(4750 + 1000 + 350);
    expect((await call(r.so.PATCH, 'PATCH', { charges: [{ label: '', amount: 10 }] }, { id: id(d.so) })).status).toBe(400);
    await m.SalesOrder.updateOne({ _id: d.so._id }, { status: 'APPROVED' });
  });

  it('bills the charges once: on the first invoice, then not again', async () => {
    const pi = await call(r.pi.POST, 'POST', { salesOrderId: id(d.so) });
    expect(pi.status, JSON.stringify(pi.json)).toBe(201);
    expect(pi.json.charges).toEqual([{ label: 'Freight', amount: 250 }, { label: 'Packing & Forwarding', amount: 100 }]);
    expect(pi.json).toMatchObject({ goodsTotal: 5750, subTotal: 6100 });

    // first invoice for 2 of the 5 bikes: all the charges go on it
    const so: any = await m.SalesOrder.findById(d.so._id);
    const ctx1 = await r.invoicing.loadSalesContext(id(so), undefined, { kind: 'invoice', lines: [{ product: id(d.bike), quantity: 2 }] });
    const inv1 = await r.invoicing.createTaxInvoice(ctx1, { createdByRole: 'ADMIN' });
    expect(inv1.charges.map((c: any) => [c.label, c.amount])).toEqual([['Freight', 250], ['Packing & Forwarding', 100]]);
    expect(inv1).toMatchObject({ goodsTotal: 1900, subTotal: 2250 });
    expect(inv1.items[0]).toMatchObject({ listPrice: 1000, discountPercent: 5, unitPrice: 950, chargeShare: 350, taxableValue: 2250 });

    // the rest: no charges left to bill
    const ctx2 = await r.invoicing.loadSalesContext(id(so), undefined, { kind: 'invoice' });
    const inv2 = await r.invoicing.createTaxInvoice(ctx2, { createdByRole: 'ADMIN' });
    expect(inv2.charges).toEqual([]);
    expect(inv2.subTotal).toBe(2850 + 1000);
    d.inv1 = inv1;
  });

  it('prints and e-invoices the charges and discount so the values agree', async () => {
    const spec = await m.print.PRINT_TYPES.invoice.load(id(d.inv1), new URLSearchParams());
    expect(spec.rows[0]).toMatchObject({ rate: '1,000.00', disc: '5%', tv: '2,250.00' });
    expect(Object.fromEntries(spec.totals.map((t: any) => [t[0], t[1]]))).toMatchObject({ 'Goods value': 'Rs. 1,900.00', Freight: 'Rs. 250.00', 'Packing & Forwarding': 'Rs. 100.00', 'Taxable value': 'Rs. 2,250.00' });

    const res = await call(r.invOne.GET, 'GET', undefined, { id: id(d.inv1) }, '?doc=einvoice');
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const item = JSON.parse(res.text)[0].ItemList[0];
    // gross at the list rate plus the freight share, less the discount, is the assessable value
    expect(item).toMatchObject({ TotAmt: 2350, Discount: 100, AssAmt: 2250 });
    expect(item.TotAmt - item.Discount).toBe(item.AssAmt);
  });

  it('works out what is left to bill by charge name', () => {
    const { unbilledCharges } = r.charges;
    expect(unbilledCharges([{ label: 'Freight', amount: 500 }, { label: 'Insurance', amount: 50 }], [{ label: 'Freight', amount: 500 }])).toEqual([{ label: 'Insurance', amount: 50 }]);
    expect(unbilledCharges([{ label: 'Freight', amount: 500 }], [{ label: 'Freight', amount: 200 }])).toEqual([{ label: 'Freight', amount: 300 }]);
  });
});
