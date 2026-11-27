import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, pickAll } from './harness';

// Cost flow: material issued -> work in progress -> finished goods -> cost of goods sold at dispatch
describe('costing and cost of goods sold', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const bal = async (code: string) => Math.round(((await m.Account.findOne({ code }))?.balance ?? 0) * 100) / 100;
  const mkBatch = (product: any, n: string, qty: number, cost: number) => m.Batch.create({ product, batchNumber: n, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: cost, qualityStatus: 'APPROVED', store: 'W1' });
  const mkWo = (product: any, bom: any, qty: number, extra: any = {}) => m.WO.create({ woNumber: `WO-C-${Math.random().toString(36).slice(2, 7)}`, bom: bom._id, product: product._id, quantity: qty, demandType: 'MTS', status: 'IN_PROGRESS', fgReceivedQty: qty, ...extra });
  const issue = async (wo: any, skus: string[]) => {
    asRole('PRODUCTION_MANAGER');
    const mrn = await call(r.mrns.POST, 'POST', { workOrderId: id(wo) });
    expect(mrn.status, JSON.stringify(mrn.json)).toBe(201);
    const res = await call(r.mrnOne.PATCH, 'PATCH', { action: 'issue', scans: skus }, { id: id(mrn.json) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    asAdmin();
    return res.json;
  };
  const signOff = async (wo: any, approved: number, scrap = 0) => {
    asRole('QUALITY_INSPECTOR');
    const res = await call(r.fgqc.POST, 'POST', { approvedQty: approved, scrapQty: scrap, signature: 'QI', reason: scrap ? 'dented' : undefined }, { id: id(wo) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    asAdmin();
    return res.json;
  };
  const challan = async (so: any, lines?: any) => { await pickAll(id(so), true); asRole('SUPPLY_CHAIN_MANAGER'); return call(r.dc.POST, 'POST', { salesOrderId: id(so), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: `LR-${Math.random().toString(36).slice(2, 6)}`, ...(lines ? { lines } : {}) }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', SO: 'SalesOrder', WO: 'WorkOrder', Customer: 'Customer', MRN: 'MaterialRequisition', Account: 'Account', Journal: 'JournalEntry', DC: 'DeliveryChallan', Company: 'CompanySettings', Lock: 'PeriodLock', User: 'User' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.mrns = await import('@/app/api/mrn/route');
    r.mrnOne = await import('@/app/api/mrn/[id]/route');
    r.fgqc = await import('@/app/api/production/[id]/fg-qc/route');
    r.dc = await import('@/app/api/delivery-challans/route');
    r.cancel = await import('@/app/api/delivery-challans/[id]/cancel/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    d.approve = (await import('@/lib/salesOrderApproval')).approveSalesOrder;

    const cat = oid();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712', gstRate: 18 });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD'); d.frame = await mk('Frame', 'FRAME', 'SEMI_FINISHED'); d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    const steps = [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }];
    d.bikeBom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [{ product: d.frame._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }, { product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    d.frameBom = await m.BOM.create({ product: d.frame._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    await mkBatch(d.tube._id, 'B-TUBE', 500, 10);                        // tubes cost 10 each
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-2', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'a@test.com', password: 'secret123', role: 'ADMIN' });
    // the raw material was bought earlier: 500 tubes at 10 in the inventory ledger
    d.postJournal = (await import('@/lib/accounting')).postJournal;
    await d.postJournal({ description: 'opening', lines: [{ acc: (await import('@/lib/accounting')).ACC.INV_RM, debit: 5000 }, { acc: (await import('@/lib/accounting')).ACC.AP, credit: 5000 }] });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('sub-assembly: material issued moves to work in progress; its cost stays there until the parent is finished', async () => {
    const frameWo = await mkWo(d.frame, d.frameBom, 3);                  // 3 frames x 3 tubes = 9 tubes x 10
    await issue(frameWo, ['TUBE']);
    expect(await bal('1035')).toBe(90);                                  // work in progress
    expect(await bal('1030')).toBe(4910);                                // raw material inventory fell by the same
    expect(((await m.WO.findById(frameWo._id).lean()) as any).materialCost).toBe(90);

    const res = await signOff(frameWo, 3);                               // 3 frames approved at 30 each
    expect(res.batch.purchasePrice).toBe(30);
    expect(await bal('1035')).toBe(90);                                  // nothing posted: a sub-assembly's cost stays in work in progress
    expect(await bal('1040')).toBe(0);
    d.frameWo = frameWo;
  });

  it('finished goods: the parent issue adds its own material, sign-off moves all the cost to finished goods; rejects are scrap loss', async () => {
    const bikeWo = await mkWo(d.bike, d.bikeBom, 3);                     // 3 frames (made above) and 6 tubes
    const mrn = await issue(bikeWo, ['FRAME', 'TUBE']);
    expect(mrn.status).toBe('ISSUED');
    const wo: any = await m.WO.findById(bikeWo._id).lean();
    expect(wo.materialCost).toBe(150);                                   // 3 frames x 30 + 6 tubes x 10
    expect(await bal('1035')).toBe(150);                                 // 90 (frames) + 60 (the tubes just issued); the frames moved on without an entry
    const res = await signOff(bikeWo, 2, 1);                             // 2 good, 1 rejected: 150 / 3 = 50 each
    expect(res.batch.purchasePrice).toBe(50);
    expect(await bal('1040')).toBe(100);                                 // finished goods inventory
    expect(await bal('5050')).toBe(50);                                  // scrap loss
    expect(await bal('1035')).toBe(0);                                   // everything left work in progress
    d.bikeWo = bikeWo;
  });

  it('dispatch books cost of goods sold at the batch cost and reduces finished goods inventory; the books and stock agree', async () => {
    const so = await m.SO.create({ soNumber: 'SO-CG-1', customer: d.cust._id, customerName: 'Pune Wheels', status: 'DRAFT', items: [{ product: d.bike._id, quantity: 2, unitPrice: 200, totalPrice: 400 }], totalAmount: 400 });
    await d.approve(id(so), { name: 'Admin', role: 'ADMIN' });          // reserves the 2 finished bikes
    const cogs0 = await bal('5010'), fg0 = await bal('1040');
    const res = await challan(so, [{ product: id(d.bike), quantity: 2 }]);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.cogsValue).toBe(100);                                // 2 x 50
    expect(await bal('5010')).toBe(cogs0 + 100);
    expect(await bal('1040')).toBe(0);                                   // all finished goods have shipped
    const entry: any = await m.Journal.findById(res.json.cogsJournal).lean();
    expect(entry.totalDebit).toBe(100);
    expect(entry.totalDebit).toBe(entry.totalCredit);
    d.so = so; d.dc = res.json; d.fgBefore = fg0;
  });

  it('cancelling the challan reverses the cost with an opposite entry and puts the stock back', async () => {
    asRole('SALES');
    const res = await call(r.cancel.POST, 'POST', { reason: 'wrong vehicle loaded' }, { id: id(d.dc) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(await bal('5010')).toBe(0);
    expect(await bal('1040')).toBe(d.fgBefore);
    expect(await m.Journal.countDocuments({ referenceType: 'COGS' })).toBe(1);             // the original is kept...
    expect(await m.Journal.countDocuments({ referenceType: 'COGS_REVERSAL' })).toBe(1);     // ...and offset by a reversal
    asAdmin();
  });

  it('a locked accounting period refuses the dispatch and leaves stock, books and order untouched', async () => {
    const batchBefore = (await m.Batch.findOne({ product: d.bike._id }).lean()) as any;
    asAdmin();
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })).status).toBe(200);
    const res = await challan(d.so, [{ product: id(d.bike), quantity: 1 }]);
    expect(res.status).not.toBe(201);
    asAdmin();
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password: 'secret123' })).status).toBe(200);
    const after = (await m.Batch.findOne({ product: d.bike._id }).lean()) as any;
    expect(after.currentQuantity).toBe(batchBefore.currentQuantity);
    expect(after.allocatedQuantity).toBe(batchBefore.allocatedQuantity);
    expect(await bal('5010')).toBe(0);
    expect(((await m.SO.findById(d.so._id).lean()) as any).items[0].dispatchedQty).toBe(0);
  });

  it('goods with no recorded cost post no entry (nothing to book), and a material issue refused by a locked period is undone', async () => {
    const free = await m.Product.create({ name: 'Gift', sku: 'GIFT', category: oid(), uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18 });
    await mkBatch(free._id, 'B-GIFT', 5, 0);
    const so = await m.SO.create({ soNumber: 'SO-CG-2', customer: d.cust._id, customerName: 'Pune Wheels', status: 'APPROVED', items: [{ product: free._id, quantity: 2, unitPrice: 10, totalPrice: 20 }], totalAmount: 20 });
    const res = await challan(so);
    expect(res.status).toBe(201);
    expect(res.json.cogsValue).toBe(0);
    expect(res.json.cogsJournal).toBeUndefined();
    expect(((await m.Batch.findOne({ product: free._id }).lean()) as any).currentQuantity).toBe(3);   // stock still moved

    const wo = await mkWo(d.frame, d.frameBom, 1);
    asRole('PRODUCTION_MANAGER');
    const mrn = await call(r.mrns.POST, 'POST', { workOrderId: id(wo) });
    const tubesBefore = ((await m.Batch.findOne({ product: d.tube._id }).lean()) as any).currentQuantity;
    asAdmin();
    await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    asRole('PRODUCTION_MANAGER');
    const refused = await call(r.mrnOne.PATCH, 'PATCH', { action: 'issue', scans: ['TUBE'] }, { id: id(mrn.json) });
    expect(refused.status).not.toBe(200);
    asAdmin();
    await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password: 'secret123' });
    expect(((await m.Batch.findOne({ product: d.tube._id }).lean()) as any).currentQuantity).toBe(tubesBefore);   // nothing was taken
    expect(((await m.MRN.findById(mrn.json._id).lean()) as any).status).toBe('RESERVED');
  });
});
