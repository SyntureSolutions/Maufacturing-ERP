import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

const today = new Date().toISOString().slice(0, 10);

describe('approval matrix beyond purchase orders', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const setRules = (module: string, rules: any[]) => { asAdmin(); return call(r.rules.PUT, 'PUT', { module, rules }); };
  const decide = (reqId: string, role: string, action = 'approve', remarks?: string) => { asRole(role); return call(r.request.PATCH, 'PATCH', { action, remarks }, { id: reqId }); };
  const bal = async (code: string) => (await m.Account.findOne({ code }))?.balance ?? 0;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Batch: 'Batch', Supplier: 'Supplier', Customer: 'Customer', SO: 'SalesOrder', Invoice: 'Invoice', Account: 'Account', Voucher: 'Voucher', Job: 'JobWorkOrder', Lock: 'PeriodLock' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    const appr: any = await import('@/models/ApprovalMatrix'); m.Request = appr.ApprovalRequest;
    r.rules = await import('@/app/api/approvals/rules/route');
    r.requests = await import('@/app/api/approvals/requests/route');
    r.request = await import('@/app/api/approvals/requests/[id]/route');
    r.vouchers = await import('@/app/api/vouchers/route');
    r.soApproval = await import('@/app/api/sales-orders/[id]/approval/route');
    r.jobs = await import('@/app/api/jobwork/route');

    const cat = new mongoose.Types.ObjectId();
    d.prod = await m.Product.create({ name: 'Steel Bar', sku: 'RM-1', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7214' });
    d.batch = await m.Batch.create({ product: d.prod._id, batchNumber: 'B-1', expiryDate: new Date('2030-01-01'), initialQuantity: 100, currentQuantity: 100, purchasePrice: 100, qualityStatus: 'APPROVED', store: 'W1' });
    d.sup = await m.Supplier.create({ name: 'Subcon Ltd', code: 'S-1', gstin: '27AAPFU0939F1ZV' });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'C-1', billingAddress: 'x' });
    d.purchaseInvoice = await m.Invoice.create({ invoiceNumber: 'BILL-1', type: 'PURCHASE', supplier: d.sup._id, date: new Date(), dueDate: new Date(), items: [{ description: 'Steel', quantity: 1, unitPrice: 100000, taxableValue: 100000, totalAmount: 100000 }], subTotal: 100000, totalAmount: 100000, status: 'ISSUED' });
    d.salesInvoice = await m.Invoice.create({ invoiceNumber: 'INV-1', type: 'SALES', customer: d.cust._id, date: new Date(), dueDate: new Date(), items: [{ description: 'Bikes', quantity: 1, unitPrice: 200000, taxableValue: 200000, totalAmount: 200000 }], subTotal: 200000, totalAmount: 200000, status: 'ISSUED', parties: { buyer: { name: 'Buyer' } } });
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  // ---------------- rules ----------------
  it('offers every document type, each with its own independent rules', async () => {
    const cfg = await call(r.rules.GET, 'GET');
    expect(cfg.json.modules).toEqual(['PURCHASE_ORDER', 'SALES_ORDER', 'EXPENSE_VOUCHER', 'PAYMENT_VOUCHER', 'CREDIT_NOTE', 'JOB_WORK_OUTWARD', 'BOM_ACTIVATION']);
    expect(cfg.json.moduleInfo.EXPENSE_VOUCHER.label).toBe('Expense vouchers');
    expect((await call(r.rules.PUT, 'PUT', { module: 'TIMESHEET', rules: [] })).status).toBe(400);

    expect((await setRules('EXPENSE_VOUCHER', [{ minAmount: 50000, levels: ['MANAGER'] }])).json.saved).toBe(1);
    await setRules('PAYMENT_VOUCHER', [{ minAmount: 50000, levels: ['MANAGER'] }, { minAmount: 90000, levels: ['MANAGER', 'ADMIN'] }]);
    await setRules('CREDIT_NOTE', [{ minAmount: 10000, levels: ['MANAGER'] }]);
    await setRules('SALES_ORDER', [{ minAmount: 100000, levels: ['MANAGER'] }]);
    await setRules('JOB_WORK_OUTWARD', [{ minAmount: 5000, levels: ['MANAGER'] }]);
    const all = (await call(r.rules.GET, 'GET')).json.rules;
    expect(all.filter((x: any) => x.module === 'PAYMENT_VOUCHER')).toHaveLength(2);
    expect(all.filter((x: any) => x.module === 'EXPENSE_VOUCHER')).toHaveLength(1); // changing one module left the others alone
  });

  // ---------------- expense vouchers ----------------
  it('expenses below the threshold post immediately; above it they wait and nothing is posted', async () => {
    asRole('FINANCE_MANAGER');
    const small = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 10000, gstPercent: 18, expensePayment: 'CREDIT' });
    expect(small.status).toBe(201);
    expect(small.json.number).toMatch(/^EX-/);

    const before = { vouchers: await m.Voucher.countDocuments(), overhead: await bal('5040') };
    const big = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 100000, gstPercent: 18, expensePayment: 'CREDIT', narration: 'Annual maintenance contract' });
    expect(big.status).toBe(202);
    expect(big.json.pendingApproval).toBe(true);
    expect(await m.Voucher.countDocuments()).toBe(before.vouchers);   // no voucher
    expect(await bal('5040')).toBe(before.overhead);                   // no ledger change
    d.expReq = big.json.approvalId;

    const req = await m.Request.findById(d.expReq);
    expect(req).toMatchObject({ module: 'EXPENSE_VOUCHER', status: 'PENDING', requestedBy: 'Test FINANCE_MANAGER', amount: 118000 });
    expect(req.summary).toContain('Annual maintenance contract');
    expect(req.payload.taxableAmount).toBe(100000);
    expect(req.payload.date).toBe(new Date().toISOString().slice(0, 10)); // the raising date is kept for posting
  });

  it('invalid entries are refused up front, not queued', async () => {
    asRole('FINANCE_MANAGER');
    const before = await m.Request.countDocuments();
    expect((await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: -5 })).status).toBe(400);
    expect((await call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', amount: 999999, partyType: 'SUPPLIER', refInvoiceId: String(d.purchaseInvoice._id), instrument: { utr: 'U1' } })).status).toBe(400); // more than the bill
    expect((await call(r.vouchers.POST, 'POST', { type: 'CREDIT_NOTE', taxableAmount: 50000, gstPercent: 18 })).status).toBe(400); // no invoice
    expect(await m.Request.countDocuments()).toBe(before);
  });

  it('approval posts the voucher exactly as if it had been entered directly, in the requester\'s name', async () => {
    const inbox = async (role: string) => { asRole(role); return (await call(r.requests.GET, 'GET', undefined, undefined, '?inbox=1')).json; };
    expect((await inbox('MANAGER')).map((x: any) => String(x._id))).toContain(String(d.expReq));
    expect(await inbox('SALES')).toHaveLength(0);

    expect((await decide(d.expReq, 'FINANCE_MANAGER')).status).toBe(403);   // not their level / their own request
    const before = await bal('5040');
    const ok = await decide(d.expReq, 'MANAGER');
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('APPROVED');
    expect(ok.json.resultRef).toMatch(/^EX-/);

    const v = await m.Voucher.findOne({ number: ok.json.resultRef });
    expect(v).toBeTruthy();
    expect(v.amount).toBe(118000);
    expect(v.createdBy).toBe('65f0111111111111111111aa'); // posted on behalf of the requester (the finance user), not the approver
    expect(await bal('5040')).toBe(before + 100000);
    expect(v.lines.reduce((s: number, l: any) => s + l.debit, 0)).toBe(v.lines.reduce((s: number, l: any) => s + l.credit, 0));
    expect((await decide(d.expReq, 'MANAGER')).status).toBe(409);            // cannot be approved twice
    expect(await m.Voucher.countDocuments({ number: ok.json.resultRef })).toBe(1);
  });

  it('a rejected request posts nothing and needs a reason', async () => {
    asRole('FINANCE_MANAGER');
    const q = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 80000, gstPercent: 0, expensePayment: 'CREDIT' });
    const before = await m.Voucher.countDocuments();
    expect((await decide(q.json.approvalId, 'MANAGER', 'reject', '')).status).toBe(400);
    const rej = await decide(q.json.approvalId, 'MANAGER', 'reject', 'Not budgeted');
    expect(rej.json.status).toBe('REJECTED');
    expect(await m.Voucher.countDocuments()).toBe(before);
  });

  // ---------------- payments (multi-level, settles an invoice only once approved) ----------------
  it('a large payment goes through two levels and settles the invoice only at the end', async () => {
    asRole('FINANCE_MANAGER');
    const pay = (amount: number) => call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', amount, partyType: 'SUPPLIER', partyId: String(d.sup._id), refInvoiceId: String(d.purchaseInvoice._id), instrument: { utr: 'UTR-1' } });
    expect((await pay(40000)).status).toBe(201); // under 50k: immediate
    const big = await pay(55000); // 50,000 to 89,999: one level (MANAGER)
    expect(big.status).toBe(202);
    expect((await pay(5000)).status).toBe(201); // small again: immediate

    const inv0 = await m.Invoice.findById(d.purchaseInvoice._id);
    expect(inv0.amountPaid).toBe(45000);                                   // only the two immediate payments
    const ok = await decide(big.json.approvalId, 'MANAGER');
    expect(ok.json.status).toBe('APPROVED');
    const inv1 = await m.Invoice.findById(d.purchaseInvoice._id);
    expect(inv1.amountPaid).toBe(100000);
    expect(inv1.status).toBe('PAID');
  });

  it('a payment above 90,000 needs both levels in order', async () => {
    asAdmin();
    const inv = await m.Invoice.create({ invoiceNumber: 'BILL-2', type: 'PURCHASE', supplier: d.sup._id, date: new Date(), dueDate: new Date(), items: [{ description: 'x', quantity: 1, unitPrice: 200000, taxableValue: 200000, totalAmount: 200000 }], subTotal: 200000, totalAmount: 200000, status: 'ISSUED' });
    asRole('FINANCE_MANAGER');
    const q = await call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', amount: 150000, partyType: 'SUPPLIER', refInvoiceId: String(inv._id), instrument: { utr: 'UTR-2' } });
    expect(q.status).toBe(202);
    expect((await decide(q.json.approvalId, 'ADMIN')).json.currentLevel).toBe(1); // admin may act on level 1 but it moves on, not posts
    expect((await m.Invoice.findById(inv._id)).amountPaid).toBe(0);                  // still unpaid after the first level
    expect((await m.Voucher.countDocuments({ type: 'BANK_PAYMENT', amount: 150000 }))).toBe(0);
  });

  // ---------------- credit notes ----------------
  it('a credit note leaves the invoice untouched until approved', async () => {
    asRole('FINANCE_MANAGER');
    const q = await call(r.vouchers.POST, 'POST', { type: 'CREDIT_NOTE', noteReason: 'POST_SALE_DISCOUNT', taxableAmount: 50000, gstPercent: 18, refInvoiceId: String(d.salesInvoice._id) });
    expect(q.status).toBe(202);
    expect((await m.Invoice.findById(d.salesInvoice._id)).creditedAmount ?? 0).toBe(0);
    const ok = await decide(q.json.approvalId, 'MANAGER');
    expect(ok.json.resultRef).toMatch(/^CN-/);
    const inv = await m.Invoice.findById(d.salesInvoice._id);
    expect(inv.creditedAmount).toBe(59000);
    expect(inv.status).toBe('PARTIAL');
  });

  // ---------------- period lock at approval time ----------------
  it('if the period is locked when the final approval comes, nothing is posted and the request stays pending', async () => {
    asRole('FINANCE_MANAGER');
    const q = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 60000, gstPercent: 0, expensePayment: 'CREDIT' });
    await m.Lock.create({ kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000) });
    const before = await m.Voucher.countDocuments();
    const blocked = await decide(q.json.approvalId, 'MANAGER');
    expect(blocked.status).toBe(422);
    expect(blocked.json.error).toContain('locked');
    expect(await m.Voucher.countDocuments()).toBe(before);
    const req = await m.Request.findById(q.json.approvalId);
    expect(req.status).toBe('PENDING');
    expect(req.currentLevel).toBe(0);
    expect(req.levels[0].status).toBe('PENDING');   // the approval was not recorded
    expect(req.locked).toBe(false);                  // and the request is free to be decided again

    await m.Lock.deleteMany({});
    expect((await decide(q.json.approvalId, 'MANAGER')).status).toBe(200);
    expect(await m.Voucher.countDocuments()).toBe(before + 1);
  });

  it('two simultaneous approvals create the voucher only once', async () => {
    asRole('FINANCE_MANAGER');
    const q = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 70000, gstPercent: 0, expensePayment: 'CREDIT', narration: 'race' });
    const before = await m.Voucher.countDocuments({ narration: 'race' });
    asRole('MANAGER');
    const results = await Promise.all([call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: q.json.approvalId }), call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: q.json.approvalId })]);
    expect(results.map(x => x.status).sort()).toEqual([200, 409]);
    expect(await m.Voucher.countDocuments({ narration: 'race' })).toBe(before + 1);
  });

  // ---------------- sales orders ----------------
  it('a high-value sales order stays in draft with no stock reserved until approved', async () => {
    const mkSo = (n: string, amount: number, qty: number) => m.SO.create({ soNumber: n, customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.prod._id, quantity: qty, unitPrice: amount / qty, totalPrice: amount }], totalAmount: amount, status: 'DRAFT' });
    const small = await mkSo('SO-S', 50000, 5);
    asRole('SALES');
    const direct = await call(r.soApproval.POST, 'POST', undefined, { id: String(small._id) });
    expect(direct.status).toBe(200);                       // below threshold: approved at once, as before
    expect(direct.json.salesOrder.status).toBe('APPROVED');

    const big = await mkSo('SO-B', 200000, 20);
    const allocatedBefore = (await m.Batch.findById(d.batch._id)).allocatedQuantity;
    const pending = await call(r.soApproval.POST, 'POST', undefined, { id: String(big._id) });
    expect(pending.status).toBe(202);
    expect(pending.json.message).toContain('sent for approval');
    const so = await m.SO.findById(big._id);
    expect(so.status).toBe('DRAFT');
    expect(so.approvalPending).toBe(true);
    expect((so.allocatedBatches || []).length).toBe(0);
    expect((await m.Batch.findById(d.batch._id)).allocatedQuantity).toBe(allocatedBefore);

    // clicking again does not raise a second request
    const again = await call(r.soApproval.POST, 'POST', undefined, { id: String(big._id) });
    expect(String(again.json.approvalId)).toBe(String(pending.json.approvalId));
    expect(await m.Request.countDocuments({ module: 'SALES_ORDER', refId: String(big._id) })).toBe(1);
    d.soReq = pending.json.approvalId; d.bigSo = big;
  });

  it('approving the sales order reserves the stock; rejecting leaves it a draft that can be sent again', async () => {
    const before = (await m.Batch.findById(d.batch._id)).allocatedQuantity;
    const ok = await decide(d.soReq, 'MANAGER');
    expect(ok.json.status).toBe('APPROVED');
    const so = await m.SO.findById(d.bigSo._id);
    expect(so.status).toBe('APPROVED');
    expect(so.approvalPending).toBe(false);
    expect(so.allocatedBatches.length).toBeGreaterThan(0);
    expect((await m.Batch.findById(d.batch._id)).allocatedQuantity).toBe(before + 20);

    const second = await m.SO.create({ soNumber: 'SO-R', customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.prod._id, quantity: 2, unitPrice: 100000, totalPrice: 200000 }], totalAmount: 200000, status: 'DRAFT' });
    asRole('SALES');
    const q = await call(r.soApproval.POST, 'POST', undefined, { id: String(second._id) });
    const rej = await decide(q.json.approvalId, 'MANAGER', 'reject', 'Price too low');
    expect(rej.json.status).toBe('REJECTED');
    const after = await m.SO.findById(second._id);
    expect(after.status).toBe('DRAFT');
    expect(after.approvalPending).toBe(false);
    asRole('SALES');
    expect((await call(r.soApproval.POST, 'POST', undefined, { id: String(second._id) })).status).toBe(202); // can be resubmitted
  });

  // ---------------- outward job work ----------------
  it('outward job work above the value limit holds the stock until approved, and re-checks stock at approval', async () => {
    asRole('PRODUCTION_MANAGER');
    await m.Batch.updateOne({ _id: d.batch._id }, { currentQuantity: 1000, allocatedQuantity: 0 }); // known stock, no reservations
    const send = (qty: number) => call(r.jobs.POST, 'POST', { kind: 'OUTWARD', party: String(d.sup._id), natureOfJob: 'Plating', items: [{ product: String(d.prod._id), quantity: qty }] });
    const stock = async () => (await m.Batch.findById(d.batch._id)).currentQuantity;

    const s0 = await stock();
    const small = await send(10);                    // 10 x 100 = 1,000 (under 5,000)
    expect(small.status).toBe(201);
    expect(small.json.number).toMatch(/^A-/);
    expect(await stock()).toBe(s0 - 10);

    const jobsBefore = await m.Job.countDocuments();
    const stockBefore = await stock();
    const under = await send(40);                    // 40 x 100 = 4,000: still under the 5,000 limit
    expect(under.status).toBe(201);
    const bigger = await send(50);                   // 50 x 100 = 5,000: reaches the limit, needs approval
    expect(bigger.status).toBe(202);
    expect(await m.Job.countDocuments()).toBe(jobsBefore + 1);       // only the 40-unit job exists
    expect(await stock()).toBe(stockBefore - 40);                    // nothing left for the 50-unit request
    d.jobReq = bigger.json.approvalId;
    expect((await m.Request.findById(d.jobReq)).summary).toContain('Subcon Ltd');

    // stock disappears before the approver acts: approval fails cleanly and stays pending
    await m.Batch.updateOne({ _id: d.batch._id }, { currentQuantity: 5 });
    const failed = await decide(d.jobReq, 'MANAGER');
    expect(failed.status).toBe(409);
    expect(failed.json.error).toContain('Not enough free approved stock');
    expect((await m.Request.findById(d.jobReq)).status).toBe('PENDING');

    await m.Batch.updateOne({ _id: d.batch._id }, { currentQuantity: 200 });
    const ok = await decide(d.jobReq, 'MANAGER');
    expect(ok.json.status).toBe('APPROVED');
    expect(ok.json.resultRef).toMatch(/^A-/);
    expect(await stock()).toBe(150);                                  // 200 on hand - 50 sent
    const job = await m.Job.findOne({ number: ok.json.resultRef });
    expect(job.items[0].quantity).toBe(50);
    expect(job.createdBy).toBe('Test PRODUCTION_MANAGER');            // the requester, not the approver
  });

  it('without a rule, documents follow the normal flow exactly as before', async () => {
    await setRules('EXPENSE_VOUCHER', []);
    asRole('FINANCE_MANAGER');
    const v = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: 900000, gstPercent: 18, expensePayment: 'CREDIT' });
    expect(v.status).toBe(201);
  });

  // ================= found on re-check: failures part-way, races and data exposure =================
  describe('robustness', () => {
    const pendingExpense = async (amount = 90000, narration = 'robust') => {
      await setRules('EXPENSE_VOUCHER', [{ minAmount: 50000, levels: ['MANAGER'] }]); // switches to Admin, so do it before acting as the requester
      asRole('FINANCE_MANAGER');
      const q = await call(r.vouchers.POST, 'POST', { type: 'EXPENSE', taxableAmount: amount, gstPercent: 0, expensePayment: 'CREDIT', narration });
      expect(q.status).toBe(202);
      return String(q.json.approvalId);
    };

    it('the approvals list never exposes the stored document details, and non-approvers see only their own requests', async () => {
      const reqId = await pendingExpense(95000, 'confidential narration');
      asAdmin();
      const adminView = (await call(r.requests.GET, 'GET')).json;
      expect(adminView.length).toBeGreaterThan(1);
      for (const row of adminView) expect(row.payload).toBeUndefined();   // no instrument numbers, party ids, etc.
      expect(adminView.find((x: any) => String(x._id) === reqId).summary).toContain('confidential narration');

      asRole('SALES', 'Some Salesperson');
      expect((await call(r.requests.GET, 'GET')).json).toEqual([]);        // not an approver and raised nothing
      asRole('MANAGER');
      const managerInbox = (await call(r.requests.GET, 'GET', undefined, undefined, '?inbox=1')).json;
      expect(managerInbox.map((x: any) => String(x._id))).toContain(reqId);
      for (const row of managerInbox) expect(row.payload).toBeUndefined();
      asRole('FINANCE_MANAGER');                                            // the requester sees their own
      expect((await call(r.requests.GET, 'GET')).json.map((x: any) => String(x._id))).toContain(reqId);
    });

    it('two simultaneous "send for approval" clicks raise a single request', async () => {
      await m.Request.init(); // make sure the unique index exists
      const so = await m.SO.create({ soNumber: 'SO-RACE', customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.prod._id, quantity: 2, unitPrice: 150000, totalPrice: 300000 }], totalAmount: 300000, status: 'DRAFT' });
      asRole('SALES');
      const [a, b] = await Promise.all([call(r.soApproval.POST, 'POST', undefined, { id: String(so._id) }), call(r.soApproval.POST, 'POST', undefined, { id: String(so._id) })]);
      expect([a.status, b.status]).toEqual([202, 202]);
      expect(String(a.json.approvalId)).toBe(String(b.json.approvalId));
      expect(await m.Request.countDocuments({ module: 'SALES_ORDER', refId: String(so._id), status: 'PENDING' })).toBe(1);
    });

    it('retrying after a failure that happened AFTER posting does not post the voucher twice', async () => {
      const reqId = await pendingExpense(91000, 'retry-after-post');
      const posted = () => m.Voucher.countDocuments({ narration: 'retry-after-post' });
      const ledger = await bal('5040');

      // the voucher gets posted, then recording the approval fails
      const original = m.Request.prototype.save;
      m.Request.prototype.save = async function (...a: any[]) { m.Request.prototype.save = original; throw new Error('database hiccup'); };
      const failed = await decide(reqId, 'MANAGER');
      m.Request.prototype.save = original;
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(await posted()).toBe(1);
      expect((await m.Request.findById(reqId)).status).toBe('PENDING');
      expect((await m.Request.findById(reqId)).locked).toBe(false);

      const retry = await decide(reqId, 'MANAGER');                         // approving again must not post again
      expect(retry.status).toBe(200);
      expect(await posted()).toBe(1);
      expect(await bal('5040')).toBe(ledger + 91000);                         // ledger moved once
      expect(retry.json.resultRef).toBe((await m.Voucher.findOne({ narration: 'retry-after-post' })).number);
    });

    it('if saving the voucher fails after the journal was posted, the ledger and the invoice are put back', async () => {
      asAdmin();
      const inv = await m.Invoice.create({ invoiceNumber: 'BILL-ROLL', type: 'PURCHASE', supplier: d.sup._id, date: new Date(), dueDate: new Date(), items: [{ description: 'x', quantity: 1, unitPrice: 30000, taxableValue: 30000, totalAmount: 30000 }], subTotal: 30000, totalAmount: 30000, status: 'ISSUED' });
      const snapshot = async () => ({ bank: await bal('1010'), ap: await bal('2010'), journals: await mongoose.connection.collection('journalentries').countDocuments(), paid: (await m.Invoice.findById(inv._id)).amountPaid ?? 0, vouchers: await m.Voucher.countDocuments() });
      const before = await snapshot();
      asRole('FINANCE_MANAGER');
      const body = { type: 'BANK_PAYMENT', amount: 20000, partyType: 'SUPPLIER', partyId: String(d.sup._id), refInvoiceId: String(inv._id), instrument: { utr: 'U-ROLL' } };

      const original = m.Voucher.create;
      m.Voucher.create = () => Promise.reject(new Error('disk full'));
      let failed: any;
      try { failed = await call(r.vouchers.POST, 'POST', body); } finally { m.Voucher.create = original; }
      expect(failed.status).toBe(500);
      expect(await snapshot()).toEqual(before);                               // nothing half-posted

      expect((await call(r.vouchers.POST, 'POST', body)).status).toBe(201);   // and it works once the fault is gone
      expect((await m.Invoice.findById(inv._id)).amountPaid).toBe(20000);
    });

    it('two simultaneous payments cannot overpay an invoice', async () => {
      asAdmin();
      const inv = await m.Invoice.create({ invoiceNumber: 'BILL-OVER', type: 'PURCHASE', supplier: d.sup._id, date: new Date(), dueDate: new Date(), items: [{ description: 'x', quantity: 1, unitPrice: 100000, taxableValue: 100000, totalAmount: 100000 }], subTotal: 100000, totalAmount: 100000, status: 'ISSUED' });
      await setRules('PAYMENT_VOUCHER', []); // both payments post immediately
      asRole('FINANCE_MANAGER');
      const pay = () => call(r.vouchers.POST, 'POST', { type: 'BANK_PAYMENT', amount: 60000, partyType: 'SUPPLIER', partyId: String(d.sup._id), refInvoiceId: String(inv._id), instrument: { utr: 'U-OVER' } });
      const results = await Promise.all([pay(), pay()]);
      expect(results.filter(x => x.status === 201)).toHaveLength(1);                 // exactly one payment is accepted
      expect([400, 409]).toContain(results.find(x => x.status !== 201)!.status);       // the other is refused, not silently applied
      const after = await m.Invoice.findById(inv._id);
      expect(after.amountPaid).toBe(60000);                                    // never 120,000
      expect(await m.Voucher.countDocuments({ 'instrument.utr': 'U-OVER' })).toBe(1);
    });

    it('a sales order that was approved some other way does not leave its request stuck', async () => {
      const so = await m.SO.create({ soNumber: 'SO-ELSE', customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.prod._id, quantity: 2, unitPrice: 150000, totalPrice: 300000 }], totalAmount: 300000, status: 'DRAFT' });
      await setRules('SALES_ORDER', [{ minAmount: 100000, levels: ['MANAGER'] }]);
      asRole('SALES');
      const q = await call(r.soApproval.POST, 'POST', undefined, { id: String(so._id) });
      await m.SO.updateOne({ _id: so._id }, { status: 'APPROVED', allocatedBatches: [{ batch: d.batch._id, product: d.prod._id, quantity: 2 }] }); // approved by another route meanwhile
      const allocated = (await m.Batch.findById(d.batch._id)).allocatedQuantity;
      const ok = await decide(q.json.approvalId, 'MANAGER');
      expect(ok.status).toBe(200);
      expect(ok.json.status).toBe('APPROVED');
      expect((await m.Batch.findById(d.batch._id)).allocatedQuantity).toBe(allocated);   // stock not reserved a second time
      expect((await m.SO.findById(so._id)).approvalPending).toBe(false);
    });

    it('outward job work: a failure while issuing puts the stock back, and a retry issues it once', async () => {
      await m.Batch.updateOne({ _id: d.batch._id }, { currentQuantity: 500, allocatedQuantity: 0 });
      await setRules('JOB_WORK_OUTWARD', [{ minAmount: 5000, levels: ['MANAGER'] }]);
      asRole('PRODUCTION_MANAGER', 'Prod Requester');
      const q = await call(r.jobs.POST, 'POST', { kind: 'OUTWARD', party: String(d.sup._id), natureOfJob: 'Plating', items: [{ product: String(d.prod._id), quantity: 60 }] });
      expect(q.status).toBe(202);
      const stock = async () => (await m.Batch.findById(d.batch._id)).currentQuantity;
      const jobs = () => m.Job.countDocuments({ createdBy: 'Prod Requester' });
      const before = { stock: await stock(), jobs: await jobs() };

      const original = m.Job.create;
      m.Job.create = () => Promise.reject(new Error('write failed'));
      let failed: any;
      try { failed = await decide(q.json.approvalId, 'MANAGER'); } finally { m.Job.create = original; }
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(await stock()).toBe(before.stock);                                // stock restored
      expect(await jobs()).toBe(before.jobs);
      expect((await m.Request.findById(q.json.approvalId)).status).toBe('PENDING');

      const ok = await decide(q.json.approvalId, 'MANAGER');
      expect(ok.status).toBe(200);
      expect(await stock()).toBe(before.stock - 60);                           // deducted exactly once
      expect(await jobs()).toBe(before.jobs + 1);
    });

    it('a job already created for a request (but not yet recorded) is reused, never duplicated', async () => {
      asRole('PRODUCTION_MANAGER', 'Prod Requester');
      const q = await call(r.jobs.POST, 'POST', { kind: 'OUTWARD', party: String(d.sup._id), natureOfJob: 'Coating', items: [{ product: String(d.prod._id), quantity: 55 }] });
      expect(q.status).toBe(202);
      // simulate: the challan was issued and stock deducted, then the approval record failed to save
      const existing = await m.Job.create({ kind: 'OUTWARD', number: 'A-PRE-1', party: d.sup._id, partyName: 'Subcon Ltd', natureOfJob: 'Coating', approvalRef: String(q.json.approvalId), items: [{ description: 'Steel Bar', quantity: 55, value: 5500 }] });
      const stock = (await m.Batch.findById(d.batch._id)).currentQuantity;
      const ok = await decide(q.json.approvalId, 'MANAGER');
      expect(ok.status).toBe(200);
      expect(ok.json.resultRef).toBe(existing.number);
      expect(await m.Job.countDocuments({ approvalRef: String(q.json.approvalId) })).toBe(1);
      expect((await m.Batch.findById(d.batch._id)).currentQuantity).toBe(stock);   // not deducted again
    });
  });
});
