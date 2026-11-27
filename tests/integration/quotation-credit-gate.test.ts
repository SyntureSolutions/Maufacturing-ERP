import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// I12: winning a quotation (PO received) is checked against what the customer really owes, and only the right roles can override it
describe('quotation credit gate', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const mkCustomer = (creditLimit?: number) => m.Customer.create({ name: `Cust ${rnd()}`, code: `C-${rnd()}`, billingAddress: 'x', ...(creditLimit !== undefined ? { creditLimit } : {}) });
  const mkQuote = (cust: any, total: number) => m.Quote.create({
    quoteNumber: `QT-${rnd()}`, customer: cust._id, customerName: cust.name, stage: 'QUOTATION_SENT', totalAmount: total,
    items: [{ product: d.prod._id, productName: 'Widget', quantity: 1, unitPrice: total, totalPrice: total }],
  });
  const invoice = (cust: any, total: number, paid: number, status: string, credited = 0) => m.Invoice.collection.insertOne({
    invoiceNumber: `INV-${rnd()}`, type: 'SALES', customer: cust._id, date: new Date(), dueDate: new Date(Date.now() + 864e5), items: [], totalAmount: total, amountPaid: paid, creditedAmount: credited, status, createdAt: new Date(),
  });
  const order = (cust: any, total: number, status: string, extra: any = {}) => m.SO.create({
    soNumber: `SO-X-${rnd()}`, customer: cust._id, customerName: cust.name, status, totalAmount: total, items: [{ product: d.prod._id, quantity: 1, unitPrice: total, totalPrice: total }], ...extra,
  });
  const win = (quote: any, body: any = {}, role = 'SALES') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.quote.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: `CUST-${rnd()}`, ...body }, { id: id(quote) }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', Quote: 'Quotation', SO: 'SalesOrder', Invoice: 'Invoice', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.quote = await import('@/app/api/quotations/[id]/route');
    d.credit = await import('@/lib/creditExposure');
    d.prod = await m.Product.create({ name: 'Widget', sku: 'W-QC', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('a deal inside the limit goes through and creates a locked draft order', async () => {
    const cust = await mkCustomer(100000);
    const q = await mkQuote(cust, 60000);
    const res = await win(q);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.createdSalesOrder).toMatchObject({ status: 'DRAFT', priceLocked: true, totalAmount: 60000 });
    expect(((await m.Quote.findById(q._id).lean()) as any)).toMatchObject({ stage: 'PO_RECEIVED', creditCheckPassed: true });
  });

  it('a customer with no limit is never blocked', async () => {
    const none = await mkCustomer(), zero = await mkCustomer(0);
    expect((await win(await mkQuote(none, 9e9))).status).toBe(200);
    expect((await win(await mkQuote(zero, 9e9))).status).toBe(200);
  });

  it('a deal over the limit is refused with the figures, and nothing is created or changed', async () => {
    const cust = await mkCustomer(100000);
    const q = await mkQuote(cust, 120000);
    const res = await win(q);
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ creditCheckFailed: true, creditLimit: 100000, exposure: 120000 });
    expect(res.json.error).toContain('Credit limit exceeded');
    expect(await m.SO.countDocuments({ customer: cust._id })).toBe(0);
    const after: any = await m.Quote.findById(q._id).lean();
    expect(after.stage).toBe('QUOTATION_SENT');
    expect(after.creditCheckPassed).not.toBe(true);
    expect(await m.Audit.countDocuments({ resourceName: q.quoteNumber, action: 'OVERRIDE' })).toBe(0);
  });

  it('what the customer already owes counts: unpaid invoices (net of payments and credit notes) and approved orders not yet invoiced', async () => {
    const cust = await mkCustomer(100000);
    await invoice(cust, 40000, 10000, 'PARTIAL', 5000);                  // 25,000 still owed
    await invoice(cust, 90000, 90000, 'PAID');                           // settled: not counted
    await invoice(cust, 70000, 0, 'CANCELLED');                          // cancelled: not counted
    await order(cust, 20000, 'APPROVED');                                // 20,000 ordered, not invoiced yet
    await order(cust, 30000, 'DRAFT');                                   // a draft is not a commitment yet
    await order(cust, 50000, 'CANCELLED');
    await order(cust, 10000, 'APPROVED', { taxInvoiceStatus: 'INVOICED' });   // already invoiced: its invoice would be above
    const e = await d.credit.creditExposure(cust._id);
    expect(e).toEqual({ receivable: 25000, openOrders: 20000, total: 45000 });
    const over = await win(await mkQuote(cust, 55001));                  // 45,000 + 55,001 is over the limit
    expect(over.status).toBe(422);
    expect(over.json.error).toContain('₹25,000 unpaid invoices');
    expect(over.json.error).toContain('₹20,000 open orders');
    expect((await win(await mkQuote(cust, 55000))).status).toBe(200);    // 45,000 + 55,000 is exactly the limit
  });

  it('only Admin, Manager and Finance Manager may override, and each override is audited with its reason', async () => {
    const cust = await mkCustomer(10000);
    const q = await mkQuote(cust, 50000);
    for (const role of ['SALES', 'STAFF', 'SUPPLY_CHAIN_MANAGER', 'PRODUCTION_MANAGER']) {
      const res = await win(q, { bypassCreditCheck: true }, role);
      expect(res.status, role).toBe(403);
    }
    expect(await m.SO.countDocuments({ customer: cust._id })).toBe(0);
    expect(((await m.Quote.findById(q._id).lean()) as any).stage).toBe('QUOTATION_SENT');
    for (const role of ['FINANCE_MANAGER', 'MANAGER', 'ADMIN']) {
      const c = await mkCustomer(10000), quote = await mkQuote(c, 50000);
      const res = await win(quote, { bypassCreditCheck: true, bypassReason: 'long-standing customer, advance promised' }, role);
      expect(res.status, role).toBe(200);
      expect(res.json.createdSalesOrder.status).toBe('DRAFT');
      const entry: any = await m.Audit.findOne({ resourceName: quote.quoteNumber, action: 'OVERRIDE' }).lean();
      expect(entry, role).toBeTruthy();
      expect(entry.reason).toBe('long-standing customer, advance promised');
      expect(entry.details).toContain('overridden');
      expect(((await m.Quote.findById(quote._id).lean()) as any).creditCheckNotes).toContain('overridden');
    }
  });

  it('asking to override a deal that is within the limit is not an override and leaves no audit entry', async () => {
    const cust = await mkCustomer(100000);
    const q = await mkQuote(cust, 1000);
    const res = await win(q, { bypassCreditCheck: true }, 'SALES');
    expect(res.status).toBe(200);
    expect(await m.Audit.countDocuments({ resourceName: q.quoteNumber, action: 'OVERRIDE' })).toBe(0);
  });
});
