import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// I5: a requisition remembers which batches it reserved from, and only ever issues or releases those.
describe('material requisition reservations are per batch', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const tubeBatch = (n: string, qty: number, expiry: string, over: any = {}) => m.Batch.create({ product: d.tube._id, batchNumber: `${n}-${rnd()}`, expiryDate: new Date(expiry), initialQuantity: qty, currentQuantity: qty, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1', ...over });
  const wo = (qty: number) => m.WO.create({ woNumber: `WO-H-${rnd()}`, bom: d.bom._id, product: d.bike._id, quantity: qty, demandType: 'MTS', status: 'PLANNED' });
  const issue = (mrn: any) => call(r.mrnOne.PATCH, 'PATCH', { action: 'issue', scans: ['TUBE'] }, { id: id(mrn) });
  const clear = () => m.Batch.deleteMany({ product: d.tube._id });

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', WO: 'WorkOrder', MRN: 'MaterialRequisition' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.mrnOne = await import('@/app/api/mrn/[id]/route');
    d.lib = await import('@/lib/mrn');
    const cat = new mongoose.Types.ObjectId();
    const mk = (name: string, sku: string, type: string) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '7306' });
    d.bike = await mk('Bike', 'BIKE', 'FINISHED_GOOD');
    d.tube = await mk('Tube', 'TUBE', 'RAW_MATERIAL');
    d.bom = await m.BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', components: [{ product: d.tube._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('records which batches each line reserved from', async () => {
    await clear();
    const early = await tubeBatch('E', 10, '2030-01-01', { allocatedQuantity: 6 }); // 6 of this batch belong to a sales order
    const late = await tubeBatch('L', 10, '2031-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');       // needs 6 tubes: 4 free in the early batch, 2 from the late one
    const holds = mrn.items[0].holds.map((h: any) => ({ batch: String(h.batch), quantity: h.quantity }));
    expect(holds).toEqual([{ batch: id(early), quantity: 4 }, { batch: id(late), quantity: 2 }]);
  });

  it('issuing never consumes units reserved for something else', async () => {
    await clear();
    const early = await tubeBatch('E', 10, '2030-01-01', { allocatedQuantity: 6 });
    const late = await tubeBatch('L', 10, '2031-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');
    const res = await issue(mrn);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(await m.Batch.findById(early._id)).toMatchObject({ currentQuantity: 6, allocatedQuantity: 6 });   // the sales order's 6 are untouched
    expect(await m.Batch.findById(late._id)).toMatchObject({ currentQuantity: 8, allocatedQuantity: 0 });
    const after: any = await m.MRN.findById(mrn._id).lean();
    expect(after.status).toBe('ISSUED');
    expect(after.items[0].holds.map((h: any) => h.issued)).toEqual([4, 2]);
  });

  it('cancelling gives back exactly the reserved batches, not another batch that carries a reservation', async () => {
    await clear();
    const early = await tubeBatch('E', 10, '2030-01-01');
    const late = await tubeBatch('L', 10, '2031-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');          // 6 from the early batch
    await m.Batch.updateOne({ _id: late._id }, { allocatedQuantity: 5 });              // someone else reserved 5 of the late batch
    expect(await d.lib.releaseMrn(mrn)).toBe(true);
    expect((await m.Batch.findById(early._id)).allocatedQuantity).toBe(0);
    expect((await m.Batch.findById(late._id)).allocatedQuantity).toBe(5);              // untouched
  });

  it('issue stops, and puts everything back, if reserved stock has gone', async () => {
    await clear();
    const a = await tubeBatch('A', 4, '2030-01-01');
    const b = await tubeBatch('B', 10, '2031-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');          // 4 from A, 2 from B
    await m.Batch.updateOne({ _id: b._id }, { currentQuantity: 1 });                    // stock written off after reserving
    const res = await issue(mrn);
    expect(res.status).toBe(409);
    expect(await m.Batch.findById(a._id)).toMatchObject({ currentQuantity: 4, allocatedQuantity: 4 });
    const after: any = await m.MRN.findById(mrn._id).lean();
    expect(after.status).toBe('RESERVED');
    expect(after.items[0].issuedQty).toBe(0);
    expect(after.items[0].holds.map((h: any) => h.issued)).toEqual([0, 0]);
  });

  it('two issues at once take the stock once', async () => {
    await clear();
    const a = await tubeBatch('A', 10, '2030-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');          // 6
    const both = await Promise.all([issue(mrn), issue(mrn)]);
    expect(both.map(x => x.status).sort()).toEqual([200, 409]);
    expect(await m.Batch.findById(a._id)).toMatchObject({ currentQuantity: 4, allocatedQuantity: 0 });
  });

  it('a top-up adds to the batches held and is released with them', async () => {
    await clear();
    const a = await tubeBatch('A', 4, '2030-01-01');
    const mrn: any = await d.lib.createMrnForWorkOrder(await wo(3), 'Admin');          // wants 6, only 4 exist
    expect(mrn.shortfall).toBe(true);
    const b = await tubeBatch('B', 10, '2031-01-01');
    const fresh = await m.MRN.findById(mrn._id);
    await d.lib.reserveMore(fresh);
    const after: any = await m.MRN.findById(mrn._id).lean();
    expect(after.items[0].reservedQty).toBe(6);
    expect(after.items[0].holds.map((h: any) => [String(h.batch), h.quantity])).toEqual([[id(a), 4], [id(b), 2]]);
    await d.lib.releaseMrn(after);
    expect((await m.Batch.findById(a._id)).allocatedQuantity).toBe(0);
    expect((await m.Batch.findById(b._id)).allocatedQuantity).toBe(0);
  });
});
