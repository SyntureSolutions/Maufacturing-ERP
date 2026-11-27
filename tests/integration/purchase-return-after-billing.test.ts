import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Returning accepted goods to the vendor after receipt, split into the unbilled part (no GST) and the billed part (GST and value credited on the bill)
describe('purchase returns after receipt and billing', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const bal = async (code: string) => Math.round(((await m.Account.findOne({ code }))?.balance ?? 0) * 100) / 100;
  const newPo = (qty: number, price = 100) => m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * price, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: price, totalPrice: qty * price }] });
  const receive = async (po: any, qty: number) => {
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: qty, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    const idx = (await m.GRN.findById(g.json._id)).items.length - 1;
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: idx, acceptedQty: qty, scrapQty: 0, returnQty: 0 }] }, { id: id(g.json) });
    asAdmin();
    return await m.GRN.findById(g.json._id);
  };
  const bill = async (po: any, qty: number, rate?: number) => {
    asRole('FINANCE_MANAGER');
    const res = await call(r.bills.POST, 'POST', { poId: id(po), vendorBillNumber: `V-${Math.random().toString(36).slice(2, 7)}`, billDate: new Date().toISOString().slice(0, 10), lines: [{ product: id(d.prod), quantity: qty, ...(rate ? { rate } : {}) }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    return res.json;
  };
  const ret = (grn: any, lines: any[], extra: any = {}, role = 'SUPPLY_CHAIN_MANAGER') => { asRole(role); return call(r.returns.POST, 'POST', { grnId: id(grn), lines, reason: 'damaged in transit', ...extra }); };
  const stock = async () => ((await m.Batch.findOne({ product: d.prod._id, grn: { $exists: true } }).sort({ createdAt: -1 }).lean()) as any);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Batch: 'Batch', Account: 'Account', Invoice: 'Invoice', Voucher: 'Voucher', Company: 'CompanySettings', Return: 'PurchaseReturn' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.bills = await import('@/app/api/vendor-bills/route');
    r.returns = await import('@/app/api/purchase-returns/route');
    r.reports = await import('@/app/api/finance/reports/route');
    r.pay = await import('@/app/api/vendor-bills/[id]/pay/route');
    d.prod = await m.Product.create({ name: 'Steel Tube', sku: 'RM-T', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Local Steel', code: 'S-1', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const ledgerGap = async () => { asAdmin(); return (await call(r.reports.GET, 'GET', undefined, undefined, '?type=creditors')).json.ledger.difference; };

  it('goods not yet billed go back at receipt cost with no GST; stock, receipt and order fall together', async () => {
    const po = await newPo(100); const grn = await receive(po, 100);       // 100 x 100, none billed
    const [ap0, inv0, gst0] = [await bal('2010'), await bal('1030'), await bal('1060')];
    const res = await ret(grn, [{ index: 0, quantity: 10 }]);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ baseAmount: 1000, gstAmount: 0, totalAmount: 1000, afterBilling: false });
    expect(res.json.debitNoteNumber).toMatch(/^DN-/);
    expect(await bal('2010')).toBe(ap0 - 1000);
    expect(await bal('1030')).toBe(inv0 - 1000);
    expect(await bal('1060')).toBe(gst0);                                   // no GST booked, none reversed
    expect((await stock()).currentQuantity).toBe(90);
    const g: any = await m.GRN.findById(grn._id).lean();
    expect(g.items[0]).toMatchObject({ acceptedQty: 90, returnQty: 10 });
    const p: any = await m.PO.findById(po._id).lean();
    expect(p.items[0].receivedQuantity).toBe(90);
    expect(p.status).toBe('PARTIALLY_RECEIVED');
    expect(await ledgerGap()).toBe(0);
    d.po1 = po; d.grn1 = grn;
  });

  it('goods already billed need the bill: its GST and value are credited, the bill falls, the books agree', async () => {
    const b = await bill(d.po1, 90);                                       // 90 kept and billed: 9000 + 1620 GST
    expect(b.totalAmount).toBe(10620);
    const [ap0, inv0, gst0] = [await bal('2010'), await bal('1030'), await bal('1060')];
    const noBill = await ret(d.grn1, [{ index: 0, quantity: 5 }]);
    expect(noBill.status).toBe(400);                                       // billed goods: the bill must be named
    const res = await ret(d.grn1, [{ index: 0, quantity: 5 }], { billId: id(b) });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ afterBilling: true, baseAmount: 500, gstAmount: 90, totalAmount: 590, billNumber: b.invoiceNumber });
    expect(await bal('2010')).toBe(ap0 - 590);
    expect(await bal('1030')).toBe(inv0 - 500);
    expect(await bal('1060')).toBe(gst0 - 90);                              // input GST reversed
    const after: any = await m.Invoice.findById(b._id).lean();
    expect(after.creditedAmount).toBe(590);
    expect(after.items[0].returnedQty).toBe(5);
    expect(after.status).toBe('PARTIAL');
    const p: any = await m.PO.findById(d.po1._id).lean();
    expect(p.items[0]).toMatchObject({ receivedQuantity: 85, billedQuantity: 85 });
    expect((await stock()).currentQuantity).toBe(85);
    expect(await ledgerGap()).toBe(0);
    d.bill1 = b;
  });

  it('a return can mix unbilled and billed goods; replacement goods can be billed again afterwards', async () => {
    const po = await newPo(100); const grn = await receive(po, 100);
    const b = await bill(po, 60);                                          // 60 billed, 40 unbilled
    const res = await ret(grn, [{ index: 0, quantity: 50 }], { billId: id(b) });   // 40 from the unbilled, 10 from the billed
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ baseAmount: 5000, gstAmount: 180, totalAmount: 5180 });   // 4000 + 1000 base, GST only on the billed 10
    expect(((await m.Invoice.findById(b._id).lean()) as any).creditedAmount).toBe(1180);       // only the billed part credits the bill
    const p: any = await m.PO.findById(po._id).lean();
    expect(p.items[0]).toMatchObject({ receivedQuantity: 50, billedQuantity: 50 });
    // the vendor sends 50 replacements: they can be billed (and nothing else can)
    await receive(po, 50);
    const again = await bill(po, 50);
    expect(again.totalAmount).toBe(5900);
    asRole('FINANCE_MANAGER');
    expect((await call(r.bills.POST, 'POST', { poId: id(po), vendorBillNumber: 'EXTRA', billDate: new Date().toISOString().slice(0, 10), lines: [{ product: id(d.prod), quantity: 1 }] })).status).toBe(409);
    expect(await ledgerGap()).toBe(0);
  });

  it('a price difference on the bill is reversed with the goods', async () => {
    const po = await newPo(10); const grn = await receive(po, 10);        // received at 100
    const b = await bill(po, 10, 110);                                     // billed at 110: variance 100 booked
    const var0 = await bal('5060');
    expect(var0).toBeGreaterThanOrEqual(100);
    const res = await ret(grn, [{ index: 0, quantity: 4 }], { billId: id(b) });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ baseAmount: 440, gstAmount: 79.2 });  // 4 x 110 and 18%
    expect(await bal('5060')).toBe(var0 - 40);                             // the 4 x 10 extra cost is reversed
    expect(await ledgerGap()).toBe(0);
  });

  it('refusals: unknown or foreign bill, too many units, a paid bill, goods not free in stock, unfinished inspection, wrong roles, bad input', async () => {
    const po = await newPo(20); const grn = await receive(po, 20);
    const b = await bill(po, 20);                                          // 2360
    const other = await newPo(5); await receive(other, 5); const otherBill = await bill(other, 5);
    expect((await ret(grn, [{ index: 0, quantity: 5 }], { billId: id(otherBill) })).status).toBe(404);   // a bill of another order
    expect((await ret(grn, [{ index: 0, quantity: 5 }], { billId: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await ret(grn, [{ index: 0, quantity: 25 }], { billId: id(b) })).status).toBe(409);          // more than was accepted
    expect((await ret(grn, [{ index: 3, quantity: 1 }], { billId: id(b) })).status).toBe(400);            // no such line
    for (const q of [0, -2, 'x']) expect((await ret(grn, [{ index: 0, quantity: q }], { billId: id(b) })).status, String(q)).toBe(400);
    expect((await ret(grn, [], { billId: id(b) })).status).toBe(400);
    expect((await ret(grn, [{ index: 0, quantity: 1 }, { index: 0, quantity: 1 }], { billId: id(b) })).status).toBe(400);
    for (const role of ['SALES', 'STAFF', 'VIEWER', 'QUALITY_INSPECTOR', 'HR_MANAGER']) expect((await ret(grn, [{ index: 0, quantity: 1 }], { billId: id(b) }, role)).status, role).toBe(403);

    // stock that has been reserved or used cannot be returned
    await m.Batch.updateOne({ grn: grn._id }, { allocatedQuantity: 18 });
    expect((await ret(grn, [{ index: 0, quantity: 5 }], { billId: id(b) })).status).toBe(409);
    await m.Batch.updateOne({ grn: grn._id }, { allocatedQuantity: 0 });
    expect(((await m.GRN.findById(grn._id).lean()) as any).items[0].acceptedQty).toBe(20);               // nothing changed by any refusal
    expect(((await m.Invoice.findById(b._id).lean()) as any).creditedAmount || 0).toBe(0);

    // a paid bill cannot be credited
    asRole('FINANCE_MANAGER');
    expect((await call(r.pay.POST, 'POST', { mode: 'CASH' }, { id: id(b) })).status).toBe(201);
    const paid = await ret(grn, [{ index: 0, quantity: 5 }], { billId: id(b) });
    expect(paid.status).toBe(409);
    expect(paid.json.error).toContain('refund');
    // an uninspected delivery
    asAdmin();
    const raw = await call(r.grns.POST, 'POST', { poId: id(await newPo(5)), ...gate, items: [{ product: id(d.prod), receivedQty: 5, expiryDate: '2030-01-01' }] });
    expect((await ret(await m.GRN.findById(raw.json._id), [{ index: 0, quantity: 1 }])).status).toBe(409);
  });

  it('two returns of the same goods at the same moment cannot return more than was accepted', async () => {
    const po = await newPo(10); const grn = await receive(po, 10);
    const both = await Promise.all([ret(grn, [{ index: 0, quantity: 7 }]), ret(grn, [{ index: 0, quantity: 7 }])]);
    expect(both.map(x => x.status).sort()).toEqual([201, 409]);
    const g: any = await m.GRN.findById(grn._id).lean();
    expect(g.items[0]).toMatchObject({ acceptedQty: 3, returnQty: 7 });
    expect((await stock()).currentQuantity).toBe(3);
    expect(await m.Return.countDocuments({ grn: grn._id })).toBe(1);
    expect(await ledgerGap()).toBe(0);
  });
});
