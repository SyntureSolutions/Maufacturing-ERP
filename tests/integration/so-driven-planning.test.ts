import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Sales-order driven planning: MRP for one order > indents > RFQ > PO tagged to the order; work orders, requisitions and the start gate
describe('sales order driven planning', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const row = (json: any, sku: string) => json.matrix.find((x: any) => x.sku === sku);
  const freeOf = async (product: any) => (await m.Batch.find({ product }).lean()).reduce((s: number, b: any) => s + b.currentQuantity - b.allocatedQuantity, 0);
  const mkBatch = (product: any, n: string, qty: number) => m.Batch.create({ product, batchNumber: n, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1' });
  const mkSo = (n: string, qty: number, status = 'APPROVED') => m.SO.create({ soNumber: n, customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.bike._id, quantity: qty, unitPrice: 100, totalPrice: qty * 100 }], totalAmount: qty * 100, status, deliveryDate: new Date() });
  const runFor = (so: any, extra: any = {}) => call(r.mrpRun.POST, 'POST', { salesOrderId: id(so), ...extra });

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', SO: 'SalesOrder', WO: 'WorkOrder', MRPRun: 'MRPRun', Customer: 'Customer', Indent: 'PurchaseIndent', RFQ: 'RFQ', PO: 'PurchaseOrder', Supplier: 'Supplier', MRN: 'MaterialRequisition', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    const load = async (p: string) => import(/* @vite-ignore */ p);
    r.mrpRun = await load('@/app/api/mrp/run/route');
    r.mrpInd = await load('@/app/api/mrp/indents/route');
    r.mrpWo = await load('@/app/api/mrp/work-orders/route');
    r.rfq = await load('@/app/api/rfqs/[id]/route');
    r.prodOne = await load('@/app/api/production/[id]/route');
    r.mrns = await load('@/app/api/mrn/route');
    r.mrnOne = await load('@/app/api/mrn/[id]/route');
    r.lineage = await load('@/app/api/lineage/route');
    d.approve = (await load('@/lib/salesOrderApproval')).approveSalesOrder;
    d.mrn = await load('@/lib/mrn');

    const cat = oid();
    const mk = (name: string, sku: string, type: string, extra: any = {}) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712', ...extra });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD');
    d.frame = await mk('Frame', 'FRAME', 'SEMI_FINISHED');
    d.gear = await mk('Gear', 'GEAR', 'RAW_MATERIAL', { minStockLevel: 5 });   // a re-order level that must NOT inflate a customer order
    d.tyre = await mk('Tyre', 'TYRE', 'RAW_MATERIAL');
    d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    const steps = [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }];
    d.bikeBom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [
      { product: d.frame._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }, { product: d.gear._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }, { product: d.tyre._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    await m.BOM.create({ product: d.frame._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    await mkBatch(d.tube._id, 'B-TUBE', 500);
    await mkBatch(d.gear._id, 'B-GEAR', 10);
    await mkBatch(d.tyre._id, 'B-TYRE', 100);
    await mkBatch(d.bike._id, 'B-BIKE', 5);
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'C-1', billingAddress: 'x' });
    d.soA = await mkSo('SO-A', 50, 'DRAFT');
    d.soE = await mkSo('SO-E', 5, 'DRAFT');                         // exactly the stock on hand, so approval can reserve it
    d.soB = await mkSo('SO-B', 20);                                 // another order that must not leak into A's plan
    await d.approve(id(d.soE), { name: 'Admin', role: 'ADMIN' });   // the 5 bikes in stock are reserved for E
    await d.approve(id(d.soA), { name: 'Admin', role: 'ADMIN' });   // 50 bikes wanted, none left to reserve for A
    d.sup1 = await m.Supplier.create({ name: 'Gears Ltd', code: 'S-1' });
    d.sup2 = await m.Supplier.create({ name: 'Gears 2', code: 'S-2' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('plans only this order: re-order levels are left out and stock reserved for another order is not available to it', async () => {
    const res = await runFor(d.soA, { preview: true });
    expect(res.status).toBe(200);
    expect(res.json.salesOrder).toBe('SO-A');
    expect(res.json.demandCount).toBe(1);                               // not SO-B
    expect(row(res.json, 'BIKE')).toMatchObject({ grossReq: 50, inStock: 0, netIndentQty: 50, orderType: 'WORK_ORDER' });   // the 5 bikes on hand are reserved for SO-E
    expect(row(res.json, 'FRAME').netIndentQty).toBe(50);
    expect(row(res.json, 'GEAR')).toMatchObject({ grossReq: 50, inStock: 10, reorderLevel: 0, netIndentQty: 40 }); // 50 - 10; the re-order level of 5 is not added
    expect(row(res.json, 'TYRE').netIndentQty).toBe(0);                 // 100 needed, 100 in stock
    expect(row(res.json, 'TUBE').netIndentQty).toBe(0);                 // 150 needed, 500 in stock
    expect(await m.MRPRun.countDocuments()).toBe(0);                    // a preview saves nothing
  });

  it('stock already reserved for this very order counts as supply for it', async () => {
    const res = await runFor(d.soE, { preview: true });
    expect(row(res.json, 'BIKE')).toMatchObject({ grossReq: 5, inStock: 5, netIndentQty: 0 });   // free stock is 0, plus the 5 reserved for SO-E itself
    expect(res.json.matrix.every((x: any) => x.netIndentQty === 0)).toBe(true);
  });

  it('a general run still works as before and still adds re-order levels', async () => {
    const res = await call(r.mrpRun.POST, 'POST', { preview: true });
    expect(row(res.json, 'GEAR').reorderLevel).toBe(5);
  });

  it('only the right roles can plan for an order; bad orders are refused', async () => {
    asRole('SALES'); expect((await runFor(d.soA)).status).toBe(403);
    asRole('VIEWER'); expect((await runFor(d.soA)).status).toBe(403);
    asRole('PRODUCTION_MANAGER');
    expect((await call(r.mrpRun.POST, 'POST', { salesOrderId: 'nope' })).status).toBe(400);
    expect((await call(r.mrpRun.POST, 'POST', { salesOrderId: String(oid()) })).status).toBe(404);
    const cancelled = await mkSo('SO-X', 1, 'CANCELLED');
    expect((await runFor(cancelled)).status).toBe(409);
    asAdmin();
  });

  it('saves the run against the order and raises indents that carry it; asking twice does not double up', async () => {
    const runA = await runFor(d.soA), runB = await runFor(d.soA);        // two runs made before anything is raised
    expect(runA.status).toBe(201);
    expect(runA.json.sourceType).toBe('SO_DRIVEN');
    expect(String(runA.json.salesOrder)).toBe(id(d.soA));
    d.runA = id(runA.json); d.runB = id(runB.json);

    const first = await call(r.mrpInd.POST, 'POST', { runId: d.runA });
    expect(first.status).toBe(200);
    expect(first.json.created).toHaveLength(1);
    const ind = first.json.created[0];
    expect(String(ind.salesOrder)).toBe(id(d.soA));
    expect(ind.items).toHaveLength(1);
    expect(ind.items[0].quantity).toBe(40);
    d.indentA = ind;

    expect((await call(r.mrpInd.POST, 'POST', { runId: d.runA })).status).toBe(409);       // same run twice
    const second = await call(r.mrpInd.POST, 'POST', { runId: d.runB });                    // another run of the same order
    expect(second.status).toBe(200);
    expect(second.json.created).toEqual([]);                                                // already asked for
    expect(await m.Indent.countDocuments({ salesOrder: d.soA._id })).toBe(1);

    const after = await runFor(d.soA, { preview: true });                                   // a later run sees the open indent
    expect(row(after.json, 'GEAR')).toMatchObject({ netIndentQty: 0, onIndent: 40 });
  });

  it('an indent raised after a run is subtracted once, not twice', async () => {
    const soD = await mkSo('SO-D', 20);
    await m.Indent.create({ number: 'IND-MANUAL', source: 'MANUAL', status: 'PENDING', salesOrder: soD._id, items: [{ product: d.gear._id, quantity: 4 }] });
    const run = await runFor(soD);
    expect(row(run.json, 'GEAR')).toMatchObject({ grossReq: 20, netIndentQty: 6, onIndent: 4 });   // 20 - 10 in stock - 4 on indent
    const made = await call(r.mrpInd.POST, 'POST', { runId: id(run.json) });
    expect(made.json.created[0].items[0].quantity).toBe(6);                                          // not 2
  });

  it('the PO awarded from an RFQ belongs to the order, unless the RFQ mixes orders', async () => {
    const award = async (indentIds: any[], supplier: any) => {
      const rfq = await m.RFQ.create({ number: `RFQ-${Math.random().toString(36).slice(2, 7)}`, indents: indentIds, items: [{ product: d.gear._id, quantity: 40 }], suppliers: [d.sup1._id, d.sup2._id], status: 'OPEN',
        quotes: [{ supplier: supplier._id, unitPrices: [{ product: d.gear._id, unitPrice: 10 }], freight: 0, gstPercent: 18 }] });
      await m.Indent.updateMany({ _id: { $in: indentIds } }, { rfq: rfq._id, status: 'RFQ_CREATED' });
      return call(r.rfq.PATCH, 'PATCH', { action: 'award', supplier: id(supplier) }, { id: id(rfq) });
    };
    const single = await award([d.indentA._id], d.sup1);
    expect(single.status).toBe(200);
    expect(String(single.json.purchaseOrder.salesOrder)).toBe(id(d.soA));
    d.poA = single.json.purchaseOrder;

    const other = await m.Indent.findOne({ number: 'IND-MANUAL' });                // raised for SO-D
    const forB = await m.Indent.create({ number: 'IND-B', source: 'MANUAL', status: 'APPROVED', salesOrder: d.soB._id, items: [{ product: d.gear._id, quantity: 1 }] });
    const mixed = await award([forB._id, other._id], d.sup2);
    expect(mixed.status).toBe(200);
    expect(mixed.json.purchaseOrder.salesOrder).toBeUndefined();
  });

  it('re-check: an awarded RFQ keeps counting until its purchase order is live, then the pipeline takes over; a cancelled order puts the need back', async () => {
    const gearNet = async () => row((await runFor(d.soA, { preview: true })).json, 'GEAR');
    expect(d.poA.status).toBe('DRAFT');
    expect(await gearNet()).toMatchObject({ netIndentQty: 0, onIndent: 40, poPipeline: 40 });  // still a draft: the open indent covers it (shown with the pipeline)
    await m.PO.updateOne({ _id: d.poA._id }, { status: 'ORDERED' });
    expect(await gearNet()).toMatchObject({ netIndentQty: 0, onIndent: 0, poPipeline: 40 });   // live: the real order covers it, the indent is not counted twice
    await m.PO.updateOne({ _id: d.poA._id }, { status: 'CANCELLED' });
    expect(await gearNet()).toMatchObject({ netIndentQty: 40, onIndent: 0, poPipeline: 0 });   // cancelled: the need is back
    await m.PO.updateOne({ _id: d.poA._id }, { status: 'DRAFT' });                            // restore for the later tests
  });

  it('order-driven work orders are make-to-order for that order, sub-assemblies included, with requisitions already raised', async () => {
    const run = await runFor(d.soA);                                      // indents exist, but work orders do not
    asRole('PRODUCTION_MANAGER');
    const res = await call(r.mrpWo.POST, 'POST', { runId: id(run.json) });
    expect(res.status).toBe(200);
    expect(res.json.created).toHaveLength(2);
    const bike = res.json.created.find((c: any) => c.itemType === 'FG'), frame = res.json.created.find((c: any) => c.itemType === 'SFG');
    const bikeWo: any = await m.WO.findById(bike._id).lean(), frameWo: any = await m.WO.findById(frame._id).lean();
    for (const wo of [bikeWo, frameWo]) {
      expect(wo.demandType).toBe('MTO');
      expect(String(wo.salesOrder)).toBe(id(d.soA));
      expect(wo.salesOrderRef).toBe('SO-A');
    }
    expect(frame.parentWorkOrder).toBe(bike.woNumber);
    expect(bike.mrn.shortfall).toBe(true);                                // needs 50 frames and 50 gears; no frames made, 10 gears in stock
    expect(frame.mrn.shortfall).toBe(false);                              // 150 tubes, plenty in stock
    d.bikeWo = bikeWo; d.frameWo = frameWo;
    const bikeMrn: any = await m.MRN.findOne({ workOrder: bikeWo._id }).lean();
    const gear = bikeMrn.items.find((i: any) => String(i.product) === id(d.gear));
    expect(gear).toMatchObject({ requiredQty: 50, reservedQty: 10 });
    asAdmin();
  });

  it('work for an order cannot start while its material is short; topping up the reservation clears it', async () => {
    asRole('PRODUCTION_MANAGER');
    const start = (wo: any, body: any = {}) => call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS', ...body }, { id: id(wo) });
    const short = await start(d.bikeWo);
    expect(short.status).toBe(409);
    expect(short.json.error).toContain('Material is short');
    expect((await call(r.prodOne.GET, 'GET', undefined, { id: id(d.bikeWo) })).json.readiness.status).toBe('SHORTFALL');
    expect((await call(r.prodOne.GET, 'GET', undefined, { id: id(d.frameWo) })).json.readiness.status).toBe('READY');
    expect((await start(d.frameWo)).status).toBe(200);                    // the sub-assembly has everything

    // the missing parts arrive: 40 gears and the 50 frames the sub-assembly made
    await mkBatch(d.gear._id, 'B-GEAR-2', 40);
    await mkBatch(d.frame._id, 'B-FRAME', 50);
    const mrn: any = await m.MRN.findOne({ workOrder: d.bikeWo._id });
    asRole('SALES');
    expect((await call(r.mrnOne.PATCH, 'PATCH', { action: 'reserve' }, { id: id(mrn) })).status).toBe(403);
    asRole('PRODUCTION_MANAGER');
    const topped = await call(r.mrnOne.PATCH, 'PATCH', { action: 'reserve' }, { id: id(mrn) });
    expect(topped.status).toBe(200);
    expect(topped.json.shortfall).toBe(false);
    expect(topped.json.items.every((i: any) => i.reservedQty === i.requiredQty)).toBe(true);
    expect((await call(r.prodOne.GET, 'GET', undefined, { id: id(d.bikeWo) })).json.readiness.status).toBe('READY');
    expect((await start(d.bikeWo)).status).toBe(200);
    asAdmin();
  });

  it('a Manager can start with material short, but only with a written reason, and it is audited', async () => {
    const wo = await m.WO.create({ woNumber: 'WO-SHORT', bom: d.bikeBom._id, product: d.bike._id, quantity: 100, demandType: 'MTO', salesOrder: d.soB._id, salesOrderRef: 'SO-B', status: 'PLANNED' });
    await d.mrn.createMrnForWorkOrder(wo, 'Admin');                       // 100 frames, 100 gears: not there
    const start = (body: any) => call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS', ...body }, { id: id(wo) });
    asRole('PRODUCTION_MANAGER');
    expect((await start({ overrideMaterial: true, overrideReason: 'urgent customer order please' })).status).toBe(409);   // not allowed to override
    asRole('MANAGER');
    expect((await start({})).status).toBe(409);
    expect((await start({ overrideMaterial: true, overrideReason: 'short' })).status).toBe(409);
    expect((await start({ overrideMaterial: true, overrideReason: 'customer accepted a late finish' })).status).toBe(200);
    expect(await m.Audit.countDocuments({ resourceName: 'Work Order WO-SHORT', action: 'OVERRIDE' })).toBe(1);
    asAdmin();
  });

  it('requisitions: roles are enforced and two people reserving at once cannot take the same stock', async () => {
    for (const role of ['VIEWER', 'SALES', 'HR_MANAGER']) { asRole(role); expect((await call(r.mrns.POST, 'POST', { workOrderId: id(d.frameWo) })).status, role).toBe(403); }
    asAdmin();
    const scarce = await m.Product.create({ name: 'Scarce', sku: 'SCARCE', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '1' });
    await mkBatch(scarce._id, 'B-SCARCE', 10);
    const results = await Promise.all([d.mrn.reserveStock(scarce._id, 10), d.mrn.reserveStock(scarce._id, 10), d.mrn.reserveStock(scarce._id, 10)]);
    expect(results.reduce((a: number, b: number) => a + b, 0)).toBe(10);
    expect(await freeOf(scarce._id)).toBe(0);
  });

  it('the order, its indents, RFQ, purchase order, work orders and requisitions are all one connected chain', async () => {
    const res = await call(r.lineage.GET, 'GET', undefined, undefined, '?type=SALES_ORDER&id=SO-A');
    const nums = res.json.nodes.map((n: any) => n.number);
    expect(nums).toContain(d.indentA.number);
    expect(nums).toContain(d.poA.poNumber);
    expect(nums).toContain(d.bikeWo.woNumber);
    expect(nums).toContain(d.frameWo.woNumber);
    const fromPo = await call(r.lineage.GET, 'GET', undefined, undefined, `?type=PURCHASE_ORDER&id=${d.poA.poNumber}`);
    expect(fromPo.json.nodes.map((n: any) => n.number)).toContain('SO-A');
  });
  it('re-check: two plans made before any work orders exist cannot both build them', async () => {
    const soF = await mkSo('SO-F', 2);
    const runX = await runFor(soF), runY = await runFor(soF);
    asRole('PRODUCTION_MANAGER');
    const first = await call(r.mrpWo.POST, 'POST', { runId: id(runX.json) });
    expect(first.status).toBe(200);
    expect(first.json.created).toHaveLength(2);
    const second = await call(r.mrpWo.POST, 'POST', { runId: id(runY.json) });
    expect(second.status).toBe(409);
    expect(second.json.error).toContain('already created');
    expect(await m.WO.countDocuments({ salesOrder: soF._id })).toBe(2);                         // not 4
    const retry = await call(r.mrpWo.POST, 'POST', { runId: id(runY.json) });                  // the refused run was released, not burned
    expect(retry.status).toBe(409);
    const fresh = await runFor(soF);                                                           // a new plan sees the existing orders and needs nothing more
    expect(row(fresh.json, 'BIKE').netIndentQty).toBe(0);
    // work orders built for SO-F are not available to SO-A: its plan counts only its own 50
    expect(row((await runFor(d.soA, { preview: true })).json, 'BIKE')).toMatchObject({ openWorkOrders: 50, netIndentQty: 0 });
    // ...but a general (not order-specific) run counts every open work order
    expect(row((await call(r.mrpRun.POST, 'POST', { preview: true })).json, 'BIKE').openWorkOrders).toBe(152);   // A's 50, F's 2 and the 100 of WO-SHORT
    asAdmin();
  });

});
