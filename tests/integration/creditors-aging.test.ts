import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

const DAY = 86400000;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

describe('creditors aging with goods received but not billed', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const report = (extra = '', keepRole = false) => { if (!keepRole) asAdmin(); return call(r.reports.GET, 'GET', undefined, undefined, `?type=creditors${extra}`); };
  const row = (json: any, supplier: any) => json.rows.find((x: any) => x.supplierId === String(supplier._id));
  const apBalance = async () => (await m.Account.findOne({ code: '2010' }))?.balance ?? 0;

  /** receive `qty` against a PO through the real GRN flow, accept it all, and (optionally) backdate the receipt */
  const receive = async (po: any, qty: number, ageDays = 0) => {
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: qty, expiryDate: '2030-01-01' }] });
    expect(g.status).toBe(201);
    asRole('QUALITY_INSPECTOR');
    const gi = (await m.GRN.findById(g.json._id)).items.length - 1;
    expect((await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: gi, acceptedQty: qty, scrapQty: 0, returnQty: 0 }] }, { id: id(g.json) })).status).toBe(200);
    if (ageDays) await m.GRN.collection.updateOne({ _id: g.json._id ? new mongoose.Types.ObjectId(g.json._id) : undefined }, { $set: { createdAt: new Date(Date.now() - ageDays * DAY) } });
    asAdmin();
    return g.json;
  };
  const newPo = (supplier: any, qty: number, price = 10) => m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: supplier._id, status: 'ORDERED', totalAmount: qty * price, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: price, totalPrice: qty * price }] });
  const bill = (po: any, over: any = {}) => { asRole('FINANCE_MANAGER'); return call(r.bills.POST, 'POST', { poId: id(po), vendorBillNumber: `V-${Math.random().toString(36).slice(2, 7)}`, billDate: iso(), lines: [{ product: id(d.prod), quantity: 1 }], ...over }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Account: 'Account', Invoice: 'Invoice', Voucher: 'Voucher', Company: 'CompanySettings', Lock: 'PeriodLock', Journal: 'JournalEntry' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.bills = await import('@/app/api/vendor-bills/route');
    r.open = await import('@/app/api/vendor-bills/open/route');
    r.reports = await import('@/app/api/finance/reports/route');
    r.vouchers = await import('@/app/api/vouchers/route');
    r.vouchersList = r.vouchers;
    r.accounts = await import('@/app/api/accounts/route');

    d.prod = await m.Product.create({ name: 'Steel Tube', sku: 'RM-T', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.s1 = await m.Supplier.create({ name: 'Local Steel (Maharashtra)', code: 'S-1', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 45' });
    d.s2 = await m.Supplier.create({ name: 'Bangalore Alloys', code: 'S-2', gstin: '29AABCT1332L1ZZ' });
    d.s3 = await m.Supplier.create({ name: 'Village Supplier', code: 'S-3' }); // no GSTIN
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    d.po1 = await newPo(d.s1, 100);
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('goods received but not billed show up as owed, aged from the receipt date, and match the ledger', async () => {
    await receive(d.po1, 60, 45);   // an old delivery
    await receive(d.po1, 40, 0);    // today's delivery
    const res = await report();
    expect(res.status).toBe(200);
    const s1 = row(res.json, d.s1);
    expect(s1).toMatchObject({ billed: 0, unbilled: 1000, advances: 0, net: 1000, total: 1000 });
    expect(s1['31-60']).toBe(600);   // 60 x 10, 45 days old
    expect(s1['0-30']).toBe(400);
    expect(s1.items.map((i: any) => i.kind)).toEqual(['UNBILLED', 'UNBILLED']);
    expect(s1.items[0].detail).toContain('Steel Tube x 60');
    expect(res.json.ledger.balance).toBe(1000);
    expect(res.json.ledger.difference).toBe(0);                // the report agrees with the payables ledger
  });

  it('refuses to book bills that do not match the goods received', async () => {
    asRole('SALES');
    expect((await call(r.bills.POST, 'POST', { poId: id(d.po1), vendorBillNumber: 'X', billDate: iso(), lines: [{ product: id(d.prod), quantity: 1 }] })).status).toBe(403);

    expect((await bill(d.po1, { vendorBillNumber: '' })).status).toBe(400);
    expect((await bill(d.po1, { billDate: iso(5) })).json.error).toContain('future');
    expect((await bill(d.po1, { lines: [] })).status).toBe(400);
    expect((await bill(d.po1, { lines: [{ product: id(d.prod), quantity: 1 }, { product: id(d.prod), quantity: 2 }] })).json.error).toContain('only once');
    const over = await bill(d.po1, { lines: [{ product: id(d.prod), quantity: 101 }] });
    expect(over.status).toBe(409);
    expect(over.json.error).toContain('only 100 received and not yet billed');
    expect((await bill(d.po1, { lines: [{ product: String(new mongoose.Types.ObjectId()), quantity: 1 }] })).status).toBe(400);
    expect(await m.Invoice.countDocuments({ type: 'PURCHASE' })).toBe(0);   // nothing booked by any of those
    expect((await m.PO.findById(d.po1._id)).items[0].billedQuantity).toBe(0);
  });

  it('books a bill with GST input credit and the price difference, and keeps the ledger in step', async () => {
    const before = await apBalance();
    const b1 = await bill(d.po1, { vendorBillNumber: 'V-1001', lines: [{ product: id(d.prod), quantity: 60, rate: 10.5 }] });
    expect(b1.status).toBe(201);
    expect(b1.json.invoiceNumber).toMatch(/^BILL-\d{4}-\d{4}$/);
    expect(b1.json.subTotal).toBe(630);
    expect(b1.json.totalCGST).toBe(56.7);       // same state as us: CGST + SGST
    expect(b1.json.totalSGST).toBe(56.7);
    expect(b1.json.totalIGST).toBe(0);
    expect(b1.json.totalAmount).toBe(743.4);
    expect(new Date(b1.json.dueDate).getTime() - new Date(b1.json.date).getTime()).toBe(45 * DAY); // supplier terms NET 45
    d.bill1 = b1.json;

    // goods were already in payables at the order price (600): the bill adds 113.40 GST + 30 price variance
    expect(await apBalance()).toBe(before + 143.4);
    expect((await m.Account.findOne({ code: '1060' })).balance).toBe(113.4);    // GST input receivable
    expect((await m.Account.findOne({ code: '5060' })).balance).toBe(30);       // purchase price variance
    expect((await m.PO.findById(d.po1._id)).items[0].billedQuantity).toBe(60);
    for (const e of await m.Journal.find()) expect(e.totalDebit).toBe(e.totalCredit);

    expect((await bill(d.po1, { vendorBillNumber: 'V-1001' })).status).toBe(409);        // same supplier bill number twice
  });

  it('the report now shows the bill as owed and only the newest delivery as unbilled; totals still match the ledger', async () => {
    const res = await report();
    const s1 = row(res.json, d.s1);
    expect(s1.billed).toBe(743.4);
    expect(s1.unbilled).toBe(400);            // the oldest 60 units are the ones billed
    expect(s1.net).toBe(1143.4);
    expect(s1['31-60']).toBe(0);              // the old delivery is no longer "unbilled"
    expect(s1['0-30']).toBe(1143.4);
    expect(s1.items.map((i: any) => i.kind).sort()).toEqual(['BILL', 'UNBILLED']);
    expect(s1.items.find((i: any) => i.kind === 'BILL').detail).toContain('V-1001');
    expect(res.json.ledger.difference).toBe(0);
  });

  it('payments applied to the bill, and advances paid on account, both reduce what is owed', async () => {
    asRole('FINANCE_MANAGER');
    const pay = (extra: any) => call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', partyType: 'SUPPLIER', partyId: id(d.s1), instrument: { utr: 'U-1' }, ...extra });
    expect((await pay({ amount: 700, refInvoiceId: id(d.bill1) })).status).toBe(201);      // part of the bill
    expect((await pay({ amount: 200 })).status).toBe(201);                                  // advance: no bill selected
    const res = await report();
    const s1 = row(res.json, d.s1);
    expect(s1.billed).toBe(43.4);                                                            // 743.40 - 700
    expect(s1.advances).toBe(200);
    expect(s1.net).toBeCloseTo(43.4 + 400 - 200, 2);
    expect(s1.items.find((i: any) => i.kind === 'ADVANCE').amount).toBe(-200);
    expect(res.json.ledger.difference).toBe(0);
  });

  it('bills the rest, then nothing more can be billed against the order', async () => {
    expect((await bill(d.po1, { vendorBillNumber: 'V-1002', lines: [{ product: id(d.prod), quantity: 40 }] })).status).toBe(201);
    const last = await bill(d.po1, { vendorBillNumber: 'V-1003', lines: [{ product: id(d.prod), quantity: 1 }] });
    expect(last.status).toBe(409);
    expect(last.json.error).toContain('only 0 received and not yet billed');
    const s1 = row((await report()).json, d.s1);
    expect(s1.unbilled).toBe(0);
    const open = (await call(r.open.GET, 'GET')).json;
    expect(open.find((p: any) => p.poNumber === d.po1.poNumber)).toBeUndefined();         // fully billed orders disappear from the entry screen
  });

  it('inter-state suppliers get IGST, and a bill below the order price creates a favourable variance', async () => {
    const po = await newPo(d.s2, 20);
    await receive(po, 20, 0);
    const before = await apBalance();
    const b = await bill(po, { vendorBillNumber: 'B-77', lines: [{ product: id(d.prod), quantity: 10, rate: 9 }] });
    expect(b.status).toBe(201);
    expect(b.json.totalIGST).toBe(16.2);
    expect(b.json.totalCGST + b.json.totalSGST).toBe(0);
    expect(b.json.totalAmount).toBe(106.2);
    expect(await apBalance()).toBe(before + 6.2);                  // GST 16.20 less 10.00 saved on price
    expect((await m.Account.findOne({ code: '5060' })).balance).toBe(30 - 10);
    const s2 = row((await report()).json, d.s2);
    expect(s2.billed).toBe(106.2);
    expect(s2.unbilled).toBe(100);                                  // the other 10 units at the order price
    expect((await report()).json.ledger.difference).toBe(0);
  });

  it('a supplier without a GSTIN needs the unregistered option; no GST is booked then', async () => {
    const po = await newPo(d.s3, 5);
    await receive(po, 5, 0);
    expect((await bill(po, { lines: [{ product: id(d.prod), quantity: 5 }] })).json.error).toContain('no GSTIN');
    const gstBefore = (await m.Account.findOne({ code: '1060' })).balance;
    const b = await bill(po, { unregistered: true, lines: [{ product: id(d.prod), quantity: 5 }] });
    expect(b.status).toBe(201);
    expect(b.json.totalAmount).toBe(50);
    expect((await m.Account.findOne({ code: '1060' })).balance).toBe(gstBefore);
  });

  it('goods returned to the vendor are not counted as unbilled', async () => {
    const po = await newPo(d.s2, 30);
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: 30, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 20, scrapQty: 0, returnQty: 10 }] }, { id: id(g.json) });
    const before = row((await report()).json, d.s2);
    // 20 kept x 10 = 200 owed for this delivery (the 10 returned are the vendor's problem)
    expect(before.items.filter((i: any) => i.kind === 'UNBILLED' && i.ref === g.json.number)[0].amount).toBe(200);
    // and only the 20 kept can be billed
    expect((await bill(po, { vendorBillNumber: 'B-RET', lines: [{ product: id(d.prod), quantity: 21 }] })).status).toBe(409);
    expect((await bill(po, { vendorBillNumber: 'B-RET', lines: [{ product: id(d.prod), quantity: 20 }] })).status).toBe(201);
  });

  it('the report can be run for an earlier date', async () => {
    const early = await report(`&asOf=${iso(-60)}`);
    expect(early.json.rows).toEqual([]);                           // nothing had been received 60 days ago
    const mid = await report(`&asOf=${iso(-30)}`);
    const s1 = row(mid.json, d.s1);
    expect(s1.unbilled).toBe(600);                                  // only the 45-day-old delivery existed then
    expect(s1.billed).toBe(0);
  });

  it('bills in a locked accounting period are refused', async () => {
    const po = await newPo(d.s1, 5);
    await receive(po, 5, 0);
    await m.Lock.create({ kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + DAY) });
    const res = await bill(po, { lines: [{ product: id(d.prod), quantity: 5 }] });
    expect(res.status).toBe(422);
    expect(res.json.error).toContain('locked');
    await m.Lock.deleteMany({});
    expect((await m.PO.findById(po._id)).items[0].billedQuantity).toBe(0);
  });

  it('two bills booked at the same moment cannot bill the same goods twice', async () => {
    const po = await newPo(d.s1, 10);
    await receive(po, 10, 0);
    const go = (n: string) => bill(po, { vendorBillNumber: n, lines: [{ product: id(d.prod), quantity: 10 }] });
    const results = await Promise.all([go('R-1'), go('R-2')]);
    expect(results.filter(x => x.status === 201)).toHaveLength(1);
    expect(results.find(x => x.status !== 201)!.status).toBe(409);
    expect((await m.PO.findById(po._id)).items[0].billedQuantity).toBe(10);        // never 20
    expect(await m.Invoice.countDocuments({ poNumber: po.poNumber })).toBe(1);
  });

  it('a failure while saving the bill puts the quantities and the ledger back', async () => {
    const po = await newPo(d.s1, 10);
    await receive(po, 10, 0);
    const paisa = (n: number) => Math.round(n * 100) / 100;
    const snap = async () => ({ ap: paisa(await apBalance()), gst: paisa((await m.Account.findOne({ code: '1060' })).balance), journals: await m.Journal.countDocuments(), billed: (await m.PO.findById(po._id)).items[0].billedQuantity });
    const before = await snap();
    const original = m.Invoice.create;
    m.Invoice.create = () => Promise.reject(new Error('disk full'));
    let res: any;
    try { res = await bill(po, { vendorBillNumber: 'F-1', lines: [{ product: id(d.prod), quantity: 10, rate: 11 }] }); } finally { m.Invoice.create = original; }
    expect(res.status).toBe(500);
    expect(await snap()).toEqual(before);
    expect((await bill(po, { vendorBillNumber: 'F-1', lines: [{ product: id(d.prod), quantity: 10, rate: 11 }] })).status).toBe(201); // and it works once the fault is gone
  });

  it('the entry screen lists only orders with goods received and not yet billed', async () => {
    const po = await newPo(d.s2, 8);
    await m.PO.create({ poNumber: 'PO-NOGOODS', supplier: d.s2._id, status: 'ORDERED', totalAmount: 10, items: [{ product: d.prod._id, quantity: 1, receivedQuantity: 0, unitPrice: 10, totalPrice: 10 }] });
    await receive(po, 8, 0);
    const open = (await call(r.open.GET, 'GET')).json;
    const entry = open.find((p: any) => p.poNumber === po.poNumber);
    expect(entry.supplier.name).toBe('Bangalore Alloys');
    expect(entry.items[0]).toMatchObject({ ordered: 8, received: 8, billed: 0, unbilled: 8, price: 10 });
    expect(open.find((p: any) => p.poNumber === 'PO-NOGOODS')).toBeUndefined();
  });

  // ================= found on re-check =================
  describe('re-check findings', () => {
    it('finance data is only readable by finance-facing roles', async () => {
      const read = async (role: string) => {
        asRole(role);
        const out: Record<string, number> = {};
        out.creditors = (await report('', true)).status;
        out.trial = (await call(r.reports.GET, 'GET', undefined, undefined, '?type=trial')).status;
        out.bills = (await call(r.bills.GET, 'GET')).status;
        out.open = (await call(r.open.GET, 'GET')).status;
        out.accounts = (await call(r.accounts.GET, 'GET')).status;
        out.vouchers = (await call(r.vouchersList.GET, 'GET')).status;
        return out;
      };
      for (const role of ['SALES', 'STAFF', 'HR_MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_INSPECTOR']) {
        const res = await read(role);
        for (const [name, status] of Object.entries(res)) expect(status, `${role} ${name}`).toBe(403);
      }
      for (const role of ['ADMIN', 'FINANCE_MANAGER', 'MANAGER', 'VIEWER']) {
        const res = await read(role);
        for (const [name, status] of Object.entries(res)) expect(status, `${role} ${name}`).toBe(200);
      }
      asAdmin();
    });

    it('goods still in quarantine cannot be billed and are not yet owed in the books; they show as awaiting QC', async () => {
      const po = await newPo(d.s1, 20);
      asAdmin();
      const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: 20, expiryDate: '2030-01-01' }] });
      expect(g.status).toBe(201);

      const refused = await bill(po, { vendorBillNumber: 'Q-1', lines: [{ product: id(d.prod), quantity: 20 }] });
      expect(refused.status).toBe(409);
      expect(refused.json.error).toContain('only 0');
      const before = await report();
      const s1 = row(before.json, d.s1);
      expect(s1.items.find((i: any) => i.ref === g.json.number)).toBeUndefined();   // not a liability until accepted
      expect(before.json.totals.awaitingQc).toBe(200);                              // 20 x 10, shown separately
      const gap0 = before.json.ledger.difference;                                   // earlier tests leave a known GST-on-return gap; quarantine must not change it

      asRole('QUALITY_INSPECTOR');
      await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 20, scrapQty: 0, returnQty: 0 }] }, { id: id(g.json) });
      const after = await report();
      expect(after.json.totals.awaitingQc).toBe(0);
      expect(row(after.json, d.s1).items.find((i: any) => i.ref === g.json.number).amount).toBe(200);
      expect((await bill(po, { vendorBillNumber: 'Q-1', lines: [{ product: id(d.prod), quantity: 20 }] })).status).toBe(201);
      expect((await report()).json.ledger.difference).toBe(gap0);
      // the entry screen offers only what has been accepted
      expect((await call(r.open.GET, 'GET')).json.find((x: any) => x.poNumber === po.poNumber)).toBeUndefined();
    });

    it('the price variance is measured against the price the goods were received at, not today\'s order price', async () => {
      const po = await newPo(d.s1, 10, 10);
      await receive(po, 10, 0);                                           // received and booked at 10 each
      await m.PO.updateOne({ _id: po._id }, { $set: { 'items.0.unitPrice': 12 } }); // the PO price is edited afterwards
      const gapBefore = (await report()).json.ledger.difference;
      const ap0 = await apBalance(), var0 = (await m.Account.findOne({ code: '5060' }))?.balance ?? 0;
      const b = await bill(po, { vendorBillNumber: 'P-1', lines: [{ product: id(d.prod), quantity: 10, rate: 10 }] });
      expect(b.status).toBe(201);
      const paisa = (n: number) => Math.round(n * 100) / 100;
      expect(paisa(((await m.Account.findOne({ code: '5060' }))?.balance ?? 0) - var0)).toBe(0);   // billed at the receipt price: no variance
      expect(paisa((await apBalance()) - ap0)).toBe(18);                                           // only the 18 GST on 100
      expect((await report()).json.ledger.difference).toBe(gapBefore);
    });
  });
});
