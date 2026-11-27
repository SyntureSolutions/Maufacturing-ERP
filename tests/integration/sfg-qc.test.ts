import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Semi-finished goods inspection: approved lots stay in the SFG store, rejected units go to the SFG reject store
describe('semi-finished goods QC', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const mkLot = async (qty = 10, stage = 1) => {
    // a work order with a routing, one stage logged: the lot is made by the real stage-output route
    asAdmin();
    const wo = await call(r.prod.POST, 'POST', { product: id(d.frame), bom: id(d.bom), quantity: qty, demandType: 'MTS' });
    const woId = id(wo.json);
    await call(r.routing.POST, 'POST', { stages: ['Cut', 'Weld', 'Paint'] }, { id: woId });
    await call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS' }, { id: woId });
    const out = await call(r.stage.POST, 'POST', { seq: stage, operator: 'Ravi', input: qty, good: qty, scrap: 0, rework: 0, overrideMaterial: true, overrideReason: 'fixture: material issue is not part of this test' }, { id: woId });
    expect(out.status, JSON.stringify(out.json)).toBe(200);
    const lot = await m.SFG.findOne({ workOrder: woId, stageSeq: stage }).lean();
    return { woId, lot: lot as any };
  };
  const qc = (lot: any, body: any = {}, role = 'QUALITY_INSPECTOR') => { asRole(role); return call(r.qc.POST, 'POST', { signature: 'A. Inspector', ...body }, { id: id(lot) }); };
  const fresh = async (lot: any) => (await m.SFG.findById(lot._id).lean()) as any;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', SFG: 'SFGStock', WO: 'WorkOrder', Scrap: 'ScrapEntry', Audit: 'AuditLog', Lock: 'PeriodLock', User: 'User' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.prod = await import('@/app/api/production/route');
    r.prodOne = await import('@/app/api/production/[id]/route');
    r.routing = await import('@/app/api/production/[id]/routing/route');
    r.stage = await import('@/app/api/production/[id]/stage-output/route');
    r.qc = await import('@/app/api/sfg/[id]/qc/route');
    r.reissue = await import('@/app/api/sfg/[id]/reissue/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    const cat = oid();
    d.frame = await m.Product.create({ name: 'Frame', sku: 'FRAME', category: cat, uom: 'pcs', productType: 'SEMI_FINISHED', hsnCode: '8714' });
    const tube = await m.Product.create({ name: 'Tube', sku: 'TUBE', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306' });
    d.bom = await m.BOM.create({ product: d.frame._id, version: '1', status: 'ACTIVE', components: [{ product: tube._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'a@test.com', password: 'secret123', role: 'ADMIN' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('a lot made at a stage waits for inspection and cannot be re-issued until approved', async () => {
    const { lot, woId } = await mkLot(10);
    expect(lot.qcStatus).toBe('PENDING');
    const target = await call(r.prod.POST, 'POST', { product: id(d.frame), bom: id(d.bom), quantity: 10, demandType: 'MTS' });
    await call(r.routing.POST, 'POST', { stages: ['Cut', 'Weld', 'Paint'] }, { id: id(target.json) });
    asRole('PRODUCTION_MANAGER');
    const blocked = await call(r.reissue.POST, 'POST', { workOrderId: id(target.json), quantity: 2 }, { id: id(lot) });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toContain('quality inspection');
    d.pending = { lot, woId, target: id(target.json) };
  });

  it('approving the whole lot keeps it in the SFG store and makes it available; the decision is signed and audited', async () => {
    const { lot } = d.pending;
    const res = await qc(lot);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ approved: 10, rejected: 0 });
    const after = await fresh(lot);
    expect(after).toMatchObject({ qcStatus: 'APPROVED', remainingQty: 10, qcRejectedQty: 0, qcBy: 'Test QUALITY_INSPECTOR', qcSignature: 'A. Inspector' });
    expect(await m.Audit.countDocuments({ resourceName: lot.batchCode, action: 'APPROVE' })).toBe(1);
    asRole('PRODUCTION_MANAGER');
    const ok = await call(r.reissue.POST, 'POST', { workOrderId: d.pending.target, quantity: 2 }, { id: id(lot) });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);                      // now it can be re-issued
    expect((await qc(lot)).status).toBe(409);                                  // one decision per lot
  });

  it('rejecting some units sends them to the SFG reject store with the reason; the rest is approved', async () => {
    const { lot } = await mkLot(10);
    const res = await qc(lot, { rejectedQty: 3, reason: 'weld cracks' });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ approved: 7, rejected: 3 });
    const after = await fresh(lot);
    expect(after).toMatchObject({ qcStatus: 'APPROVED', remainingQty: 7, qcRejectedQty: 3, qcReason: 'weld cracks' });
    const rejects = await m.Scrap.find({ store: 'SFG_REJECT', woNumber: lot.woNumber }).lean();
    expect(rejects).toHaveLength(1);
    expect(rejects[0]).toMatchObject({ quantity: 3, reason: 'weld cracks' });
  });

  it('rejecting the whole lot marks it rejected and it can never be re-issued', async () => {
    const { lot } = await mkLot(5);
    const res = await qc(lot, { rejectedQty: 5, reason: 'wrong material' });
    expect(res.status).toBe(200);
    const after = await fresh(lot);
    expect(after).toMatchObject({ qcStatus: 'REJECTED', remainingQty: 0 });
    asRole('PRODUCTION_MANAGER');
    expect((await call(r.reissue.POST, 'POST', { workOrderId: d.pending.target, quantity: 1 }, { id: id(lot) })).status).toBe(409);
  });

  it('refusals: wrong roles, missing signature or reason, bad quantities, unknown lots, units already gone, locked inventory', async () => {
    const { lot } = await mkLot(10);
    for (const role of ['PRODUCTION_MANAGER', 'STAFF', 'SALES', 'VIEWER', 'MANAGER']) expect((await qc(lot, {}, role)).status, role).toBe(403);
    expect((await qc(lot, { signature: '' })).status).toBe(400);
    expect((await qc(lot, { rejectedQty: 2 })).status).toBe(400);                         // a rejection needs a reason
    for (const q of [-1, 'x']) expect((await qc(lot, { rejectedQty: q, reason: 'bad' })).status, String(q)).toBe(400);
    expect((await qc(lot, { rejectedQty: 11, reason: 'bad' })).status).toBe(409);         // more than is in the store
    expect((await call(r.qc.POST, 'POST', { signature: 'x' }, { id: 'nope' })).status).toBe(404);
    expect((await call(r.qc.POST, 'POST', { signature: 'x' }, { id: String(oid()) })).status).toBe(404);
    expect((await fresh(lot)).qcStatus).toBe('PENDING');                                  // nothing changed

    await m.SFG.updateOne({ _id: lot._id }, { remainingQty: 0 });                         // everything already went on to the next stage
    expect((await qc(lot)).status).toBe(409);
    await m.SFG.updateOne({ _id: lot._id }, { remainingQty: 10 });

    asAdmin();
    await call(r.lock.PUT, 'PUT', { kind: 'INVENTORY', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    expect((await qc(lot)).status).not.toBe(200);
    asAdmin();
    await call(r.lock.PUT, 'PUT', { kind: 'INVENTORY', lockedUpTo: '2000-01-01', password: 'secret123' });
    expect((await fresh(lot)).qcStatus).toBe('PENDING');
  });

  it('two inspectors deciding the same lot at once: one decision, one reject entry', async () => {
    const { lot } = await mkLot(10);
    const both = await Promise.all([qc(lot, { rejectedQty: 4, reason: 'burrs' }), qc(lot, { rejectedQty: 4, reason: 'burrs' })]);
    expect(both.map(x => x.status).sort()).toEqual([200, 409]);
    expect((await fresh(lot)).remainingQty).toBe(6);                                      // not 2
    expect(await m.Scrap.countDocuments({ store: 'SFG_REJECT', woNumber: lot.woNumber })).toBe(1);
  });
});
