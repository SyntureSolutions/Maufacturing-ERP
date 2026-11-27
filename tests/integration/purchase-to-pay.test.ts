import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Purchase to pay: goods received -> vendor bill (carries the order and receipts) -> payment release with UTR -> payables and PO payment status
describe('purchase to pay', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  const bal = async (code: string) => (await m.Account.findOne({ code }))?.balance ?? 0;
  const pay = (bill: any, body: any, role = 'FINANCE_MANAGER') => { asRole(role); return call(r.pay.POST, 'POST', body, { id: id(bill) }); };

  const newPo = (qty: number, price = 100, extra: any = {}) => m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * price, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: price, totalPrice: qty * price }], ...extra });
  const receive = async (po: any, qty: number) => {
    asAdmin();
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: qty, expiryDate: '2030-01-01' }] });
    expect(g.status).toBe(201);
    asRole('QUALITY_INSPECTOR');
    const idx = (await m.GRN.findById(g.json._id)).items.length - 1;
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: idx, acceptedQty: qty, scrapQty: 0, returnQty: 0 }] }, { id: id(g.json) });
    asAdmin();
    return g.json;
  };
  const bill = async (po: any, qty: number, billDate = iso()) => {
    asRole('FINANCE_MANAGER');
    const res = await call(r.bills.POST, 'POST', { poId: id(po), vendorBillNumber: `V-${Math.random().toString(36).slice(2, 7)}`, billDate, lines: [{ product: id(d.prod), quantity: qty }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    return res.json;
  };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Account: 'Account', Invoice: 'Invoice', Voucher: 'Voucher', Company: 'CompanySettings', SO: 'SalesOrder', Request: 'ApprovalMatrix' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    m.Request = (await import('@/models/ApprovalMatrix')).ApprovalRequest;
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.bills = await import('@/app/api/vendor-bills/route');
    r.pay = await import('@/app/api/vendor-bills/[id]/pay/route');
    r.payables = await import('@/app/api/vendor-bills/payables/route');
    r.purchase = await import('@/app/api/purchase/route');
    r.rules = await import('@/app/api/approvals/rules/route');
    r.request = await import('@/app/api/approvals/requests/[id]/route');
    r.vouchers = await import('@/app/api/vouchers/route');
    r.lineage = await import('@/app/api/lineage/route');
    r.advance = await import('@/app/api/vendor-bills/[id]/apply-advance/route');
    r.advances = await import('@/app/api/vendor-bills/advances/route');
    r.reports = await import('@/app/api/finance/reports/route');

    d.prod = await m.Product.create({ name: 'Steel Tube', sku: 'RM-T', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Local Steel', code: 'S-1', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    d.so = await m.SO.create({ soNumber: 'SO-P2P-1', customerName: 'Buyer', status: 'APPROVED', items: [{ product: d.prod._id, quantity: 1, unitPrice: 1, totalPrice: 1 }], totalAmount: 1 });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('a vendor bill remembers the receipts it covers and the customer order the purchase was for', async () => {
    const po = await newPo(100, 100, { salesOrder: d.so._id });
    const g1 = await receive(po, 40), g2 = await receive(po, 60);
    const b = await bill(po, 70);                                       // oldest receipts are billed first: all of GRN 1 and 30 of GRN 2
    expect(b.grnRefs).toEqual([g1.number, g2.number]);
    expect(String(b.salesOrder)).toBe(id(d.so));
    expect(b.soNumber).toBe('SO-P2P-1');
    expect(b.totalAmount).toBe(8260);                                    // 7000 + 18% GST
    d.po = po; d.bill = b;

    const plain = await newPo(10);
    await receive(plain, 10);
    const b2 = await bill(plain, 10);
    expect(b2.salesOrder).toBeUndefined();
    expect(b2.grnRefs).toHaveLength(1);
  });

  it('releasing a payment posts it, settles the bill and records the UTR', async () => {
    const ap0 = await bal('2010'), bank0 = await bal('1010');
    const res = await pay(d.bill, { amount: 3000, mode: 'BANK', utr: 'UTR-0001', date: iso() });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.voucher.type).toBe('BANK_PAYMENT');
    expect(res.json.voucher.instrument.utr).toBe('UTR-0001');
    expect(res.json.voucher.refDoc).toMatchObject({ kind: 'INVOICE', number: d.bill.invoiceNumber });
    const after: any = await m.Invoice.findById(d.bill._id).lean();
    expect(after.amountPaid).toBe(3000);
    expect(after.status).toBe('PARTIAL');
    expect(Math.round((ap0 - (await bal('2010'))) * 100) / 100).toBe(3000);   // payables fall by the amount paid
    expect(Math.round((bank0 - (await bal('1010'))) * 100) / 100).toBe(3000); // the bank balance falls too

    const rest = await pay(d.bill, { mode: 'BANK', utr: 'UTR-0002' });        // amount defaults to what is left
    expect(rest.status).toBe(201);
    expect(rest.json.amount).toBe(5260);
    const paid: any = await m.Invoice.findById(d.bill._id).lean();
    expect(paid.status).toBe('PAID');
    expect((await pay(d.bill, { mode: 'BANK', utr: 'UTR-0003' })).status).toBe(409);   // already paid
  });

  it('refuses bad payments: over the balance, no UTR, a reused UTR, bad amounts, wrong roles, unknown bills', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // 1180
    expect((await pay(b, { mode: 'BANK', utr: 'UTR-X1', amount: 5000 })).status).toBe(409);
    expect((await pay(b, { mode: 'BANK', amount: 100 })).status).toBe(400);              // bank payment needs a UTR or cheque
    expect((await pay(b, { mode: 'BANK', utr: 'UTR-0001', amount: 100 })).status).toBe(409);   // used on the first payment above
    for (const amount of [0, -5, 'abc']) expect((await pay(b, { mode: 'BANK', utr: 'UTR-X2', amount })).status, String(amount)).toBe(400);
    expect((await pay(b, { mode: 'CASH', amount: 100 })).status).toBe(201);              // cash needs no UTR
    for (const role of ['SALES', 'STAFF', 'MANAGER', 'VIEWER', 'SUPPLY_CHAIN_MANAGER']) expect((await pay(b, { mode: 'CASH', amount: 1 }, role)).status, role).toBe(403);
    expect((await pay({ _id: String(new mongoose.Types.ObjectId()) }, { mode: 'CASH', amount: 1 })).status).toBe(404);
    expect((await pay({ _id: 'nope' }, { mode: 'CASH', amount: 1 })).status).toBe(404);
    expect(((await m.Invoice.findById(b._id).lean()) as any).amountPaid).toBe(100);     // only the one valid payment landed
    d.small = b;
  });

  it('a large payment waits for approval; nothing is posted or settled until approved, and the pending amount is held back', async () => {
    asAdmin();
    expect((await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 500, levels: ['MANAGER'] }] })).status).toBe(200);
    const ap0 = await bal('2010');
    const queued = await pay(d.small, { mode: 'BANK', utr: 'UTR-A1', amount: 600 });       // 1080 outstanding
    expect(queued.status).toBe(202);
    expect(queued.json.pendingApproval).toBe(true);
    expect(await bal('2010')).toBe(ap0);
    expect(((await m.Invoice.findById(d.small._id).lean()) as any).amountPaid).toBe(100);
    expect(await m.Voucher.countDocuments({ 'instrument.utr': 'UTR-A1' })).toBe(0);

    // the 600 is spoken for: only 480 more can be requested
    expect((await pay(d.small, { mode: 'BANK', utr: 'UTR-A2', amount: 600 })).status).toBe(409);
    asAdmin();
    const pays = (await call(r.payables.GET, 'GET')).json;
    expect(pays.rows.find((x: any) => x.invoiceNumber === d.small.invoiceNumber)).toMatchObject({ outstanding: 1080, pendingApproval: 600 });
    expect(pays.totals.pendingApproval).toBe(600);

    asRole('MANAGER');
    const decided = await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: String(queued.json.approvalId) });
    expect(decided.status, JSON.stringify(decided.json)).toBe(200);
    const settled: any = await m.Invoice.findById(d.small._id).lean();
    expect(settled.amountPaid).toBe(700);
    expect(await m.Voucher.countDocuments({ 'instrument.utr': 'UTR-A1' })).toBe(1);
    asAdmin();
    await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
  });

  it('accounts payable lists what is still owed with overdue days and the order it was for; only finance roles can see it', async () => {
    const po = await newPo(5, 100, { salesOrder: d.so._id }); await receive(po, 5);
    const old = await bill(po, 5, iso(60));                                // 30-day terms, billed 60 days ago: 30 days overdue
    asAdmin();
    const res = await call(r.payables.GET, 'GET');
    expect(res.status).toBe(200);
    const row = res.json.rows.find((x: any) => x.invoiceNumber === old.invoiceNumber);
    expect(row).toMatchObject({ outstanding: 590, overdueDays: 30, paymentStatus: 'UNPAID', soNumber: 'SO-P2P-1', note: 'Material received for SO-P2P-1.' });
    expect(res.json.rows.find((x: any) => x.invoiceNumber === d.bill.invoiceNumber)).toBeUndefined();   // fully paid bills drop off
    expect(res.json.totals.overdue).toBeGreaterThanOrEqual(590);
    const sorted = res.json.rows.map((x: any) => new Date(x.dueDate).getTime());
    expect(sorted).toEqual([...sorted].sort((a: number, b: number) => a - b));                            // most overdue first
    for (const role of ['SALES', 'STAFF', 'HR_MANAGER', 'PRODUCTION_MANAGER']) { asRole(role); expect((await call(r.payables.GET, 'GET')).status, role).toBe(403); }
    asRole('VIEWER'); expect((await call(r.payables.GET, 'GET')).status).toBe(200);
    asAdmin();
  });

  it('each purchase order shows where it stands on payment (amounts hidden from the read-only viewer, nothing for other roles)', async () => {
    asAdmin();
    const list = (await call(r.purchase.GET, 'GET')).json;
    const of = (po: any) => list.find((x: any) => String(x._id) === id(po)).payment;
    expect(of(d.po)).toMatchObject({ status: 'PAID', billed: 8260, paid: 8260, outstanding: 0 });
    const unpaid = list.find((x: any) => x.payment?.status === 'UNPAID');
    expect(unpaid).toBeTruthy();
    const fresh = await newPo(5);
    expect(((await call(r.purchase.GET, 'GET')).json.find((x: any) => String(x._id) === id(fresh))).payment).toMatchObject({ status: 'NOT_BILLED' });
    const partial = list.find((x: any) => x.payment?.status === 'PARTIALLY_PAID');
    expect(partial).toBeTruthy();
    asRole('VIEWER');
    const asViewer = (await call(r.purchase.GET, 'GET')).json.find((x: any) => String(x._id) === id(d.po));
    expect(asViewer.payment).toEqual({ status: 'PAID' });
    asRole('SALES');
    expect((await call(r.purchase.GET, 'GET')).json.every((x: any) => x.payment === undefined)).toBe(true);
    asAdmin();
  });

  it('the chain runs from the order through the purchase order and its receipts to the bill and every payment', async () => {
    const res = await call(r.lineage.GET, 'GET', undefined, undefined, '?type=SALES_ORDER&id=SO-P2P-1');
    const nums = res.json.nodes.map((n: any) => n.number);
    expect(nums).toContain(d.po.poNumber);
    expect(nums).toContain(d.bill.invoiceNumber);
    const payments = res.json.nodes.filter((n: any) => n.type === 'PAYMENT');
    expect(payments.length).toBeGreaterThanOrEqual(2);
  });

  it('the voucher screen still posts and queues exactly as before after the shared helper was introduced', async () => {
    asAdmin();
    const v = await call(r.vouchers.POST, 'POST', { type: 'CASH_RECEIPT', amount: 10, partyType: 'OTHER', counterAccount: '4010' });
    expect([201, 400]).toContain(v.status);
    asRole('SALES');
    expect((await call(r.vouchers.POST, 'POST', { type: 'CASH_RECEIPT', amount: 10 })).status).toBe(403);
    asAdmin();
  });

  it('re-check: the same payment request sent twice pays once, whether it posted at once or went through approval', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // 1180
    const first = await pay(b, { mode: 'BANK', utr: 'UTR-D1', amount: 400, requestId: 'req-1' });
    const again = await pay(b, { mode: 'BANK', utr: 'UTR-D1', amount: 400, requestId: 'req-1' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.json.duplicate).toBe(true);
    expect(again.json.voucher.number).toBe(first.json.voucher.number);
    expect(((await m.Invoice.findById(b._id).lean()) as any).amountPaid).toBe(400);
    expect(await m.Voucher.countDocuments({ refDoc: { kind: 'INVOICE', number: b.invoiceNumber } })).toBe(1);

    // through approval: retried while waiting, and again after it has been approved
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 500, levels: ['MANAGER'] }] });
    const q1 = await pay(b, { mode: 'BANK', utr: 'UTR-D2', amount: 600, requestId: 'req-2' });
    const q2 = await pay(b, { mode: 'BANK', utr: 'UTR-D2', amount: 600, requestId: 'req-2' });
    expect(q1.status).toBe(202);
    expect(q2.status).toBe(202);
    expect(String(q2.json.approvalId)).toBe(String(q1.json.approvalId));
    expect(await m.Request.countDocuments({ module: 'PAYMENT_VOUCHER', 'payload.requestId': 'req-2' })).toBe(1);
    asRole('MANAGER');
    expect((await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: String(q1.json.approvalId) })).status).toBe(200);
    const q3 = await pay(b, { mode: 'BANK', utr: 'UTR-D2', amount: 600, requestId: 'req-2' });
    expect(q3.status).toBe(200);
    expect(q3.json.duplicate).toBe(true);
    expect(((await m.Invoice.findById(b._id).lean()) as any).amountPaid).toBe(1000);       // 400 + 600, not 1600
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
  });

  it('re-check: two payments sent at the same moment cannot pay more than is owed', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // 1180
    asRole('FINANCE_MANAGER');
    const both = await Promise.all([
      call(r.pay.POST, 'POST', { mode: 'CASH', amount: 700, requestId: 'a' }, { id: id(b) }),
      call(r.pay.POST, 'POST', { mode: 'CASH', amount: 700, requestId: 'b' }, { id: id(b) }),
    ]);
    expect(both.map(x => x.status).sort()).toEqual([201, 409]);
    expect(((await m.Invoice.findById(b._id).lean()) as any).amountPaid).toBe(700);
    expect(await m.Voucher.countDocuments({ refDoc: { kind: 'INVOICE', number: b.invoiceNumber } })).toBe(1);   // the loser left nothing behind
  });

  it('re-check: two queued payments that together exceed the balance cannot both wait for approval', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // 1180
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 500, levels: ['MANAGER'] }] });
    asRole('FINANCE_MANAGER');
    const both = await Promise.all([
      call(r.pay.POST, 'POST', { mode: 'BANK', utr: 'UTR-Q1', amount: 700, requestId: 'q-a' }, { id: id(b) }),
      call(r.pay.POST, 'POST', { mode: 'BANK', utr: 'UTR-Q2', amount: 700, requestId: 'q-b' }, { id: id(b) }),
    ]);
    const queued = both.filter(x => x.status === 202).length;
    expect(queued).toBeLessThanOrEqual(1);                              // never both
    expect(both.every(x => [202, 409].includes(x.status))).toBe(true);
    const waiting = await m.Request.find({ module: 'PAYMENT_VOUCHER', status: 'PENDING', 'payload.refInvoiceId': id(b) }).lean();
    expect(waiting.reduce((a: number, x: any) => a + x.payload.amount, 0)).toBeLessThanOrEqual(1180);
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
  });

  it('re-check: a UTR already waiting for approval cannot be used again; future-dated or invalid dates are refused', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 500, levels: ['MANAGER'] }] });
    expect((await pay(b, { mode: 'BANK', utr: 'UTR-W1', amount: 600 })).status).toBe(202);
    const other = await bill(await (async () => { const p2 = await newPo(10); await receive(p2, 10); return p2; })(), 10);
    expect((await pay(other, { mode: 'BANK', utr: 'UTR-W1', amount: 100 })).status).toBe(409);            // the first one is only waiting, but the UTR is spoken for
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
    const tomorrow = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect((await pay(other, { mode: 'CASH', amount: 100, date: tomorrow })).status).toBe(400);
    expect((await pay(other, { mode: 'CASH', amount: 100, date: 'not-a-date' })).status).toBe(400);
    expect((await pay(other, { mode: 'CASH', amount: 100, date: iso(3) })).status).toBe(201);
  });

  it('re-check: a purchase order whose bills are paid is not called finished while goods are still waiting for a bill', async () => {
    const po = await newPo(100); await receive(po, 100);
    const b = await bill(po, 40);                                       // only 40 of 100 billed
    await pay(b, { mode: 'CASH' });                                     // and paid in full
    asAdmin();
    const st = (await call(r.purchase.GET, 'GET')).json.find((x: any) => String(x._id) === id(po)).payment;
    expect(st).toMatchObject({ status: 'PAID', fullyBilled: false });
    const b2 = await bill(po, 60);
    await pay(b2, { mode: 'CASH' });
    asAdmin();
    expect(((await call(r.purchase.GET, 'GET')).json.find((x: any) => String(x._id) === id(po))).payment).toMatchObject({ status: 'PAID', fullyBilled: true });
  });

  it('open item fixed: of two simultaneous queued payments exactly one stays, the earlier one', async () => {
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 500, levels: ['MANAGER'] }] });
    for (let round = 0; round < 3; round++) {
      const po = await newPo(10); await receive(po, 10);
      const b = await bill(po, 10);                                     // 1180
      asRole('FINANCE_MANAGER');
      const both = await Promise.all([
        call(r.pay.POST, 'POST', { mode: 'BANK', utr: `UTR-T${round}a`, amount: 700, requestId: `t${round}a` }, { id: id(b) }),
        call(r.pay.POST, 'POST', { mode: 'BANK', utr: `UTR-T${round}b`, amount: 700, requestId: `t${round}b` }, { id: id(b) }),
      ]);
      expect(both.filter(x => x.status === 202)).toHaveLength(1);
      expect(both.filter(x => x.status === 409)).toHaveLength(1);
      expect(await m.Request.countDocuments({ module: 'PAYMENT_VOUCHER', status: 'PENDING', 'payload.refInvoiceId': id(b) })).toBe(1);
    }
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
  });

  it('open item fixed: an advance paid before the bill can be applied to it, without posting anything again', async () => {
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // 1180
    asRole('FINANCE_MANAGER');
    const adv = await call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', amount: 900, partyType: 'SUPPLIER', partyId: id(d.sup), instrument: { utr: 'UTR-ADV-1' } });
    expect(adv.status, JSON.stringify(adv.json)).toBe(201);
    const advId = id(adv.json);
    const ap0 = await bal('2010');
    const creditorsRow = async () => { asAdmin(); const res = await call(r.reports.GET, 'GET', undefined, undefined, '?type=creditors'); return res.json.rows.find((x: any) => x.supplierId === id(d.sup)); };
    const before = await creditorsRow();

    asRole('FINANCE_MANAGER');
    const list = await call(r.advances.GET, 'GET', undefined, undefined, `?supplier=${id(d.sup)}`);
    expect(list.json.find((x: any) => x._id === advId)).toMatchObject({ remaining: 900, utr: 'UTR-ADV-1' });

    const applied = await call(r.advance.POST, 'POST', { voucherId: advId, amount: 500 }, { id: id(b) });
    expect(applied.status, JSON.stringify(applied.json)).toBe(201);
    expect(applied.json).toMatchObject({ amount: 500, advanceLeft: 400, billOutstanding: 680 });
    expect(await bal('2010')).toBe(ap0);                                 // nothing posted: the money already left when the advance was paid
    const inv: any = await m.Invoice.findById(b._id).lean();
    expect(inv.amountPaid).toBe(500);
    expect(inv.status).toBe('PARTIAL');
    const after = await creditorsRow();
    expect(after.net).toBe(before.net);                                  // the bill falls and the advance falls by the same amount
    expect(after.advances).toBe(before.advances - 500);

    asRole('FINANCE_MANAGER');
    const rest = await call(r.advance.POST, 'POST', { voucherId: advId }, { id: id(b) });   // defaults to the smaller of what the advance holds and the bill owes
    expect(rest.json).toMatchObject({ amount: 400, advanceLeft: 0, billOutstanding: 280 });
    expect((await call(r.advance.POST, 'POST', { voucherId: advId, amount: 1 }, { id: id(b) })).status).toBe(409);   // used up
    expect((await call(r.advances.GET, 'GET', undefined, undefined, `?supplier=${id(d.sup)}`)).json.find((x: any) => x._id === advId)).toBeUndefined();
  });

  it('open item fixed: advance rules - same supplier only, no more than the advance or the bill holds, finance roles only, never twice at once', async () => {
    const other = await m.Supplier.create({ name: 'Other Supplier', code: 'S-9', gstin: '27AAPFU0939F1ZV' });
    asRole('FINANCE_MANAGER');
    const adv2 = await call(r.vouchers.POST, 'POST', { type: 'CASH_PAYMENT', amount: 300, partyType: 'SUPPLIER', partyId: id(other) });
    const po = await newPo(10); await receive(po, 10);
    const b = await bill(po, 10);                                       // supplier d.sup
    asRole('FINANCE_MANAGER');
    expect((await call(r.advance.POST, 'POST', { voucherId: id(adv2.json) }, { id: id(b) })).status).toBe(409);       // different supplier
    const mine = await call(r.vouchers.POST, 'POST', { type: 'CASH_PAYMENT', amount: 200, partyType: 'SUPPLIER', partyId: id(d.sup) });
    expect((await call(r.advance.POST, 'POST', { voucherId: id(mine.json), amount: 500 }, { id: id(b) })).status).toBe(409);   // more than the advance holds
    for (const amount of [0, -1, 'abc']) expect((await call(r.advance.POST, 'POST', { voucherId: id(mine.json), amount }, { id: id(b) })).status, String(amount)).toBe(400);
    expect((await call(r.advance.POST, 'POST', { voucherId: 'nope' }, { id: id(b) })).status).toBe(404);
    expect((await call(r.advance.POST, 'POST', { voucherId: id(mine.json) }, { id: 'nope' })).status).toBe(404);
    const attached: any = await m.Voucher.findOne({ 'refDoc.number': d.bill.invoiceNumber }).lean();   // a voucher that is attached to a bill is not an advance
    expect((await call(r.advance.POST, 'POST', { voucherId: id(attached) }, { id: id(b) })).status).toBe(404);
    for (const role of ['SALES', 'MANAGER', 'VIEWER', 'STAFF']) { asRole(role); expect((await call(r.advance.POST, 'POST', { voucherId: id(mine.json) }, { id: id(b) })).status, role).toBe(403); }
    asRole('SALES'); expect((await call(r.advances.GET, 'GET', undefined, undefined, `?supplier=${id(d.sup)}`)).status).toBe(403);
    asRole('FINANCE_MANAGER'); expect((await call(r.advances.GET, 'GET')).status).toBe(400);

    // two people applying the same 200 at the same moment: it is used once
    const both = await Promise.all([call(r.advance.POST, 'POST', { voucherId: id(mine.json), amount: 200 }, { id: id(b) }), call(r.advance.POST, 'POST', { voucherId: id(mine.json), amount: 200 }, { id: id(b) })]);
    expect(both.map(x => x.status).sort()).toEqual([201, 409]);
    const v: any = await m.Voucher.findById(mine.json._id).lean();
    expect(v.allocations).toHaveLength(1);
    expect(((await m.Invoice.findById(b._id).lean()) as any).amountPaid).toBe(200);
  });

  it('open item fixed: payables can be looked at as of a past date, filtered, exported, and show who must approve', async () => {
    asAdmin();
    const old = await newPo(5); await receive(old, 5);
    const ob = await bill(old, 5, iso(50));                             // 590, billed 50 days ago on NET 30 terms: 20 days overdue
    asAdmin();
    await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [{ minAmount: 100, levels: ['MANAGER'] }] });
    expect((await pay(ob, { mode: 'BANK', utr: 'UTR-PL1', amount: 200 })).status).toBe(202);
    asAdmin();
    const now = (await call(r.payables.GET, 'GET')).json;
    expect(now.rows.find((x: any) => x.invoiceNumber === ob.invoiceNumber)).toMatchObject({ outstanding: 590, overdueDays: 20, pendingApproval: 200, waitingFor: ['MANAGER'] });

    const q = (qs: string) => call(r.payables.GET, 'GET', undefined, undefined, qs);
    expect((await q(`?asOf=${iso(20)}`)).json.rows.find((x: any) => x.invoiceNumber === ob.invoiceNumber)).toMatchObject({ outstanding: 590, overdueDays: 0 });   // existed, not yet due
    expect((await q(`?asOf=${iso(60)}`)).json.rows.find((x: any) => x.invoiceNumber === ob.invoiceNumber)).toBeUndefined();                                    // not yet billed
    expect((await q('?asOf=garbage')).status).toBe(400);
    expect((await q(`?supplier=${id(d.sup)}`)).json.rows.length).toBeGreaterThan(0);
    expect((await q(`?supplier=${id(new mongoose.Types.ObjectId())}`)).json.rows).toEqual([]);
    const overdue = (await q('?overdue=1')).json.rows;
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((x: any) => x.overdueDays > 0)).toBe(true);

    const csv = await q('?format=csv');
    expect(csv.status).toBe(200);
    const lines = csv.text.split('\n');
    expect(lines[0]).toContain('Outstanding');
    const mine = lines.find((l: string) => l.startsWith(ob.invoiceNumber));
    expect(mine).toContain('590');
    expect(mine).toContain('MANAGER');
    asAdmin(); await call(r.rules.PUT, 'PUT', { module: 'PAYMENT_VOUCHER', rules: [] });
  });

  it('open item fixed: goods returned at inspection leave payables and GST input exactly right once the kept goods are billed', async () => {
    asAdmin();
    const po = await newPo(30);                                        // 30 x 100
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: 30, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    const idx = (await m.GRN.findById(g.json._id)).items.length - 1;
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: idx, acceptedQty: 20, scrapQty: 0, returnQty: 10 }] }, { id: id(g.json) });
    const gstBefore = await bal('1060'), apBefore = await bal('2010');
    const b = await bill(po, 20);                                      // only what was kept: 20 x 100 = 2000 + 360 GST
    expect(b.totalAmount).toBe(2360);
    expect(Math.round((await bal('1060') - gstBefore) * 100) / 100).toBe(360);   // GST input is exactly the GST on the bill
    expect(Math.round((await bal('2010') - apBefore) * 100) / 100).toBe(360);    // payables only gain the GST: the goods were credited at receipt and the returned ones debited
    asAdmin();
    const rep = (await call(r.reports.GET, 'GET', undefined, undefined, '?type=creditors')).json;
    expect(rep.ledger.difference).toBe(0);                             // the report and the payables ledger now agree
  });
});
