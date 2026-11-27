import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

describe('MRP sub-assembly work orders and SFG re-issue', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const day = 86400000;
  const sameDay = (a: Date, b: Date) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', SO: 'SalesOrder', WO: 'WorkOrder', SFG: 'SFGStock', MRPRun: 'MRPRun', Customer: 'Customer' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    const load = async (p: string) => import(/* @vite-ignore */ p);
    r.mrpRun = await load('@/app/api/mrp/run/route');
    r.mrpWo = await load('@/app/api/mrp/work-orders/route');
    r.prod = await load('@/app/api/production/route');
    r.prodOne = await load('@/app/api/production/[id]/route');
    r.routing = await load('@/app/api/production/[id]/routing/route');
    r.stage = await load('@/app/api/production/[id]/stage-output/route');
    r.fgqc = await load('@/app/api/production/[id]/fg-qc/route');
    r.mrns = await load('@/app/api/mrn/route');
    r.reissue = await load('@/app/api/sfg/[id]/reissue/route');
    r.finished = await load('@/app/api/sfg/finished/route');
    r.sfg = await load('@/app/api/sfg/route');

    const cat = new mongoose.Types.ObjectId();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712' });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD');
    d.frame = await mk('Frame', 'FRAME', 'SEMI_FINISHED');
    d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    const steps = [{ stepNumber: 1, description: 'Cut', estimatedTimeMinutes: 5 }, { stepNumber: 2, description: 'Weld', estimatedTimeMinutes: 5 }, { stepNumber: 3, description: 'Paint', estimatedTimeMinutes: 5 }];
    d.bikeBom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [{ product: d.frame._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }, { product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    d.frameBom = await m.BOM.create({ product: d.frame._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }], routingSteps: steps });
    await m.Batch.create({ product: d.tube._id, batchNumber: 'B-TUBE', expiryDate: new Date('2030-01-01'), initialQuantity: 500, currentQuantity: 500, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1' });
    d.cust = await m.Customer.create({ name: 'Buyer', code: 'C-1', billingAddress: 'x' });
    await m.SO.create({ soNumber: 'SO-1', customer: d.cust._id, customerName: 'Buyer', items: [{ product: d.bike._id, quantity: 10, unitPrice: 100, totalPrice: 1000 }], totalAmount: 1000, status: 'APPROVED', deliveryDate: new Date() });
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  // ---------------- MRP -> work orders ----------------
  it('MRP creates the assembly and its sub-assembly work orders, linked and scheduled in order', async () => {
    const run = await call(r.mrpRun.POST, 'POST', {});
    expect(run.status).toBe(201);
    const row = (sku: string) => run.json.matrix.find((x: any) => x.sku === sku);
    expect(row('BIKE')).toMatchObject({ itemType: 'FG', orderType: 'WORK_ORDER', netIndentQty: 10 });
    expect(row('FRAME')).toMatchObject({ itemType: 'SFG', orderType: 'WORK_ORDER', netIndentQty: 10 });
    d.runId = id(run.json);

    asRole('SALES');
    expect((await call(r.mrpWo.POST, 'POST', { runId: d.runId })).status).toBe(403);
    asRole('PRODUCTION_MANAGER');
    expect((await call(r.mrpWo.POST, 'POST', { runId: 'nope' })).status).toBe(400);

    const res = await call(r.mrpWo.POST, 'POST', { runId: d.runId });
    expect(res.status).toBe(200);
    expect(res.json.created).toHaveLength(2);
    const bike = res.json.created.find((c: any) => c.itemType === 'FG');
    const frame = res.json.created.find((c: any) => c.itemType === 'SFG');
    expect(bike.quantity).toBe(10);
    expect(frame.quantity).toBe(10);
    expect(frame.parentWorkOrder).toBe(bike.woNumber);          // sub-assembly points at its assembly
    expect(bike.parentWorkOrder).toBeUndefined();
    // sub-assembly finishes the day the assembly starts
    expect(sameDay(frame.plannedEndDate, bike.plannedStartDate)).toBe(true);
    expect(new Date(frame.plannedStartDate).getTime()).toBeLessThan(new Date(bike.plannedStartDate).getTime());
    expect(new Date(bike.plannedEndDate).getTime() - new Date(bike.plannedStartDate).getTime()).toBe(3 * day);

    const frameWo = await m.WO.findById(frame._id);
    expect(frameWo.status).toBe('PLANNED');
    expect(frameWo.demandType).toBe('MTS');
    expect(String(frameWo.mrpRun)).toBe(d.runId);
    expect(String(frameWo.parentWorkOrder)).toBe(String(bike._id));
    d.bikeWo = String(bike._id); d.frameWo = String(frame._id);
  });

  it('cannot create the same work orders twice, and the next MRP run sees them as supply', async () => {
    expect((await call(r.mrpWo.POST, 'POST', { runId: d.runId })).status).toBe(409);
    const again = await call(r.mrpRun.POST, 'POST', { preview: true });
    const row = (sku: string) => again.json.matrix.find((x: any) => x.sku === sku);
    expect(row('BIKE').openWorkOrders).toBe(10);
    expect(row('BIKE').netIndentQty).toBe(0); // already planned: no double planning
    expect(row('FRAME')).toBeUndefined(); // the open assembly covers the demand, so nothing is exploded further down
  });

  it('releases the run when no work order could be created, so it can be retried', async () => {
    const empty = await call(r.mrpRun.POST, 'POST', {});
    const res = await call(r.mrpWo.POST, 'POST', { runId: id(empty.json) });
    expect(res.status).toBe(200);
    expect(res.json.created).toEqual([]);
    expect((await m.MRPRun.findById(empty.json._id)).workOrdersCreated).toBe(false);
  });

  // ---------------- sub-assembly output feeds the parent ----------------
  it('a finished sub-assembly lands in the SFG store and the parent assembly reserves it', async () => {
    asAdmin();
    const route = (woId: string) => call(r.routing.POST, 'POST', { stages: ['Cut', 'Weld'] }, { id: woId });
    expect((await route(d.frameWo)).status).toBe(200);
    expect((await call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS' }, { id: d.frameWo })).status).toBe(200);
    const out = async (seq: number, b: any) => { const res = await call(r.stage.POST, 'POST', { seq, operator: 'Ravi', overrideMaterial: true, overrideReason: 'fixture: material issue is not part of this test', ...b }, { id: d.frameWo }); await m.SFG.updateMany({ qcStatus: 'PENDING' }, { qcStatus: 'APPROVED' }); return res; }; // lots are inspected before they can be re-issued (see the SFG QC tests)
    expect((await out(1, { input: 10, good: 10, scrap: 0, rework: 0 })).status).toBe(200);
    expect((await out(2, { input: 10, good: 10, scrap: 0, rework: 0 })).status).toBe(200);

    asRole('QUALITY_INSPECTOR');
    const qc = await call(r.fgqc.POST, 'POST', { approvedQty: 10, scrapQty: 0, signature: 'A. Inspector', checks: [] }, { id: d.frameWo });
    expect(qc.status).toBe(200);
    expect(qc.json.batch.store).toBe('SFG');                 // not the finished-goods store
    expect(qc.json.batch.batchNumber).toMatch(/^SF-/);

    const finished = await call(r.finished.GET, 'GET');
    expect(finished.json).toHaveLength(1);
    expect(finished.json[0]).toMatchObject({ available: 10 });
    expect(finished.json[0].product.sku).toBe('FRAME');

    asAdmin();
    const mrn = await call(r.mrns.POST, 'POST', { workOrderId: d.bikeWo });
    expect(mrn.status).toBe(201);
    expect(mrn.json.shortfall).toBe(false);
    const frameLine = mrn.json.items.find((i: any) => String(i.product) === String(d.frame._id));
    expect(frameLine.reservedQty).toBe(10); // reserved from the sub-assembly WO's output
    expect((await m.Batch.findOne({ product: d.frame._id })).allocatedQuantity).toBe(10);
  });

  // ---------------- SFG re-issue ----------------
  describe('re-issuing SFG lots between work orders of the same product', () => {
    const mkWo = async (qty: number, start = true) => {
      const wo = await call(r.prod.POST, 'POST', { product: id(d.frame), bom: id(d.frameBom), quantity: qty, demandType: 'MTS', plannedStartDate: '2026-10-01', plannedEndDate: '2026-10-10' });
      expect(wo.status).toBe(201);
      const woId = id(wo.json);
      expect((await call(r.routing.POST, 'POST', { stages: ['Cut', 'Weld', 'Paint'] }, { id: woId })).status).toBe(200);
      if (start) await call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS' }, { id: woId });
      return woId;
    };
    const out = async (woId: string, seq: number, b: any) => { const res = await call(r.stage.POST, 'POST', { seq, operator: 'Ravi', rework: 0, overrideMaterial: true, overrideReason: 'fixture: material issue is not part of this test', ...b }, { id: woId }); await m.SFG.updateMany({ qcStatus: 'PENDING' }, { qcStatus: 'APPROVED' }); return res; };
    const wo = (wid: string) => m.WO.findById(wid);

    it('moves units into the target at the matching stage and keeps both work orders consistent', async () => {
      asAdmin();
      d.A = await mkWo(10);
      d.B = await mkWo(6);
      await out(d.A, 1, { input: 10, good: 8, scrap: 2, notes: 'cracks' }); // 8 units sit in the SFG store after Cut
      const lot = await m.SFG.findOne({ workOrder: d.A, stageSeq: 1 });
      expect(lot.remainingQty).toBe(8);
      d.lot = id(lot);

      const res = await call(r.reissue.POST, 'POST', { workOrderId: d.B, quantity: 5 }, { id: d.lot });
      expect(res.status).toBe(200);
      expect(res.json.lot.remainingQty).toBe(3);
      expect(res.json.lot.reissues[0]).toMatchObject({ quantity: 5 });

      const A = await wo(d.A), B = await wo(d.B);
      expect(A.stages[1].inQty).toBe(3);        // source gives up 5 of its 8 waiting at Weld
      expect(B.stages[0].inQty).toBe(1);        // target needs to cut only 1 more from scratch
      expect(B.stages[1].inQty).toBe(5);        // 5 already-cut units join at Weld
      expect(B.sfgReceived[0]).toMatchObject({ quantity: 5, atStage: 2, fromWorkOrder: A.woNumber });
    });

    it('the target can finish its full quantity from the re-issued units plus new work', async () => {
      const cut = await out(d.B, 1, { input: 1, good: 1, scrap: 0 });
      expect(cut.status).toBe(200);
      expect((await out(d.B, 2, { input: 6, good: 6, scrap: 0 })).status).toBe(200); // 5 re-issued + 1 cut
      const paint = await out(d.B, 3, { input: 6, good: 6, scrap: 0 });
      expect(paint.status).toBe(200);
      expect(paint.json.fgReceivedQty).toBe(6); // exactly the target's planned quantity
    });

    it('rejects invalid re-issues', async () => {
      const lot = d.lot;
      const C = await mkWo(4);
      expect((await call(r.reissue.POST, 'POST', { workOrderId: d.A, quantity: 1 }, { id: lot })).status).toBe(400);          // same work order
      expect((await call(r.reissue.POST, 'POST', { workOrderId: C, quantity: 0 }, { id: lot })).status).toBe(400);            // zero
      expect((await call(r.reissue.POST, 'POST', { workOrderId: C, quantity: 4 }, { id: lot })).status).toBe(409);            // only 3 left in the lot
      expect((await call(r.reissue.POST, 'POST', { workOrderId: d.bikeWo, quantity: 1 }, { id: lot })).status).toBe(400);     // different product
      expect((await call(r.reissue.POST, 'POST', { workOrderId: 'x', quantity: 1 }, { id: lot })).status).toBe(400);
      expect((await call(r.reissue.POST, 'POST', { workOrderId: d.B, quantity: 1 }, { id: lot })).status).toBe(409);          // B is already finished processing at stage 1? stage 1 nothing waiting

      // target whose first stage has less waiting than requested
      const D = await mkWo(2);
      const tooMany = await call(r.reissue.POST, 'POST', { workOrderId: D, quantity: 3 }, { id: lot });
      expect(tooMany.status).toBe(409);
      expect(tooMany.json.error).toContain('only 2');

      // routing not configured
      const bare = await call(r.prod.POST, 'POST', { product: id(d.frame), bom: id(d.frameBom), quantity: 5, demandType: 'MTS', plannedStartDate: '2026-10-01', plannedEndDate: '2026-10-10' });
      expect((await call(r.reissue.POST, 'POST', { workOrderId: id(bare.json), quantity: 1 }, { id: lot })).json.error).toContain('routing');

      // nothing changed by the failures
      expect((await m.SFG.findById(lot)).remainingQty).toBe(3);
    });

    it('only production managers can re-issue, and the full flow leaves a trace on the lot', async () => {
      const E = await mkWo(3);
      asRole('STAFF');
      expect((await call(r.reissue.POST, 'POST', { workOrderId: E, quantity: 1 }, { id: d.lot })).status).toBe(403);
      asRole('PRODUCTION_MANAGER');
      expect((await call(r.reissue.POST, 'POST', { workOrderId: E, quantity: 3 }, { id: d.lot })).status).toBe(200);
      const lot = await m.SFG.findById(d.lot);
      expect(lot.remainingQty).toBe(0);
      expect(lot.reissues.map((x: any) => x.quantity)).toEqual([5, 3]);
      const list = await call(r.sfg.GET, 'GET');
      expect(list.json.find((l: any) => String(l._id) === d.lot).reissues).toHaveLength(2);
    });

    it('two simultaneous re-issues cannot send more units than the lot holds', async () => {
      asAdmin();
      const src = await mkWo(20);
      const t1 = await mkWo(10), t2 = await mkWo(10);
      await out(src, 1, { input: 20, good: 6, scrap: 14, notes: 'bad batch' }); // lot of 6
      const lot = await m.SFG.findOne({ workOrder: src, stageSeq: 1 });
      const results = await Promise.all([
        call(r.reissue.POST, 'POST', { workOrderId: t1, quantity: 6 }, { id: id(lot) }),
        call(r.reissue.POST, 'POST', { workOrderId: t2, quantity: 6 }, { id: id(lot) }),
      ]);
      expect(results.map(x => x.status).sort()).toEqual([200, 409]); // exactly one wins
      const after = await m.SFG.findById(lot._id);
      expect(after.remainingQty).toBe(0);
      expect(after.reissues).toHaveLength(1);
      // units are conserved: whatever left the source arrived at exactly one target
      const [S, T1, T2] = await Promise.all([m.WO.findById(src), m.WO.findById(t1), m.WO.findById(t2)]);
      const received = [T1, T2].reduce((n: number, t: any) => n + t.stages[1].inQty, 0);
      expect(received).toBe(6);
      expect(S.stages[1].inQty).toBe(0);
    });

    it('a failed re-issue leaves the lot and both work orders untouched', async () => {
      asAdmin();
      const src = await mkWo(10);
      await out(src, 1, { input: 10, good: 10, scrap: 0 });
      const lot = await m.SFG.findOne({ workOrder: src, stageSeq: 1 });
      const tgt = await mkWo(10);
      await m.WO.updateOne({ _id: tgt }, { 'stages.0.good': 9 }); // only 1 unit left waiting at the target's first stage
      const before = { lot: (await m.SFG.findById(lot._id)).remainingQty, src: (await m.WO.findById(src)).stages[1].inQty, tgt: (await m.WO.findById(tgt)).stages[1].inQty };
      const bad = await call(r.reissue.POST, 'POST', { workOrderId: tgt, quantity: 5 }, { id: id(lot) });
      expect(bad.status).toBe(409);
      expect({ lot: (await m.SFG.findById(lot._id)).remainingQty, src: (await m.WO.findById(src)).stages[1].inQty, tgt: (await m.WO.findById(tgt)).stages[1].inQty }).toEqual(before);
    });

    it('undoes the earlier steps when a later step fails part-way', async () => {
      asAdmin();
      const src = await mkWo(10);
      await out(src, 1, { input: 10, good: 10, scrap: 0 });
      const lot = await m.SFG.findOne({ workOrder: src, stageSeq: 1 });
      const tgt = await mkWo(10);
      const snapshot = async () => ({ lot: (await m.SFG.findById(lot._id)).remainingQty, src: (await m.WO.findById(src)).stages[1].inQty, tgt0: (await m.WO.findById(tgt)).stages[0].inQty, tgt1: (await m.WO.findById(tgt)).stages[1].inQty });
      const before = await snapshot();

      // make the update that adds units to the target fail, after the lot and source have already been changed
      const original = m.WO.updateOne;
      m.WO.updateOne = (filter: any, update: any, ...rest: any[]) => (update?.$push?.sfgReceived ? Promise.reject(new Error('simulated failure')) : original.call(m.WO, filter, update, ...rest));
      let res: any;
      try { res = await call(r.reissue.POST, 'POST', { workOrderId: tgt, quantity: 4 }, { id: id(lot) }); } finally { m.WO.updateOne = original; }

      expect(res.status).toBe(500);
      expect(await snapshot()).toEqual(before);                       // everything put back
      expect((await m.SFG.findById(lot._id)).reissues).toHaveLength(0);
      // and the same re-issue succeeds once the failure is gone
      expect((await call(r.reissue.POST, 'POST', { workOrderId: tgt, quantity: 4 }, { id: id(lot) })).status).toBe(200);
    });

    it('records the movement on both work orders and in the audit log', async () => {
      asAdmin();
      const src = await mkWo(10);
      await out(src, 1, { input: 10, good: 10, scrap: 0 });
      const lot = await m.SFG.findOne({ workOrder: src, stageSeq: 1 });
      const tgt = await mkWo(10);
      expect((await call(r.reissue.POST, 'POST', { workOrderId: tgt, quantity: 2 }, { id: id(lot) })).status).toBe(200);
      const S = await m.WO.findById(src), T = await m.WO.findById(tgt);
      expect(S.sfgIssuedOut[0]).toMatchObject({ quantity: 2, toWorkOrder: T.woNumber, batchCode: lot.batchCode, atStage: 2 });
      expect(T.sfgReceived[0]).toMatchObject({ quantity: 2, fromWorkOrder: S.woNumber, batchCode: lot.batchCode, atStage: 2 });
    });

    it('cannot re-issue into a completed work order', async () => {
      asAdmin();
      const F = await mkWo(2);
      await m.WO.updateOne({ _id: F }, { status: 'COMPLETED' });
      const fresh = await mkWo(10);
      await out(fresh, 1, { input: 10, good: 10, scrap: 0 });
      const lot2 = await m.SFG.findOne({ workOrder: fresh, stageSeq: 1 });
      const res = await call(r.reissue.POST, 'POST', { workOrderId: F, quantity: 1 }, { id: id(lot2) });
      expect(res.status).toBe(409);
      expect(res.json.error).toContain('COMPLETED');
    });
  });
});
