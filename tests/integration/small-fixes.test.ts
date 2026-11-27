import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// I4: no batch appears without a document behind it; G8: a batch's text location and its stored place stay in step.
// I12: the credit limit is checked against what the customer really owes, at sales order approval as well.
describe('batch creation, location changes and credit limits', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const mkBatch = (over: any = {}) => m.Batch.create({ product: d.prod._id, batchNumber: `B-${rnd()}`, initialQuantity: 10, currentQuantity: 10, purchasePrice: 5, expiryDate: new Date('2031-01-01'), qualityStatus: 'APPROVED', ...over });
  const mkCustomer = (creditLimit?: number) => m.Customer.create({ name: `Cust ${rnd()}`, code: `C-${rnd()}`, billingAddress: 'x', ...(creditLimit ? { creditLimit } : {}) });
  const mkSo = (cust: any, total: number, status = 'DRAFT', extra: any = {}) => m.SO.create({ soNumber: `SO-${rnd()}`, customer: cust._id, customerName: cust.name, items: [{ product: d.prod._id, quantity: 1, unitPrice: total, totalPrice: total }], totalAmount: total, status, ...extra });
  const mkInvoice = (cust: any, total: number, paid: number, status: string) => m.Invoice.collection.insertOne({ invoiceNumber: `INV-${rnd()}`, type: 'SALES', customer: cust._id, date: new Date(), dueDate: new Date(), items: [], totalAmount: total, amountPaid: paid, status });
  const approve = (so: any, body: any = {}) => call(r.soApprove.POST, 'POST', body, { id: id(so) });

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Batch: 'Batch', Customer: 'Customer', SO: 'SalesOrder', Invoice: 'Invoice', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.batches = await import('@/app/api/inventory/batches/route');
    r.soApprove = await import('@/app/api/sales-orders/[id]/approval/route');
    d.credit = await import('@/lib/creditExposure');
    d.prod = await m.Product.create({ name: 'Widget', sku: 'W-1', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('I4 and G8: batches', () => {
    it('a batch cannot be created by hand, by anyone', async () => {
      const before = await m.Batch.countDocuments({});
      for (const role of ['ADMIN', 'STAFF', 'SALES']) {
        asRole(role);
        const res = await call(r.batches.POST, 'POST', { batchNumber: 'FAKE-1', product: id(d.prod), initialQuantity: 999, currentQuantity: 999, purchasePrice: 1, expiryDate: '2031-01-01' });
        expect(res.status).toBe(410);
      }
      expect(await m.Batch.countDocuments({})).toBe(before);
    });

    it('only stores-side roles move a batch, and a batch in quarantine or scrap is not moved by hand', async () => {
      const loose = await mkBatch({ location: 'Old Shed' });
      asRole('SALES');
      expect((await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(loose), newLocation: 'Bay 2' })).status).toBe(403);
      asRole('STAFF');
      const ok = await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(loose), newLocation: 'Bay 2' });
      expect(ok.status).toBe(200);
      expect((await m.Batch.findById(loose._id)).location).toBe('Bay 2');
      const bay = await mkBatch({ store: 'QUARANTINE', location: 'QUARANTINE' });
      expect((await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(bay), newLocation: 'W1/A/R1/B1' })).status).toBe(409);
    });

    it('a batch with a stored place keeps text and place in step', async () => {
      const placed = await mkBatch({ store: 'W1', zone: 'A', rack: 'R1', bin: 'B1', location: 'W1/A/R1/B1' });
      asRole('STAFF');
      const free = await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(placed), newLocation: 'somewhere near the door' });
      expect(free.status).toBe(400);
      const bad = await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(placed), newLocation: 'W9/A/R1/B1' });
      expect(bad.status).toBe(400);
      const ok = await call(r.batches.POST, 'POST', { action: 'TRANSFER_LOCATION', batchId: id(placed), newLocation: 'W2/B/R3/B4' });
      expect(ok.status).toBe(200);
      expect(await m.Batch.findById(placed._id)).toMatchObject({ store: 'W2', zone: 'B', rack: 'R3', bin: 'B4', location: 'W2/B/R3/B4' });
    });
  });

  describe('I12: credit limit', () => {
    it('exposure is unpaid invoices plus approved orders not yet invoiced; paid and cancelled ones do not count', async () => {
      const c = await mkCustomer(100000);
      await mkInvoice(c, 60000, 10000, 'PARTIAL');     // 50,000 outstanding
      await mkInvoice(c, 40000, 40000, 'PAID');         // nothing outstanding
      await mkInvoice(c, 90000, 0, 'CANCELLED');        // not owed
      await mkSo(c, 30000, 'APPROVED', { taxInvoiceStatus: 'UNINVOICED' });
      await mkSo(c, 70000, 'CANCELLED');
      await mkSo(c, 20000, 'DRAFT');
      const e = await d.credit.creditExposure(c._id);
      expect(e).toMatchObject({ receivable: 50000, openOrders: 30000, total: 80000 });
      expect(await d.credit.checkCredit(c._id, 20000)).toMatchObject({ over: false, newTotal: 100000 });
      expect(await d.credit.checkCredit(c._id, 20001)).toMatchObject({ over: true });
    });

    it('approving an order that takes the customer over the limit is refused, and nothing is reserved', async () => {
      const c = await mkCustomer(100000);
      await mkInvoice(c, 90000, 0, 'ISSUED');
      const so = await mkSo(c, 20000);
      asRole('SALES');
      const res = await approve(so);
      expect(res.status).toBe(422);
      expect(res.json.creditCheckFailed).toBe(true);
      expect((await m.SO.findById(so._id)).status).toBe('DRAFT');
    });

    it('only Admin, Manager or Finance Manager can override, and the override is audited', async () => {
      const c = await mkCustomer(100000);
      await mkInvoice(c, 90000, 0, 'ISSUED');
      const so = await mkSo(c, 20000);
      asRole('SALES');
      expect((await approve(so, { bypassCreditCheck: true })).status).toBe(403);
      expect((await m.SO.findById(so._id)).status).toBe('DRAFT');
      asRole('FINANCE_MANAGER');
      const ok = await approve(so, { bypassCreditCheck: true, bypassReason: 'Advance promised on Friday' });
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect((await m.SO.findById(so._id)).status).toBe('APPROVED');
      expect(await m.Audit.countDocuments({ resourceName: so.soNumber, action: 'OVERRIDE' })).toBe(1);
    });

    it('a customer within the limit, or with no limit, is not blocked', async () => {
      const within = await mkCustomer(100000);
      const none = await mkCustomer();
      await mkInvoice(none, 9_000_000, 0, 'ISSUED');
      asRole('SALES');
      expect((await approve(await mkSo(within, 50000))).status).toBe(200);
      expect((await approve(await mkSo(none, 50000))).status).toBe(200);
    });
  });
});
