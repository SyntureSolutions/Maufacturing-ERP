import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Loose ends: order numbers, work order creation hardening, and releasing reserved stock when work or orders are cancelled
describe('open items: numbering, work order creation, cancellation', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const batchOf = async (product: any) => (await m.Batch.findOne({ product }).lean()) as any;
  const mkBatch = (product: any, n: string, qty: number) => m.Batch.create({ product, batchNumber: n, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1' });
  const mkSo = (n: string, qty: number, status = 'DRAFT') => m.SO.create({ soNumber: n, customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.bike._id, quantity: qty, unitPrice: 100, totalPrice: qty * 100 }], totalAmount: qty * 100, status });
  const mkWo = (so: any, extra: any = {}) => m.WO.create({ woNumber: `WO-T-${Math.random().toString(36).slice(2, 7)}`, bom: d.bom._id, product: d.bike._id, quantity: 10, demandType: 'MTO', salesOrder: so._id, salesOrderRef: so.soNumber, status: 'PLANNED', ...extra });
  const cancelSo = (so: any, body: any = { reason: 'customer withdrew the order' }) => call(r.cancelSo.POST, 'POST', body, { id: id(so) });

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', SO: 'SalesOrder', WO: 'WorkOrder', Customer: 'Customer', MRN: 'MaterialRequisition', DC: 'DeliveryChallan', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.soCreate = await import('@/app/api/sales-orders/route');
    r.cancelSo = await import('@/app/api/sales-orders/[id]/cancel/route');
    r.prod = await import('@/app/api/production/route');
    r.prodOne = await import('@/app/api/production/[id]/route');
    d.mrn = await import('@/lib/mrn');
    d.approve = (await import('@/lib/salesOrderApproval')).approveSalesOrder;

    const cat = oid();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712' });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD');
    d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    d.bom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'C-1', billingAddress: 'x' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  // ---------------- numbering ----------------
  it('orders created at the same moment all get their own number', async () => {
    const make = (i: number) => call(r.soCreate.POST, 'POST', { customerName: `C${i}`, items: [{ product: id(d.bike), quantity: 1, unitPrice: 10, totalPrice: 10 }] });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => make(i)));
    expect(results.every(x => x.status === 201)).toBe(true);
    const numbers = results.map(x => x.json.soNumber);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers.every((n: string) => /^SO-\d{4}-\d{4}$/.test(n))).toBe(true);
    const next = await make(99);
    expect(parseInt(next.json.soNumber.slice(-4), 10)).toBe(9);          // simply the next one
  });

  // ---------------- work order creation ----------------
  it('a work order takes only the fields it should, and a bad request is refused instead of being quietly saved to memory', async () => {
    asRole('PRODUCTION_MANAGER');
    const good = { product: id(d.bike), bom: id(d.bom), quantity: 5, demandType: 'MTS' };
    const forged = await call(r.prod.POST, 'POST', { ...good, status: 'COMPLETED', fgApprovedQty: 999, qcGatePassed: true, qcStatus: 'PASSED', woNumber: 'WO-FORGED' });
    expect(forged.status).toBe(201);
    expect(forged.json.status).toBe('PLANNED');
    expect(forged.json.fgApprovedQty).toBe(0);
    expect(forged.json.qcGatePassed).toBe(false);
    expect(forged.json.qcStatus).toBe('PENDING');
    expect(forged.json.woNumber).not.toBe('WO-FORGED');
    const before = await m.WO.countDocuments();
    for (const [label, body, status] of [
      ['no quantity', { ...good, quantity: 0 }, 400], ['text quantity', { ...good, quantity: 'lots' }, 400], ['no product', { ...good, product: '' }, 400], ['bad bom', { ...good, bom: 'x' }, 400],
      ['bad priority', { ...good, priority: 'URGENT!' }, 400], ['bad date', { ...good, plannedStartDate: 'soon' }, 400], ['end before start', { ...good, plannedStartDate: '2030-02-01', plannedEndDate: '2030-01-01' }, 400],
      ['bad machine', { ...good, assignedMachine: 'm' }, 400], ['MTO without order', { ...good, demandType: 'MTO' }, 400], ['MTO with unknown order', { ...good, demandType: 'MTO', salesOrderRef: 'SO-NOPE' }, 404],
    ] as any[]) expect((await call(r.prod.POST, 'POST', body)).status, label).toBe(status);
    expect(await m.WO.countDocuments()).toBe(before);                      // nothing was saved
    asRole('SALES'); expect((await call(r.prod.POST, 'POST', good)).status).toBe(403);
    asAdmin();
  });

  it('work orders created at the same moment get different numbers', async () => {
    asRole('PRODUCTION_MANAGER');
    const body = { product: id(d.bike), bom: id(d.bom), quantity: 1 };
    const res = await Promise.all(Array.from({ length: 6 }, () => call(r.prod.POST, 'POST', body)));
    expect(res.every(x => x.status === 201)).toBe(true);
    expect(new Set(res.map(x => x.json.woNumber)).size).toBe(6);
    asAdmin();
  });

  // ---------------- cancelling work releases what was reserved ----------------
  it('cancelling a work order gives its reserved material back, once', async () => {
    await mkBatch(d.tube._id, 'B-TUBE', 100);
    const so = await mkSo('SO-W1', 10, 'APPROVED');
    const wo = await mkWo(so, { quantity: 10 });
    await d.mrn.createMrnForWorkOrder(wo, 'Admin');                       // reserves 20 tubes
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(20);
    asRole('PRODUCTION_MANAGER');
    expect((await call(r.prodOne.PATCH, 'PATCH', { status: 'CANCELLED' }, { id: id(wo) })).status).toBe(200);
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(0);
    expect(((await m.MRN.findOne({ workOrder: wo._id }).lean()) as any).status).toBe('CANCELLED');
    await call(r.prodOne.PATCH, 'PATCH', { status: 'CANCELLED' }, { id: id(wo) });   // again: nothing more is given back
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(0);
    asAdmin();
  });

  it('a part-issued requisition gives back only what was not issued', async () => {
    const so = await mkSo('SO-W2', 10, 'APPROVED');
    const wo = await mkWo(so, { quantity: 10 });
    const mrn: any = await d.mrn.createMrnForWorkOrder(wo, 'Admin');      // reserves 20
    await m.MRN.updateOne({ _id: mrn._id }, { status: 'PARTIALLY_ISSUED', 'items.0.issuedQty': 8 });
    await m.Batch.updateOne({ product: d.tube._id }, { $inc: { allocatedQuantity: -8, currentQuantity: -8 } });   // what the issue did to stock: 8 left the building
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(12);
    expect(await d.mrn.releaseWorkOrderReservations(wo._id)).toBe(1);
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(0);
    expect((await batchOf(d.tube._id)).currentQuantity).toBe(92);
  });

  // ---------------- cancelling a sales order ----------------
  it('cancelling an approved order releases its stock, cancels its planned work orders and their material', async () => {
    await mkBatch(d.bike._id, 'B-BIKE', 4);
    await m.Batch.updateOne({ product: d.tube._id }, { currentQuantity: 100, allocatedQuantity: 0 });
    const so = await mkSo('SO-C1', 4);
    await d.approve(id(so), { name: 'Admin', role: 'ADMIN' });            // reserves the 4 bikes
    expect((await batchOf(d.bike._id)).allocatedQuantity).toBe(4);
    const wo = await mkWo(so, { quantity: 5 });
    await d.mrn.createMrnForWorkOrder(wo, 'Admin');                       // reserves 10 tubes
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(10);

    asRole('SALES');
    const res = await cancelSo(so);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ status: 'CANCELLED', stockReservationsReleased: 1, requisitionsReleased: 1 });
    expect(res.json.workOrdersCancelled).toEqual([wo.woNumber]);
    expect((await batchOf(d.bike._id)).allocatedQuantity).toBe(0);
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(0);
    const after: any = await m.SO.findById(so._id).lean();
    expect(after.status).toBe('CANCELLED');
    expect(after.allocatedBatches).toEqual([]);
    expect(((await m.WO.findById(wo._id).lean()) as any).status).toBe('CANCELLED');
    expect(await m.Audit.countDocuments({ resourceName: 'SO-C1', action: 'DELETE' })).toBe(1);
    expect((await cancelSo(so)).status).toBe(409);                        // already cancelled
    asAdmin();
  });

  it('an order cannot be cancelled once work has started, goods have shipped, or it is invoiced; the reason and role are checked', async () => {
    asRole('SALES');
    const started = await mkSo('SO-C2', 1, 'APPROVED'); await mkWo(started, { status: 'IN_PROGRESS' });
    const r1 = await cancelSo(started); expect(r1.status).toBe(409); expect(r1.json.error).toContain('Work has already started');
    const shipped = await mkSo('SO-C3', 1, 'APPROVED'); await m.DC.collection.insertOne({ number: 'DC-C3', salesOrder: shipped._id, status: 'ISSUED', createdAt: new Date() });
    expect((await cancelSo(shipped)).status).toBe(409);
    const invoiced = await mkSo('SO-C4', 1, 'APPROVED'); await m.SO.updateOne({ _id: invoiced._id }, { taxInvoiceStatus: 'INVOICED' });
    expect((await cancelSo(invoiced)).status).toBe(409);
    const waiting = await mkSo('SO-C5', 1); await m.SO.updateOne({ _id: waiting._id }, { approvalPending: true });
    expect((await cancelSo(waiting)).status).toBe(409);
    const fulfilling = await mkSo('SO-C6', 1, 'IN_FULFILLMENT');
    expect((await cancelSo(fulfilling)).status).toBe(409);
    const plain = await mkSo('SO-C7', 1);
    expect((await cancelSo(plain, { reason: '' })).status).toBe(400);
    expect((await cancelSo(plain, {})).status).toBe(400);
    for (const role of ['VIEWER', 'STAFF', 'FINANCE_MANAGER', 'HR_MANAGER']) { asRole(role); expect((await cancelSo(plain)).status, role).toBe(403); }
    asRole('SALES');
    expect((await call(r.cancelSo.POST, 'POST', { reason: 'no longer needed' }, { id: 'nope' })).status).toBe(404);
    expect((await call(r.cancelSo.POST, 'POST', { reason: 'no longer needed' }, { id: String(oid()) })).status).toBe(404);
    expect(((await m.SO.findById(plain._id).lean()) as any).status).toBe('DRAFT');
    asAdmin();
  });

  it('two people cancelling the same order at once cancel it once and release its stock once', async () => {
    await m.Batch.updateOne({ product: d.tube._id }, { currentQuantity: 100, allocatedQuantity: 0 });
    const so = await mkSo('SO-C8', 3, 'APPROVED');
    const wo = await mkWo(so, { quantity: 3 });
    await d.mrn.createMrnForWorkOrder(wo, 'Admin');                       // 6 tubes
    asRole('MANAGER');
    const both = await Promise.all([cancelSo(so), cancelSo(so)]);
    expect(both.map(x => x.status).sort()).toEqual([200, 409]);
    expect((await batchOf(d.tube._id)).allocatedQuantity).toBe(0);        // not -6
    expect(await m.Audit.countDocuments({ resourceName: 'SO-C8', action: 'DELETE' })).toBe(1);
    asAdmin();
  });

  // ---------------- who can read finance and invoice data ----------------
  it('ledgers, assets and receivables are for finance viewers; invoices also for sales, supply chain and warehouse staff', async () => {
    const routes: any = {
      gl: await import('@/app/api/finance/gl/route'), assets: await import('@/app/api/finance/assets/route'), aging: await import('@/app/api/finance/ar/aging/route'),
      invoices: await import('@/app/api/finance/invoices/route'), dispatchList: await import('@/app/api/dispatch/invoices/route'), dispatchOne: await import('@/app/api/dispatch/invoices/[id]/route'),
    };
    const status = async (name: string, role: string) => {
      asRole(role);
      const one = name === 'dispatchOne';
      return (await call(routes[name].GET, 'GET', undefined, one ? { id: String(oid()) } : undefined)).status;
    };
    const financeOnly = ['gl', 'assets', 'aging'], invoiceReaders = ['invoices', 'dispatchList', 'dispatchOne'];
    const finance = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER'], sellers = ['SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF'], others = ['HR_MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_INSPECTOR'];
    for (const name of financeOnly) {
      for (const role of finance) expect(await status(name, role), name + ' ' + role).not.toBe(403);
      for (const role of [...sellers, ...others]) expect(await status(name, role), name + ' ' + role).toBe(403);
    }
    for (const name of invoiceReaders) {
      for (const role of [...finance, ...sellers]) expect(await status(name, role), name + ' ' + role).not.toBe(403);
      for (const role of others) expect(await status(name, role), name + ' ' + role).toBe(403);
    }
    asAdmin();
  });

  // ---------------- approval reserves what it can ----------------
  it('approving an order that stock only partly covers reserves what is there and records the shortfall', async () => {
    const approveLib = (await import('@/lib/salesOrderApproval')).approveSalesOrder;
    const prod = await m.Product.create({ name: 'Rim', sku: 'RIM', category: oid(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714' });
    await mkBatch(prod._id, 'B-RIM-1', 4);
    await mkBatch(prod._id, 'B-RIM-2', 3);
    const s = await m.SO.create({ soNumber: 'SO-PR-1', customer: d.cust._id, customerName: 'Buyer', status: 'DRAFT', items: [{ product: prod._id, quantity: 10, unitPrice: 5, totalPrice: 50 }], totalAmount: 50 });
    const out = await approveLib(id(s), { name: 'Admin', role: 'ADMIN' });
    expect(out.allocationWarning).toContain('3 short of Rim');
    const after: any = await m.SO.findById(s._id).lean();
    expect(after.status).toBe('APPROVED');
    expect(after.allocatedBatches.reduce((t: number, a: any) => t + a.quantity, 0)).toBe(7);           // all that existed
    expect(after.allocationShortfall).toEqual([{ product: prod._id, quantity: 3 }]);
    const batches: any[] = await m.Batch.find({ product: prod._id }).lean();
    expect(batches.map(b => b.allocatedQuantity).sort()).toEqual([3, 4]);
    // a second order finds nothing free: it is approved with everything short, and takes nothing from the first
    const s2 = await m.SO.create({ soNumber: 'SO-PR-2', customer: d.cust._id, customerName: 'Buyer', status: 'DRAFT', items: [{ product: prod._id, quantity: 2, unitPrice: 5, totalPrice: 10 }], totalAmount: 10 });
    await approveLib(id(s2), { name: 'Admin', role: 'ADMIN' });
    expect(((await m.SO.findById(s2._id).lean()) as any).allocatedBatches).toEqual([]);
    expect((await m.Batch.find({ product: prod._id }).lean() as any[]).map(b => b.allocatedQuantity).sort()).toEqual([3, 4]);
  });

  it('two approvals of the same order at the same moment reserve its stock once', async () => {
    const approveLib = (await import('@/lib/salesOrderApproval')).approveSalesOrder;
    const prod = await m.Product.create({ name: 'Seat', sku: 'SEAT', category: oid(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8714' });
    await mkBatch(prod._id, 'B-SEAT', 10);
    const s = await m.SO.create({ soNumber: 'SO-PR-3', customer: d.cust._id, customerName: 'Buyer', status: 'DRAFT', items: [{ product: prod._id, quantity: 6, unitPrice: 5, totalPrice: 30 }], totalAmount: 30 });
    const both = await Promise.allSettled([approveLib(id(s), { name: 'A', role: 'ADMIN' }), approveLib(id(s), { name: 'B', role: 'ADMIN' })]);
    expect(both.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(((await m.Batch.findOne({ product: prod._id }).lean()) as any).allocatedQuantity).toBe(6);   // not 12
    expect(((await m.SO.findById(s._id).lean()) as any).allocatedBatches.reduce((t: number, a: any) => t + a.quantity, 0)).toBe(6);
  });

  it('customer master data, challans, proformas and the company profile are not open to every role', async () => {
    const routes: any = { customers: await import('@/app/api/customers/route'), challans: await import('@/app/api/delivery-challans/route'), proforma: await import('@/app/api/proforma/route'), company: await import('@/app/api/settings/company/route') };
    const allowed: any = {
      customers: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF', 'PRODUCTION_MANAGER'], company: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF', 'PRODUCTION_MANAGER'],
      challans: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF'], proforma: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF'],
    };
    const everyone = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF', 'PRODUCTION_MANAGER', 'HR_MANAGER', 'QUALITY_INSPECTOR'];
    for (const name of Object.keys(routes)) for (const role of everyone) {
      asRole(role);
      const status = (await call(routes[name].GET, 'GET')).status;
      expect(status === 403, `${name} ${role}`).toBe(!allowed[name].includes(role));
    }
    asAdmin();
  });
});
