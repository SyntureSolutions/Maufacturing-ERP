import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// TCS u/s 206C(1) on the sale of goods such as scrap: on the line value with GST, at the item's rate, collected in the
// invoice total and owed to the government; none for a Form 27C buyer; a higher rate for a buyer with no PAN.
describe('TCS on sales', () => {
  const m: any = {}, r: any = {}, d: any = {};

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Customer', 'SalesOrder', 'Invoice', 'Account', 'CompanySettings']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.inv = await import('@/app/api/dispatch/invoices/route');
    r.invOne = await import('@/app/api/dispatch/invoices/[id]/route');
    r.vouchers = await import('@/app/api/vouchers/route');
    r.tcs = await import('@/lib/tcs');
    r.productInput = await import('@/lib/productInput');
    m.print = await import('@/lib/printDocs');
    asAdmin();
    await m.CompanySettings.create({ key: 'company', legalName: 'Prodexa', gstin: '27AABCP1234F1Z8', stateCode: '27', address1: '1 Factory Rd', city: 'Pune', pincode: '411001' });
    const cat = new mongoose.Types.ObjectId();
    d.scrap = await m.Product.create({ name: 'MS scrap', sku: 'SC-MS', category: cat, uom: 'kg', productType: 'FINISHED_GOOD', hsnCode: '7204', gstRate: 18, ...r.productInput.productFields({ tcsGoods: 'SCRAP' }) });
    d.bike = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18 });
    d.dealer = await m.Customer.create({ name: 'Metal Traders', code: 'C-1', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004' });
    d.mill = await m.Customer.create({ name: 'Rolling Mill', code: 'C-2', gstin: '27AABCT1332L1Z1', billingAddress: 'MIDC', city: 'Pune', pincode: '411019', tcsDeclaration27C: true });
    d.walkin = await m.Customer.create({ name: 'Kabadi Stores', code: 'C-3', billingAddress: 'Market Yard', city: 'Pune', pincode: '411037', stateCode: '27' });
    const so = (n: string, c: any) => m.SalesOrder.create({ soNumber: n, customer: c._id, customerName: c.name, status: 'APPROVED', paymentTerms: 'NET 30', totalAmount: 15000, items: [
      { product: d.scrap._id, quantity: 500, unitPrice: 20, totalPrice: 10000 },
      { product: d.bike._id, quantity: 1, unitPrice: 5000, totalPrice: 5000 },
    ] });
    d.so1 = await so('SO-TCS-1', d.dealer); d.so2 = await so('SO-TCS-2', d.mill); d.so3 = await so('SO-TCS-3', d.walkin);
  }, 120000);
  afterAll(stopDb);

  it('takes the preset rate for the type of goods, and checks a typed one', () => {
    expect(d.scrap).toMatchObject({ tcsGoods: 'SCRAP', tcsRate: 1 });
    expect(r.tcs.tcsFields({ tcsGoods: 'scrap', tcsRate: 0.75 })).toEqual({ tcsGoods: 'SCRAP', tcsRate: 0.75 });
    expect(r.tcs.tcsFields({ tcsGoods: '' })).toEqual({ tcsGoods: '', tcsRate: 0 });
    expect(() => r.tcs.tcsFields({ tcsGoods: 'GOLD' })).toThrow(/TCS goods/);
    expect(() => r.tcs.tcsFields({ tcsRate: 50 })).toThrow(/0 to 20/);
  });

  it('collects 1% TCS on the scrap line with its GST, and books it as owed', async () => {
    const tcs0 = (await m.Account.findOne({ code: '2040' }).lean())?.balance ?? 0;
    const res = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so1) });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    // scrap 10,000 + 18% = 11,800 -> TCS 118; bike carries none
    expect(res.json.tcs).toEqual([{ goods: 'SCRAP', rate: 1, base: 11800, amount: 118 }]);
    expect(res.json).toMatchObject({ subTotal: 15000, tcsAmount: 118, totalAmount: 17700 + 118 });
    expect(((await m.Account.findOne({ code: '2040' }).lean())?.balance ?? 0) - tcs0).toBe(118);
    d.inv1 = res.json;
  });

  it('prints the TCS and puts it in other charges on the e-invoice', async () => {
    const spec = await m.print.PRINT_TYPES.invoice.load(id(d.inv1), new URLSearchParams());
    const totals = Object.fromEntries(spec.totals.map((t: any) => [t[0], t[1]]));
    expect(totals).toMatchObject({ 'TCS u/s 206C(1) @ 1%': 'Rs. 118.00', Total: 'Rs. 17,818.00' });
    const e = await call(r.invOne.GET, 'GET', undefined, { id: id(d.inv1) }, '?doc=einvoice');
    expect(JSON.parse(e.text)[0].ValDtls).toMatchObject({ AssVal: 15000, OthChrg: 118, TotInvVal: 17818 });
  });

  it('a receipt settles the invoice with its TCS', async () => {
    const rec = await call(r.vouchers.POST, 'POST', { type: 'BANK_RECEIPT', amount: 17818, partyType: 'CUSTOMER', partyId: id(d.dealer), refInvoiceId: id(d.inv1), instrument: { utr: 'UTR-TCS' } });
    expect(rec.status, JSON.stringify(rec.json)).toBe(201);
    expect((await m.Invoice.findById(d.inv1._id).lean()).status).toBe('PAID');
  });

  it('charges none to a buyer with a Form 27C declaration, and at least 5% to one with no PAN', async () => {
    const mill = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so2) });
    expect(mill.json).toMatchObject({ tcsAmount: 0, totalAmount: 17700 });
    const walkin = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so3) });
    expect(walkin.json.tcs).toEqual([{ goods: 'SCRAP', rate: 5, base: 11800, amount: 590 }]);
  });
});
