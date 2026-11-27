import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// Sales controls from the CRM workbook: hold / release, minimum selling price at approval, and discount requests on quotations.
describe('sales controls: hold, minimum selling price, discount requests', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const as = (role: string, userId: string) => { asRole(role); state.user.id = userId; };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Quotation: 'Quotation' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.so = await import('@/app/api/sales-orders/route');
    r.approval = await import('@/app/api/sales-orders/[id]/approval/route');
    r.hold = await import('@/app/api/sales-orders/[id]/hold/route');
    r.reserve = await import('@/app/api/sales-orders/[id]/reserve/route');
    r.cancel = await import('@/app/api/sales-orders/[id]/cancel/route');
    r.quote = await import('@/app/api/quotations/[id]/route');
    r.revise = await import('@/app/api/quotations/[id]/revise/route');
    r.discount = await import('@/app/api/quotations/[id]/discount/route');
    const cat = new mongoose.Types.ObjectId();
    d.pump = await m.Product.create({ name: 'Pump', sku: 'SC-PUMP', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', price: 1000, minSellingPrice: 900, purchasePrice: 600 });
    d.seal = await m.Product.create({ name: 'Seal', sku: 'SC-SEAL', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', price: 50 });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'SC-C1', billingAddress: 'x' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const order = async (unitPrice = 1000) => {
    asAdmin();
    return (await call(r.so.POST, 'POST', { customer: id(d.cust), items: [{ product: id(d.pump), quantity: 2, unitPrice }, { product: id(d.seal), quantity: 10 }] })).json;
  };
  const approve = (so: any, body: any = {}) => call(r.approval.POST, 'POST', body, { id: so._id });
  const hold = (so: any, body: any) => call(r.hold.POST, 'POST', body, { id: so._id });

  describe('hold and release', () => {
    it('only a Manager or Admin can hold, with a reason', async () => {
      const so = await order();
      asRole('SALES');
      expect((await hold(so, { action: 'hold', reason: 'Customer asked to wait' })).status).toBe(403);
      asRole('MANAGER');
      expect((await hold(so, { action: 'hold', reason: '' })).status).toBe(400);
      expect((await hold(so, { action: 'fly' })).status).toBe(400);
    });

    it('a held draft cannot be approved; release puts it back', async () => {
      const so = await order();
      asRole('MANAGER');
      const held = await hold(so, { action: 'hold', reason: 'Awaiting customer confirmation' });
      expect(held.status, JSON.stringify(held.json)).toBe(200);
      expect(held.json).toMatchObject({ status: 'ON_HOLD', hold: { fromStatus: 'DRAFT', by: 'Test MANAGER' } });
      expect((await hold(so, { action: 'hold', reason: 'again please' })).status).toBe(409);
      asAdmin();
      expect((await approve(so)).status).toBe(400);
      asRole('MANAGER');
      const released = await hold(so, { action: 'release', remarks: 'Confirmed' });
      expect(released.status).toBe(200);
      expect(released.json.status).toBe('DRAFT');
      expect(released.json.hold).toBeUndefined();
      expect(released.json.holdHistory.map((h: any) => h.action)).toEqual(['HOLD', 'RELEASE']);
      expect((await hold(so, { action: 'release' })).status).toBe(409);
    });

    it('a held approved order cannot reserve stock, still counts against credit, and can be cancelled', async () => {
      const so = await order();
      expect((await approve(so)).status).toBe(200);
      asRole('MANAGER');
      expect((await hold(so, { action: 'hold', reason: 'Payment overdue' })).json.status).toBe('ON_HOLD');
      asAdmin();
      expect((await call(r.reserve.POST, 'POST', {}, { id: so._id })).status).toBe(409);
      const { creditExposure } = await import('@/lib/creditExposure');
      expect((await creditExposure(d.cust._id)).openOrders).toBeGreaterThanOrEqual(so.totalAmount);
      const cancelled = await call(r.cancel.POST, 'POST', { reason: 'Customer withdrew' }, { id: so._id });
      expect(cancelled.status, JSON.stringify(cancelled.json)).toBe(200);
      expect((await m.SO.findById(so._id).lean()).hold).toBeUndefined();
    });
  });

  describe('minimum selling price at approval', () => {
    it('shows the approver each line against its MSP and margin', async () => {
      const so = await order(850);
      const view = await call(r.approval.GET, 'GET', undefined, { id: so._id });
      expect(view.status).toBe(200);
      expect(view.json.belowMsp).toBe(true);
      expect(view.json.lines[0]).toMatchObject({ lineNo: 10, sku: 'SC-PUMP', unitPrice: 850, minSellingPrice: 900, belowMsp: true, shortfallVsMsp: 100, marginPercent: 29.41 });
      expect(view.json.lines[1]).toMatchObject({ lineNo: 20, belowMsp: false });
    });

    it('needs a Manager or Admin with a reason to approve below MSP', async () => {
      const so = await order(850);
      asAdmin();
      const refused = await approve(so);
      expect(refused.status).toBe(422);
      expect(refused.json.belowMsp).toBe(true);
      asRole('SALES');
      expect((await approve(so, { approveBelowMsp: true, mspReason: 'Strategic customer deal' })).status).toBe(403);
      asRole('MANAGER');
      expect((await approve(so, { approveBelowMsp: true, mspReason: 'ok' })).status).toBe(400);
      const ok = await approve(so, { approveBelowMsp: true, mspReason: 'Strategic customer, volume next quarter' });
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      const saved = await m.SO.findById(so._id).lean();
      expect(saved.status).toBe('APPROVED');
      expect(saved.mspOverride).toMatchObject({ by: 'Test MANAGER', lines: [10] });
    });

    it('an order at or above MSP is approved as before', async () => {
      expect((await approve(await order(900))).status).toBe(200);
    });
  });

  describe('discount requests on a quotation', () => {
    const newQuote = async () => (await m.Quotation.create({
      quoteNumber: `Q-SC-${Math.random().toString(36).slice(2, 7)}`, customer: d.cust._id, customerName: 'Buyer', stage: 'QUOTATION_SENT',
      items: [{ product: d.pump._id, productName: 'Pump', quantity: 10, unitPrice: 1000, totalPrice: 10000 }], totalAmount: 10000,
    }));
    const discount = (q: any, body: any) => call(r.discount.POST, 'POST', body, { id: id(q) });

    it('within the Sales limit, Sales applies it at once as a new revision', async () => {
      const q = await newQuote();
      as('SALES', '65f0111111111111111111a1');
      const res = await discount(q, { action: 'request', percent: 5, reason: 'Repeat customer' });
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.request).toMatchObject({ status: 'APPROVED', requiredRole: 'SALES', amount: 500, appliedRevision: 2 });
      const saved = await m.Quotation.findById(q._id).lean();
      expect(saved.items[0].unitPrice).toBe(950);
      expect(saved.totalAmount).toBe(9500);
      expect(saved.revision).toBe(2);
      expect(saved.revisions[0].items[0].unitPrice).toBe(1000); // the old price is kept
    });

    it('above the Sales limit it waits for a Manager, who is not the requester', async () => {
      const q = await newQuote();
      as('SALES', '65f0111111111111111111a1');
      const res = await discount(q, { action: 'request', percent: 15, reason: 'Competitor quoted lower' });
      expect(res.json.request).toMatchObject({ status: 'PENDING', requiredRole: 'MANAGER' });
      expect((await discount(q, { action: 'request', percent: 3, reason: 'Another one' })).status).toBe(409);
      expect((await discount(q, { action: 'approve' })).status).toBe(403);
      // nothing can move the quotation on while the request is open
      expect((await call(r.revise.POST, 'POST', { note: 'price change', items: [{ productName: 'Pump', product: id(d.pump), quantity: 10, unitPrice: 990 }] }, { id: id(q) })).status).toBe(409);
      as('ADMIN', '65f0111111111111111111a9');
      expect((await call(r.quote.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'PO-1' }, { id: id(q) })).status).toBe(409);

      as('FINANCE_MANAGER', '65f0111111111111111111a2');
      const ok = await discount(q, { action: 'approve', remarks: 'Matches competitor' });
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect(ok.json.request).toMatchObject({ status: 'APPROVED', decidedRole: 'FINANCE_MANAGER' });
      expect((await m.Quotation.findById(q._id).lean()).items[0].unitPrice).toBe(850);
    });

    it('above the Finance limit only an Admin decides, and a rejection needs a reason', async () => {
      const q = await newQuote();
      as('MANAGER', '65f0111111111111111111a3');
      const res = await discount(q, { action: 'request', percent: 30, reason: 'Clearance of old model' });
      expect(res.json.request).toMatchObject({ status: 'PENDING', requiredRole: 'ADMIN' });
      as('MANAGER', '65f0111111111111111111a4');
      expect((await discount(q, { action: 'approve' })).status).toBe(403);
      as('ADMIN', '65f0111111111111111111a9');
      expect((await discount(q, { action: 'reject' })).status).toBe(400);
      const rejected = await discount(q, { action: 'reject', remarks: 'Margin too thin' });
      expect(rejected.json.request.status).toBe('REJECTED');
      expect((await m.Quotation.findById(q._id).lean()).items[0].unitPrice).toBe(1000);
    });

    it('a small percentage over the amount ceiling still needs an Admin', async () => {
      const q = await m.Quotation.create({ quoteNumber: 'Q-SC-BIG', customerName: 'Buyer', stage: 'QUOTATION_SENT', items: [{ productName: 'Pump', quantity: 1000, unitPrice: 1000, totalPrice: 1000000 }], totalAmount: 1000000 });
      as('SALES', '65f0111111111111111111a1');
      expect((await discount(q, { action: 'request', percent: 6, reason: 'Bulk order' })).json.request).toMatchObject({ requiredRole: 'ADMIN', amount: 60000 });
      asAdmin();
    });

    it('checks the request itself', async () => {
      const q = await newQuote();
      as('SALES', '65f0111111111111111111a1');
      expect((await discount(q, { action: 'request', percent: 0, reason: 'none' })).status).toBe(400);
      expect((await discount(q, { action: 'request', percent: 5, reason: '' })).status).toBe(400);
      expect((await discount(q, { action: 'approve' })).status).toBe(409);
      asRole('PRODUCTION_MANAGER');
      expect((await discount(q, { action: 'request', percent: 5, reason: 'Because' })).status).toBe(403);
      asAdmin();
    });
  });
});
