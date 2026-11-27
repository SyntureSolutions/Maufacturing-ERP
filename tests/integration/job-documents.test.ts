import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Job card for the shop floor, and the job-work documents: purchase order to the job worker, received challans, sales order from a customer's order
describe('job card and job work documents', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const mkOutward = (extra: any = {}) => m.Job.create({ kind: 'OUTWARD', number: `OJW-T-${Math.random().toString(36).slice(2, 6)}`, party: d.sup._id, partyName: 'Plating Works', outputProduct: d.bike._id, expectedOutputQty: 10, items: [{ product: d.tube._id, description: 'Tube', quantity: 10, uom: 'pcs', value: 100 }], ...extra });
  const mkInward = (extra: any = {}) => m.Job.create({ kind: 'INWARD', number: `IJW-T-${Math.random().toString(36).slice(2, 6)}`, party: d.cust._id, partyName: 'Pune Wheels', serviceRate: 50, natureOfJob: 'Powder coating', items: [{ description: 'Frames', quantity: 20, uom: 'pcs' }, { description: 'Forks', quantity: 10, uom: 'pcs' }], ...extra });
  const po = (job: any, body: any = { processingCharge: 25 }, role = 'PRODUCTION_MANAGER') => { asRole(role); return call(r.po.POST, 'POST', body, { id: id(job) }); };
  const toSo = (job: any, body: any = { customerPoNumber: 'CUST-JW-1' }, role = 'SALES') => { asRole(role); return call(r.so.POST, 'POST', body, { id: id(job) }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', WO: 'WorkOrder', MRN: 'MaterialRequisition', SO: 'SalesOrder', Job: 'JobWorkOrder', Supplier: 'Supplier', Customer: 'Customer', Batch: 'Batch', Audit: 'AuditLog', Category: 'Category' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.jobcard = await import('@/app/api/production/[id]/jobcard/route');
    r.po = await import('@/app/api/jobwork/[id]/po/route');
    r.so = await import('@/app/api/jobwork/[id]/sales-order/route');
    r.jobOne = await import('@/app/api/jobwork/[id]/route');
    const cat = oid();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712', gstRate: 18 });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD'); d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL'); d.tyre = await mk('Tyre', 'TYRE', 'RAW_MATERIAL');
    d.bom = await m.BOM.create({ product: d.bike._id, version: '2', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 5 }, { product: d.tyre._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Weld frame', estimatedTimeMinutes: 20 }, { stepNumber: 2, description: 'Paint', estimatedTimeMinutes: 30 }] });
    d.sup = await m.Supplier.create({ name: 'Plating Works', code: 'S-PL' });
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-2', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('the job card gathers the product, the material to draw (with wastage), the routing, requisition status and the order', async () => {
    const so = await m.SO.create({ soNumber: 'SO-JC-1', customerName: 'Pune Wheels', status: 'APPROVED', deliveryDate: new Date('2030-01-10'), items: [{ product: d.bike._id, quantity: 4, unitPrice: 1, totalPrice: 4 }], totalAmount: 4 });
    const wo = await m.WO.create({ woNumber: 'WO-JC-1', bom: d.bom._id, product: d.bike._id, quantity: 10, demandType: 'MTO', salesOrder: so._id, salesOrderRef: 'SO-JC-1', status: 'PLANNED', priority: 'HIGH', stages: [{ seq: 1, name: 'Cut', inQty: 10 }, { seq: 2, name: 'Weld', inQty: 0 }] });
    await m.MRN.create({ number: 'MRN-JC-1', workOrder: wo._id, status: 'RESERVED', shortfall: true, items: [{ product: d.tube._id, requiredQty: 21, reservedQty: 15, issuedQty: 0 }] });
    asRole('PRODUCTION_MANAGER');
    const res = await call(r.jobcard.GET, 'GET', undefined, { id: id(wo) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ woNumber: 'WO-JC-1', barcode: 'WO-JC-1', quantity: 10, priority: 'HIGH', demandType: 'MTO', bomVersion: '2' });
    expect(res.json.product).toMatchObject({ name: 'Bike', sku: 'BIKE' });
    expect(res.json.salesOrder).toMatchObject({ soNumber: 'SO-JC-1', customerName: 'Pune Wheels' });
    const tube = res.json.materials.find((x: any) => x.sku === 'TUBE'), tyre = res.json.materials.find((x: any) => x.sku === 'TYRE');
    expect(tube).toMatchObject({ required: 21, reserved: 15, issued: 0, wastagePercentage: 5 });   // 2 x 10 x 1.05
    expect(tyre).toMatchObject({ required: 20, reserved: null });                                   // not on the requisition
    expect(res.json.requisition).toMatchObject({ number: 'MRN-JC-1', shortfall: true });
    expect(res.json.stages.map((s: any) => s.name)).toEqual(['Cut', 'Weld']);
    expect(res.json.routingSteps.map((s: any) => s.description)).toEqual(['Weld frame', 'Paint']);
    for (const role of ['SALES', 'FINANCE_MANAGER', 'HR_MANAGER', 'SUPPLY_CHAIN_MANAGER']) { asRole(role); expect((await call(r.jobcard.GET, 'GET', undefined, { id: id(wo) })).status, role).toBe(403); }
    asAdmin();
    expect((await call(r.jobcard.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
    expect((await call(r.jobcard.GET, 'GET', undefined, { id: String(oid()) })).status).toBe(404);
    const bare = await m.WO.create({ woNumber: 'WO-JC-2', bom: d.bom._id, product: d.bike._id, quantity: 1, demandType: 'MTS', status: 'PLANNED' });   // no order, no requisition
    const plain = await call(r.jobcard.GET, 'GET', undefined, { id: id(bare) });
    expect(plain.json).toMatchObject({ salesOrder: null, requisition: null });
  });

  it('a purchase order to the job worker is issued once with the charge and terms, then returned as is', async () => {
    const job = await mkOutward();
    for (const body of [{}, { processingCharge: 0 }, { processingCharge: -1 }, { processingCharge: 'x' }, { processingCharge: 10, gstRate: 99 }]) expect((await po(job, body as any)).status, JSON.stringify(body)).toBe(400);
    for (const role of ['SALES', 'STAFF', 'FINANCE_MANAGER', 'VIEWER']) expect((await po(job, { processingCharge: 25 }, role)).status, role).toBe(403);
    const first = await po(job, { processingCharge: 25, gstRate: 18, terms: 'Return within 60 days' });
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    expect(first.json).toMatchObject({ processingCharge: 25, poGstRate: 18, poTerms: 'Return within 60 days' });
    expect(first.json.poNumber).toMatch(/^JWPO-\d{4}-\d{4}$/);
    const again = await po(job, { processingCharge: 99 });
    expect(again.status).toBe(200);
    expect(again.json.poNumber).toBe(first.json.poNumber);
    expect(again.json.processingCharge).toBe(25);                           // not overwritten
    expect(await m.Audit.countDocuments({ resourceName: first.json.poNumber, action: 'CREATE' })).toBe(1);
    const inward = await mkInward();
    expect((await po(inward)).status).toBe(400);                           // only outward jobs
    expect((await call(r.po.POST, 'POST', { processingCharge: 5 }, { id: 'nope' })).status).toBe(404);
  });

  it('issuing the purchase order from two screens at once gives one number; different jobs get different numbers', async () => {
    const job = await mkOutward();
    const both = await Promise.all([po(job), po(job)]);
    expect(both.every(x => [200, 201, 409].includes(x.status))).toBe(true);
    expect(both.filter(x => x.status === 201).length).toBe(1);
    const stored: any = await m.Job.findById(job._id).lean();
    expect(stored.poNumber).toBeTruthy();
    const other = await mkOutward();
    const second = await po(other);
    expect(second.json.poNumber).not.toBe(stored.poNumber);
    const many = await Promise.all(Array.from({ length: 5 }, async () => po(await mkOutward())));
    expect(new Set(many.map(x => x.json.poNumber)).size).toBe(5);
  });

  it('every receipt back from the job worker carries its own received-challan number', async () => {
    const job = await mkOutward({ items: [{ product: d.tube._id, description: 'Tube', quantity: 10, uom: 'pcs', value: 100 }], outputProduct: undefined });
    asRole('PRODUCTION_MANAGER');
    const r1 = await call(r.jobOne.PATCH, 'PATCH', { action: 'receive', items: [{ index: 0, consumed: 4, returned: 0, scrap: 0 }] }, { id: id(job) });
    expect(r1.status, JSON.stringify(r1.json)).toBe(200);
    const r2 = await call(r.jobOne.PATCH, 'PATCH', { action: 'receive', items: [{ index: 0, consumed: 6, returned: 0, scrap: 0 }] }, { id: id(job) });
    expect(r2.json.receipts.map((x: any) => x.challanNo)).toEqual([`${job.number}-R1`, `${job.number}-R2`]);
    expect(r2.json.status).toBe('CLOSED');
    asAdmin();
  });

  it('a customer\'s job-work order becomes a sales order for the service, once, with the customer\'s PO on it', async () => {
    const job = await mkInward();                                          // 30 units at 50
    for (const body of [{}, { customerPoNumber: '  ' }]) expect((await toSo(job, body as any)).status).toBe(400);
    for (const role of ['STAFF', 'FINANCE_MANAGER', 'VIEWER', 'HR_MANAGER']) expect((await toSo(job, { customerPoNumber: 'X' }, role)).status, role).toBe(403);
    const outward = await mkOutward();
    expect((await toSo(outward)).status).toBe(400);                        // only inward jobs
    const res = await toSo(job);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const so = res.json.salesOrder;
    expect(so.soNumber).toMatch(/^SO-\d{4}-\d{4}$/);
    expect(so).toMatchObject({ poNumber: 'CUST-JW-1', status: 'DRAFT', totalAmount: 1500, customerName: 'Pune Wheels' });
    expect(so.items[0]).toMatchObject({ quantity: 30, unitPrice: 50, totalPrice: 1500 });
    expect(so.terms).toContain(job.number);
    expect(res.json.job).toMatchObject({ customerPoNumber: 'CUST-JW-1' });
    expect(String(res.json.job.salesOrder)).toBe(String(so._id));
    expect((await toSo(job)).status).toBe(409);                            // once per job
    expect(await m.SO.countDocuments({ poNumber: 'CUST-JW-1' })).toBe(1);
    const svc = await m.Product.findOne({ sku: 'JOBWORK-SVC' }).lean();
    expect(svc).toBeTruthy();
    // a second job reuses the same service product instead of creating another
    await toSo(await mkInward(), { customerPoNumber: 'CUST-JW-2' });
    expect(await m.Product.countDocuments({ sku: 'JOBWORK-SVC' })).toBe(1);
    expect(await m.Category.countDocuments({ slug: 'services' })).toBe(1);
  });

  it('two people preparing the sales order for the same job at once get one order', async () => {
    const job = await mkInward();
    const both = await Promise.all([toSo(job, { customerPoNumber: 'RACE-1' }), toSo(job, { customerPoNumber: 'RACE-1' })]);
    expect(both.map(x => x.status).sort()).toEqual([201, 409]);
    expect(await m.SO.countDocuments({ poNumber: 'RACE-1' })).toBe(1);
  });
});
