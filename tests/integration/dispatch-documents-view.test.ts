import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// P5/P6/P7: a delivery challan, pro-forma, tax invoice and vendor bill can each be read by id
describe('dispatch and billing documents: read by id', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const ghost = () => String(new mongoose.Types.ObjectId());
  const line = { description: 'Frame', hsnCode: '8714', quantity: 2, unitPrice: 500, taxableValue: 1000, cgstRate: 6, cgstAmount: 60, sgstRate: 6, sgstAmount: 60, totalAmount: 1120 };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', Supplier: 'Supplier', DC: 'DeliveryChallan', PI: 'ProformaInvoice', Invoice: 'Invoice', PO: 'PurchaseOrder', Batch: 'Batch' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.dc = await import('@/app/api/delivery-challans/[id]/route');
    r.pi = await import('@/app/api/proforma/[id]/route');
    r.inv = await import('@/app/api/dispatch/invoices/[id]/route');
    r.bill = await import('@/app/api/vendor-bills/[id]/route');
    m.prod = await m.Product.create({ name: 'Frame', sku: 'FR-DV', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714' });
    m.cust = await m.Customer.create({ name: 'Doc Buyer', code: `C-${rnd()}`, billingAddress: 'x' });
    m.sup = await m.Supplier.create({ name: 'Doc Vendor', code: `V-${rnd()}`, address: 'y', paymentTerms: 'Net 30', gstin: '27AAPFU0939F1ZV' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const dcDoc = (extra: any = {}) => m.DC.create({ number: `DC-${rnd()}`, salesOrder: new mongoose.Types.ObjectId(), soNumber: 'SO-1', customer: m.cust._id, customerName: 'Doc Buyer', reason: 'SUPPLY', placeOfSupply: '27', items: [line], totalTaxable: 1000, transporterName: 'Fast Move', vehicleNo: 'MH12AB1234', lrNo: 'LR-9', status: 'ISSUED', cogsValue: 700, ...extra });
  const saleInv = (extra: any = {}) => m.Invoice.create({ invoiceNumber: `INV-${rnd()}`, type: 'SALES', customer: m.cust._id, date: new Date(), dueDate: new Date(), items: [line], subTotal: 1000, totalCGST: 60, totalSGST: 60, totalIGST: 0, totalAmount: 1120, amountPaid: 120, creditedAmount: 100, status: 'PARTIAL', reverseCharge: false, ...extra });

  describe('delivery challan', () => {
    it('returns the challan with its lines and transport; the cost is shown only to finance roles', async () => {
      const dc = await dcDoc({ stockShortfall: [{ product: m.prod._id, qty: 1 }] });
      asAdmin();
      const res = await call(r.dc.GET, 'GET', undefined, { id: id(dc) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ number: dc.number, transporterName: 'Fast Move', vehicleNo: 'MH12AB1234', cogsValue: 700 });
      expect(res.json.items[0]).toMatchObject({ hsnCode: '8714', quantity: 2 });
      expect(res.json.stockShortfall[0].product.sku).toBe('FR-DV');
      asRole('SALES');
      const sales = await call(r.dc.GET, 'GET', undefined, { id: id(dc) });
      expect(sales.status).toBe(200);
      expect(sales.json.cogsValue).toBeUndefined();
    });
    it('404 for unknown or malformed ids, 403 for roles that cannot see invoices, 401 logged out', async () => {
      asAdmin();
      expect((await call(r.dc.GET, 'GET', undefined, { id: ghost() })).status).toBe(404);
      expect((await call(r.dc.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
      const dc = await dcDoc();
      asRole('QUALITY_INSPECTOR');
      expect((await call(r.dc.GET, 'GET', undefined, { id: id(dc) })).status).toBe(403);
      state.user = null;
      expect((await call(r.dc.GET, 'GET', undefined, { id: id(dc) })).status).toBe(401);
      asAdmin();
    });
  });

  describe('pro-forma invoice', () => {
    it('returns the pro-forma and refuses what it should', async () => {
      const pi = await m.PI.create({ number: `PI-${rnd()}`, salesOrder: new mongoose.Types.ObjectId(), soNumber: 'SO-2', customer: m.cust._id, customerName: 'Doc Buyer', placeOfSupply: '27', items: [line], hsnSummary: [], subTotal: 1000, totalCGST: 60, totalSGST: 60, totalIGST: 0, totalAmount: 1120, advanceRequested: 500, bank: { name: 'Test Bank' }, parties: {}, status: 'ISSUED' });
      asAdmin();
      const res = await call(r.pi.GET, 'GET', undefined, { id: id(pi) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ number: pi.number, advanceRequested: 500, totalAmount: 1120 });
      expect((await call(r.pi.GET, 'GET', undefined, { id: ghost() })).status).toBe(404);
      expect((await call(r.pi.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
      asRole('PRODUCTION_MANAGER');
      expect((await call(r.pi.GET, 'GET', undefined, { id: id(pi) })).status).toBe(403);
    });
  });

  describe('tax invoice', () => {
    it('returns the invoice with customer and payment figures; purchase bills are not served here', async () => {
      const inv = await saleInv();
      asAdmin();
      const res = await call(r.inv.GET, 'GET', undefined, { id: id(inv) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ invoiceNumber: inv.invoiceNumber, totalAmount: 1120, amountPaid: 120, creditedAmount: 100 });
      expect(res.json.customer.name).toBe('Doc Buyer');
      const bill = await saleInv({ type: 'PURCHASE', customer: undefined, supplier: m.sup._id, vendorBillNumber: `VB-${rnd()}` });
      expect((await call(r.inv.GET, 'GET', undefined, { id: id(bill) })).status).toBe(404);
      expect((await call(r.inv.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
    });
    it('still serves the e-invoice download when ?doc=einvoice is given, and keeps the role check', async () => {
      const inv = await saleInv();
      asRole('QUALITY_INSPECTOR');
      expect((await call(r.inv.GET, 'GET', undefined, { id: id(inv) })).status).toBe(403);
      asAdmin();
      const dl = await call(r.inv.GET, 'GET', undefined, { id: id(inv) }, '?doc=einvoice');
      expect(dl.status).toBe(404);                     // this invoice has no GST party snapshot, so no e-invoice, as before
    });
  });

  describe('vendor bill', () => {
    it('returns the bill with supplier, lines, purchase order and the outstanding amount', async () => {
      const po = await m.PO.create({ poNumber: `PO-VB-${rnd()}`, supplier: m.sup._id, status: 'RECEIVED', totalAmount: 1120, items: [{ product: m.prod._id, quantity: 2, unitPrice: 500, totalPrice: 1000 }] });
      const bill = await saleInv({ type: 'PURCHASE', customer: undefined, supplier: m.sup._id, vendorBillNumber: `VB-${rnd()}`, poNumber: po.poNumber, grnRefs: ['GRN-1'] });
      asAdmin();
      const res = await call(r.bill.GET, 'GET', undefined, { id: id(bill) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ vendorBillNumber: bill.vendorBillNumber, outstanding: 900, grnRefs: ['GRN-1'] });
      expect(res.json.supplier).toMatchObject({ name: 'Doc Vendor', gstin: '27AAPFU0939F1ZV' });
      expect(res.json.purchaseOrder).toMatchObject({ poNumber: po.poNumber, status: 'RECEIVED' });
    });
    it('is not served for a sales invoice, for unknown ids, or to roles outside finance', async () => {
      const sale = await saleInv();
      asAdmin();
      expect((await call(r.bill.GET, 'GET', undefined, { id: id(sale) })).status).toBe(404);
      expect((await call(r.bill.GET, 'GET', undefined, { id: ghost() })).status).toBe(404);
      expect((await call(r.bill.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
      for (const role of ['SALES', 'STAFF', 'SUPPLY_CHAIN_MANAGER']) { asRole(role); expect((await call(r.bill.GET, 'GET', undefined, { id: id(sale) })).status, role).toBe(403); }
      state.user = null;
      expect((await call(r.bill.GET, 'GET', undefined, { id: id(sale) })).status).toBe(401);
      asAdmin();
    });
  });
});
