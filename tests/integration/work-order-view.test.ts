import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id, state } from './harness';

// P4: one work order can be read with its product, routing, stage log, QC and material readiness
describe('work order view', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', WO: 'WorkOrder' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.one = await import('@/app/api/production/[id]/route');
    const cat = new mongoose.Types.ObjectId();
    m.frame = await m.Product.create({ name: 'Frame', sku: 'FR-WV', category: cat, uom: 'pcs', productType: 'SEMI_FINISHED', hsnCode: '8714' });
    const tube = await m.Product.create({ name: 'Tube', sku: 'TUBE-WV', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306' });
    m.bom = await m.BOM.create({ product: m.frame._id, version: '3', status: 'ACTIVE', components: [{ product: tube._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const mk = (extra: any = {}) => m.WO.create({ woNumber: `WO-V-${rnd()}`, product: m.frame._id, bom: m.bom._id, quantity: 10, demandType: 'MTS', ...extra });
  const get = (wo: any) => { asAdmin(); return call(r.one.GET, 'GET', undefined, { id: id(wo) }); };

  it('returns the work order with product and BOM filled in and says no material requisition exists yet', async () => {
    const wo = await mk({ priority: 'HIGH' });
    const res = await get(wo);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ woNumber: wo.woNumber, quantity: 10, priority: 'HIGH' });
    expect(res.json.product).toMatchObject({ sku: 'FR-WV', name: 'Frame' });
    expect(res.json.bom.version).toBe('3');
    expect(res.json.readiness).toMatchObject({ status: 'NO_MRN' });
  });

  it('carries the routing, the stage log and the finished-goods inspection', async () => {
    const at = new Date();
    const wo = await mk({
      status: 'IN_PROGRESS', materialCost: 600, costTransferred: 300, fgReceivedQty: 6,
      stages: [{ seq: 1, name: 'Cut', inQty: 10, good: 8, scrap: 1, rework: 0 }],
      stageLogs: [{ seq: 1, stageName: 'Cut', input: 10, good: 8, scrap: 1, rework: 0, operator: 'Ravi', notes: 'one cracked', at }],
      fgQc: { status: 'PARTIAL', inspector: 'Test QUALITY_INSPECTOR', signature: 'A. Inspector', certificateNo: 'CERT-1', checks: [{ name: 'Weld', standard: 'no cracks', actual: 'ok', result: 'PASS' }] },
      fgApprovedQty: 6, fgScrapQty: 1,
    });
    const res = await get(wo);
    expect(res.json.stages[0]).toMatchObject({ seq: 1, name: 'Cut', inQty: 10, good: 8, scrap: 1 });
    expect(res.json.stageLogs[0]).toMatchObject({ operator: 'Ravi', notes: 'one cracked', good: 8 });
    expect(res.json.fgQc).toMatchObject({ status: 'PARTIAL', certificateNo: 'CERT-1' });
    expect(res.json.fgQc.checks[0]).toMatchObject({ name: 'Weld', result: 'PASS' });
    expect(res.json).toMatchObject({ materialCost: 600, costTransferred: 300, fgReceivedQty: 6, fgApprovedQty: 6, fgScrapQty: 1 });
  });

  it('answers 404 for an unknown or malformed id and 401 without a login', async () => {
    asAdmin();
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await call(r.one.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);   // used to be a 500
    state.user = null;
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(401);
    asAdmin();
  });
});
