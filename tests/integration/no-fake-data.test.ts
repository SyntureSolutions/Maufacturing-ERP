import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, asRole, id } from './harness';

// No invented figures: an empty database gives empty lists, a database error is an error, and sample data appears only
// with DEMO_MODE=true. The screens that used to make numbers up now compute them from the documents.
describe('no fake data', () => {
  const m: any = {}, r: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const day = (n: number) => new Date(Date.now() - n * 86400000);

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Batch', 'Customer', 'Invoice', 'PurchaseOrder', 'PurchaseIndent', 'BillOfMaterials']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    for (const [k, p] of Object.entries({
      production: 'production', enquiries: 'enquiries', orders: 'orders', machines: 'production/machines', projects: 'projects', ncr: 'quality/ncr',
      workers: 'labour', jobs: 'labour/jobs', payroll: 'labour/payroll', exportDocs: 'export-import', gl: 'finance/gl', mrp: 'mrp', aging: 'finance/ar/aging',
      valuation: 'inventory/valuation', replenish: 'inventory/replenish', stats: 'dashboard/stats', login: 'auth/login', categories: 'categories',
    })) r[k] = await import(/* @vite-ignore */ `@/app/api/${p}/route`);
    asAdmin();
  }, 120000);
  afterAll(stopDb);
  afterEach(() => { delete process.env.DEMO_MODE; asAdmin(); });

  it('lists nothing when there is nothing, instead of showing samples', async () => {
    for (const k of ['production', 'enquiries', 'orders', 'machines', 'projects', 'ncr', 'workers', 'jobs', 'payroll', 'exportDocs', 'mrp']) {
      const res = await call(r[k].GET, 'GET');
      expect(res.status, k).toBe(200);
      expect(res.json, k).toEqual([]);
    }
    const gl = (await call(r.gl.GET, 'GET')).json;
    expect(gl.accounts).toEqual([]);
  });

  it('still offers the samples in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call(r.production.GET, 'GET')).json.length).toBeGreaterThan(0);
  });

  it('does not let the built-in demo accounts sign in on a real system', async () => {
    const res = await call(r.login.POST, 'POST', { email: 'admin@inventorypro.com', password: '123456789' });
    expect(res.status).toBe(401);
  });

  it('does not pretend to save payroll, which has nowhere to be stored yet', async () => {
    const res = await call(r.payroll.POST, 'POST', { workerName: 'A', baseSalary: 1 });
    expect(res.status).toBe(501);
    expect((await call(r.payroll.GET, 'GET')).json).toEqual([]);
  });

  it('ages real receivables per customer and judges credit from them', async () => {
    const c1 = await m.Customer.create({ name: 'Metro Cycles', code: 'C-1', creditLimit: 100000, billingAddress: 'x' });
    const c2 = await m.Customer.create({ name: 'Small Shop', code: 'C-2', billingAddress: 'x' });
    const inv = (no: string, customer: any, amount: number, age: number, extra: any = {}) => m.Invoice.create({
      invoiceNumber: no, type: 'SALES', customer: customer._id, date: day(age), dueDate: day(age - 30), status: 'ISSUED',
      items: [{ description: 'Bikes', quantity: 1, unitPrice: amount, taxableValue: amount, totalAmount: amount }], subTotal: amount, totalAmount: amount, ...extra,
    });
    await inv('INV-A1', c1, 50000, 10);
    await inv('INV-A2', c1, 30000, 100, { amountPaid: 10000 });
    await inv('INV-A3', c1, 99999, 5, { status: 'PAID', amountPaid: 99999 });
    await inv('INV-B1', c2, 20000, 70);
    const rows = (await call(r.aging.GET, 'GET')).json;
    expect(rows.map((x: any) => [x.distributorName, x.totalOutstanding, x.current0to30, x.overdue61to90, x.overdue90Plus, x.creditStatus])).toEqual([
      ['Metro Cycles', 70000, 50000, 0, 20000, 'CRITICAL_HOLD'],
      ['Small Shop', 20000, 0, 20000, 0, 'WARNING'],
    ]);
    asRole('STAFF');
    expect((await call(r.aging.GET, 'GET')).status).toBe(403);
  });

  it('values only real stock at its own cost and says what has no cost', async () => {
    const tube = await m.Product.create({ name: 'Tube', sku: 'RM-T', category: oid(), uom: 'pcs' });
    const swarf = await m.Product.create({ name: 'Swarf', sku: 'SC-S', category: oid(), uom: 'kg', isScrap: true });
    const batch = (p: any, n: string, qty: number, price: number) => m.Batch.create({ product: p._id, batchNumber: n, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: price, qualityStatus: 'APPROVED', store: 'MAIN' });
    await batch(tube, 'V-1', 10, 100); await batch(tube, 'V-2', 4, 0); await batch(swarf, 'V-3', 50, 20);
    const v = (await call(r.valuation.GET, 'GET')).json;
    expect(v.methods.FIFO.totalValuation).toBe(1000);
    expect(v.withoutCost).toMatchObject({ batches: 1, quantity: 4, batchNumbers: ['V-2'] });
    expect(v.recentCOGSJournalEntries).toEqual([]);
    expect((await call(r.valuation.POST, 'POST', { action: 'POST_COGS', cogsAmount: 25000 })).status).toBe(410);
    await m.Batch.deleteMany({}); await m.Product.deleteMany({});
  });

  it('checks reorder levels item by item from the item master and raises an indent, never a priced PO', async () => {
    const bolt = await m.Product.create({ name: 'Bolt', sku: 'RM-BOLT', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', minStockLevel: 10, safetyStock: 5 });
    const nut = await m.Product.create({ name: 'Nut', sku: 'RM-NUT', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', minStockLevel: 10 });
    const frame = await m.Product.create({ name: 'Frame', sku: 'SF-FRAME', category: oid(), uom: 'pcs', productType: 'SEMI_FINISHED', minStockLevel: 10 });
    await m.Product.create({ name: 'Bike', sku: 'FG-NOBOM', category: oid(), uom: 'pcs', productType: 'FINISHED_GOOD', minStockLevel: 5 }); // made, even with no BOM yet
    const noLevel = await m.Product.create({ name: 'Washer', sku: 'RM-WASH', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL' });
    await m.Batch.create({ product: bolt._id, batchNumber: 'R-1', expiryDate: new Date('2031-01-01'), initialQuantity: 4, currentQuantity: 4, purchasePrice: 1, qualityStatus: 'APPROVED', store: 'MAIN' });
    await m.Batch.create({ product: nut._id, batchNumber: 'R-2', expiryDate: new Date('2031-01-01'), initialQuantity: 50, currentQuantity: 50, purchasePrice: 1, qualityStatus: 'APPROVED', store: 'MAIN' });
    await m.PurchaseOrder.create({ poNumber: 'PO-R-1', supplier: oid(), status: 'ORDERED', totalAmount: 2, items: [{ product: bolt._id, quantity: 2, unitPrice: 1, totalPrice: 2 }] });
    await m.BillOfMaterials.create({ product: frame._id, version: '1', status: 'ACTIVE', isDefault: true, components: [{ product: bolt._id, quantity: 1, unit: 'pcs' }] });

    const due = (await call(r.replenish.GET, 'GET')).json.due;
    // bolt: 4 free + 2 on PO = 6, at or below 10 => 10 + 5 safety - 6 = 9. Nut has plenty; the frame is made (MRP's job); the washer has no level.
    expect(due).toEqual([expect.objectContaining({ sku: 'RM-BOLT', available: 4, onOrder: 2, orderQty: 9 })]);
    asRole('STAFF');
    expect((await call(r.replenish.POST, 'POST')).status).toBe(403);
    asAdmin();
    const posted = await call(r.replenish.POST, 'POST');
    expect(posted.status).toBe(201);
    expect(posted.json.indent.items).toEqual([expect.objectContaining({ product: id(bolt), quantity: 9 })]);
    expect(await m.PurchaseOrder.countDocuments()).toBe(1); // no PO was invented
    // the open indent now counts as cover
    expect((await call(r.replenish.GET, 'GET')).json.due).toEqual([]);
    expect((await call(r.replenish.POST, 'POST')).json.indent).toBeNull();
    void noLevel;
  });

  it('builds the dashboard from the documents: no starting numbers, no made-up trend or feed', async () => {
    const s = (await call(r.stats.GET, 'GET', undefined, undefined, '?period=month')).json;
    expect(s.error).toBeUndefined();
    expect(s.kpis.openPOs).toMatchObject({ value: 1, trend: null });
    expect(s.kpis.activeWorkOrders.value).toBe(0);
    expect(s.kpis.lowStockItems.value).toBe(3); // the bolt, and the frame and bike (made, but still below their level)
    // this month's invoices: INV-A1 (10 days ago) only if still this month; compare with the invoices themselves
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const expected = (await m.Invoice.find({ type: 'SALES', date: { $gte: start } }).lean()).reduce((t: number, i: any) => t + i.subTotal, 0);
    expect(s.kpis.revenueThisMonth.value).toBe(expected);
    expect(s.chartData.reduce((t: number, b: any) => t + b.revenue, 0)).toBe(expected);
    expect(s.activities.every((a: any) => /^(po|so|inv|wo)-/.test(a.id))).toBe(true);
    asRole('STAFF');
    const staff = (await call(r.stats.GET, 'GET')).json;
    expect(staff.kpis.revenueThisMonth.value).toBeNull();
    expect(staff.chartData).toEqual([]);
  });

  it('refuses a category the database will not take, instead of pretending', async () => {
    const Category: any = (await import('@/models/Category')).default;
    await Category.init(); // the unique index must exist before the duplicate is tried
    await call(r.categories.POST, 'POST', { name: 'Frames', slug: 'frames' });
    const dup = await call(r.categories.POST, 'POST', { name: 'Frames', slug: 'frames' });
    expect(dup.status).toBeGreaterThanOrEqual(400);
  });
});
