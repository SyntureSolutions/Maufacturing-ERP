import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// I6: output needs issued material. I9: scrap on the line is costed when logged. I10: FG sign-off is claimed once and undone on failure. I8: SFG rejection reduces the next stage.
describe('production integrity', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const bal = async (acc: readonly string[]) => (await m.Account.findOne({ code: acc[0] }))?.balance ?? 0;

  // 10 bikes need 20 tubes at 10 each = 200 of material, 20 per bike
  const mkWo = async (opts: { issue?: boolean } = {}) => {
    const wo = await m.WO.create({
      woNumber: `WO-I-${rnd()}`, bom: d.bom._id, product: d.bike._id, quantity: 10, demandType: 'MTS', status: 'IN_PROGRESS',
      stages: [{ seq: 1, name: 'Cut', inQty: 10 }, { seq: 2, name: 'Weld', inQty: 0 }],
    });
    if (opts.issue !== false) {
      const mrn: any = await d.mrnLib.createMrnForWorkOrder(wo, 'Admin');
      asAdmin();
      const res = await call(r.mrnOne.PATCH, 'PATCH', { action: 'issue', scans: ['TUBE'] }, { id: id(mrn) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect((await m.WO.findById(wo._id)).materialCost).toBe(200);
    }
    return wo;
  };
  const out = (wo: any, seq: number, b: any, role = 'PRODUCTION_MANAGER') => { asRole(role); return call(r.stage.POST, 'POST', { seq, operator: 'Ravi', rework: 0, ...b }, { id: id(wo) }); };
  const signOff = (wo: any, b: any) => { asRole('QUALITY_INSPECTOR'); return call(r.fgqc.POST, 'POST', { signature: 'A. Inspector', ...b }, { id: id(wo) }); };
  const lockAccounts = () => m.Lock.create({ kind: 'ACCOUNTING', lockedUpTo: new Date('2100-01-01') });
  const unlock = () => m.Lock.deleteMany({});

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', WO: 'WorkOrder', SFG: 'SFGStock', Scrap: 'ScrapEntry', Account: 'Account', Audit: 'AuditLog', Lock: 'PeriodLock' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.stage = await import('@/app/api/production/[id]/stage-output/route');
    r.fgqc = await import('@/app/api/production/[id]/fg-qc/route');
    r.mrnOne = await import('@/app/api/mrn/[id]/route');
    r.sfgqc = await import('@/app/api/sfg/[id]/qc/route');
    d.mrnLib = await import('@/lib/mrn');
    d.ACC = (await import('@/lib/accounting')).ACC;
    const cat = new mongoose.Types.ObjectId();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712' });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD');
    d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    d.bom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
    await m.Batch.create({ product: d.tube._id, batchNumber: 'B-TUBE-I', expiryDate: new Date('2031-01-01'), initialQuantity: 5000, currentQuantity: 5000, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('I6: output needs issued material', () => {
    it('is refused when nothing has been issued; only a Manager or Admin with a written reason can override, and it is audited', async () => {
      const wo = await mkWo({ issue: false });
      const body = { seq: 1, input: 10, good: 10, scrap: 0 };
      expect((await out(wo, 1, body)).status).toBe(409);
      expect((await out(wo, 1, { ...body, overrideMaterial: true, overrideReason: 'short' }, 'MANAGER')).status).toBe(409);
      expect((await out(wo, 1, { ...body, overrideMaterial: true, overrideReason: 'Customer supplied the tubes free of charge' }, 'PRODUCTION_MANAGER')).status).toBe(409);
      const ok = await out(wo, 1, { ...body, overrideMaterial: true, overrideReason: 'Customer supplied the tubes free of charge' }, 'MANAGER');
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect(await m.Audit.countDocuments({ resourceName: `Work Order ${wo.woNumber}`, action: 'OVERRIDE' })).toBe(1);
    });

    it('is accepted when material has been issued', async () => {
      const wo = await mkWo();
      expect((await out(wo, 1, { input: 10, good: 10, scrap: 0 })).status).toBe(200);
    });
  });

  describe('I9: scrap on the line is costed', () => {
    it('moves the scrapped units cost to scrap loss at once, and the good units carry the full cost', async () => {
      const wip0 = await bal(d.ACC.INV_WIP), loss0 = await bal(d.ACC.SCRAP_LOSS);
      const wo = await mkWo();
      expect(await bal(d.ACC.INV_WIP)).toBe(wip0 + 200);
      expect((await out(wo, 1, { input: 10, good: 8, scrap: 2, notes: 'cracked' })).status).toBe(200);
      expect(await bal(d.ACC.SCRAP_LOSS)).toBe(loss0 + 40);              // 2 units x 20
      expect(await bal(d.ACC.INV_WIP)).toBe(wip0 + 160);
      expect((await m.WO.findById(wo._id)).costTransferred).toBe(40);
      expect((await out(wo, 2, { input: 8, good: 8, scrap: 0 })).status).toBe(200);

      const sign = await signOff(wo, { approvedQty: 8 });
      expect(sign.status, JSON.stringify(sign.json)).toBe(200);
      expect(sign.json.batch.purchasePrice).toBe(20);                   // 160 / 8 good units: not 16
      expect(await bal(d.ACC.INV_WIP)).toBe(wip0);                       // nothing left behind in work in progress
    });

    it('a failure while booking the scrap leaves nothing half done', async () => {
      const wo = await mkWo();
      await lockAccounts();
      const res = await out(wo, 1, { input: 10, good: 8, scrap: 2, notes: 'cracked' });
      await unlock();
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await m.Scrap.countDocuments({ woNumber: wo.woNumber })).toBe(0);
      expect(await m.SFG.countDocuments({ workOrder: wo._id })).toBe(0);
      const after: any = await m.WO.findById(wo._id).lean();
      expect(after.stages[0]).toMatchObject({ good: 0, scrap: 0 });
      expect(after.stageLogs).toHaveLength(0);
      expect(after.outputLock).toBe(false);
    });
  });

  describe('I10: stage output and FG sign-off are safe against two at once', () => {
    it('two stage entries for the same units: one is taken', async () => {
      const wo = await mkWo();
      const both = await Promise.all([out(wo, 1, { input: 10, good: 10, scrap: 0 }), out(wo, 1, { input: 10, good: 10, scrap: 0 })]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect((await m.WO.findById(wo._id)).stages[0].good).toBe(10);
    });

    it('two sign-offs for the same units: one is taken, one batch, cost booked once', async () => {
      const wo = await mkWo();
      await out(wo, 1, { input: 10, good: 10, scrap: 0 });
      await out(wo, 2, { input: 10, good: 10, scrap: 0 });
      const wip0 = await bal(d.ACC.INV_WIP);
      const both = await Promise.all([signOff(wo, { approvedQty: 10 }), signOff(wo, { approvedQty: 10 })]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect(await m.Batch.countDocuments({ product: d.bike._id, batchNumber: new RegExp(`^FG-${wo.woNumber}-`) })).toBe(1);
      expect(await bal(d.ACC.INV_WIP)).toBe(wip0 - 200);
      expect((await m.WO.findById(wo._id)).fgApprovedQty).toBe(10);
    });

    it('a sign-off that cannot be booked is undone: units stay pending, no batch', async () => {
      const wo = await mkWo();
      await out(wo, 1, { input: 10, good: 10, scrap: 0 });
      await out(wo, 2, { input: 10, good: 10, scrap: 0 });
      await lockAccounts();
      const res = await signOff(wo, { approvedQty: 10 });
      await unlock();
      expect(res.status).toBeGreaterThanOrEqual(400);
      const after: any = await m.WO.findById(wo._id).lean();
      expect(after).toMatchObject({ fgApprovedQty: 0, fgScrapQty: 0, costTransferred: 0 });
      expect(await m.Batch.countDocuments({ batchNumber: new RegExp(`^FG-${wo.woNumber}-`) })).toBe(0);
      expect((await signOff(wo, { approvedQty: 10 })).status).toBe(200);   // and it can be done properly afterwards
    });
  });

  describe('I8: SFG rejection reduces what the next stage can use', () => {
    it('rejected units are taken off the next stage input', async () => {
      const wo = await mkWo();
      expect((await out(wo, 1, { input: 10, good: 10, scrap: 0 })).status).toBe(200);
      expect((await m.WO.findById(wo._id)).stages[1].inQty).toBe(10);
      const lot: any = await m.SFG.findOne({ workOrder: wo._id, stageSeq: 1 }).lean();
      asRole('QUALITY_INSPECTOR');
      const res = await call(r.sfgqc.POST, 'POST', { rejectedQty: 3, reason: 'weld cracks', signature: 'A. Inspector' }, { id: id(lot) });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect((await m.WO.findById(wo._id)).stages[1].inQty).toBe(7);
    });
  });
});
