import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, asRole, id } from './harness';

// Scrap and by-products: listed on the BOM per base quantity, expected on the work order, recorded once when the work
// is done (0 allowed). Scrap goes to the SCRAP store, by-products wait for QC; the work order cannot close without them.
describe('BOM scrap and by-products', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const bomPatch = (bomId: string, body: any) => call(r.bom.PATCH, 'PATCH', body, { id: bomId });
  const outputs = (woId: string, body?: any) => (body ? call(r.outputs.POST, 'POST', body, { id: woId }) : call(r.outputs.GET, 'GET', undefined, { id: woId }));
  const setStatus = (woId: string, status: string) => call(r.wo.PATCH, 'PATCH', { status }, { id: woId });

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'BillOfMaterials', 'Batch', 'WorkOrder']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.bomList = await import('@/app/api/production/bom/route');
    r.bom = await import('@/app/api/production/bom/[id]/route');
    r.wos = await import('@/app/api/production/route');
    r.wo = await import('@/app/api/production/[id]/route');
    r.outputs = await import('@/app/api/production/[id]/outputs/route');
    r.card = await import('@/app/api/production/[id]/jobcard/route');
    const item = (sku: string, extra: any = {}) => m.Product.create({ name: sku, sku, category: oid(), uom: 'kg', ...extra });
    d.flour = await item('FG-FLOUR', { productType: 'FINISHED_GOOD' });
    d.wheat = await item('RM-WHEAT', { productType: 'RAW_MATERIAL', purchaseUom: 'bag', purchaseConversion: 50 });
    d.bran = await item('BP-BRAN', { productType: 'FINISHED_GOOD' });
    d.dust = await item('SC-DUST', { productType: 'RAW_MATERIAL', isScrap: true });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const base = () => ({ product: id(d.flour), baseQuantity: 100, components: [{ product: id(d.wheat), quantity: 125 }] });

  it('checks the scrap and by-product lines of a BOM', async () => {
    const tryOut = async (out: any) => (await call(r.bomList.POST, 'POST', { ...base(), outputs: [out] })).json.error;
    expect(await tryOut({ product: id(d.bran), kind: 'SCRAP', quantity: 20 })).toMatch(/not marked as a scrap item/);
    expect(await tryOut({ product: id(d.dust), kind: 'BY_PRODUCT', quantity: 3 })).toMatch(/is a scrap item/);
    expect(await tryOut({ product: id(d.flour), kind: 'BY_PRODUCT', quantity: 3 })).toMatch(/what this BOM makes/);
    expect(await tryOut({ product: id(d.wheat), kind: 'BY_PRODUCT', quantity: 3 })).toMatch(/also a component/);
    expect(await tryOut({ product: id(d.bran), kind: 'BY_PRODUCT', quantity: 0 })).toMatch(/more than zero/);
    expect(await tryOut({ product: id(d.bran), kind: 'OTHER', quantity: 1 })).toMatch(/scrap or a by-product/);
    expect(await tryOut({ product: id(d.bran), kind: 'BY_PRODUCT', quantity: 1, unit: 'bag' })).toMatch(/not one of its units/);
    expect(await m.BillOfMaterials.countDocuments()).toBe(0);
  });

  it('keeps them on the BOM, through a new version', async () => {
    const made = await call(r.bomList.POST, 'POST', { ...base(), outputs: [{ product: id(d.bran), kind: 'BY_PRODUCT', quantity: 20 }, { product: id(d.dust), kind: 'scrap', quantity: 3 }] });
    expect(made.status).toBe(201);
    expect(made.json.outputs.map((o: any) => [o.kind, o.quantity, o.unit])).toEqual([['BY_PRODUCT', 20, 'kg'], ['SCRAP', 3, 'kg']]);
    await bomPatch(made.json._id, { action: 'activate' });
    const copy = await bomPatch(made.json._id, { action: 'new-version' });
    expect(copy.json.outputs).toHaveLength(2);
    await call(r.bom.DELETE, 'DELETE', undefined, { id: copy.json._id });
    d.bom = made.json._id;
  });

  it('shows what a work order should give and refuses to record it before the work starts', async () => {
    const wo = await call(r.wos.POST, 'POST', { product: id(d.flour), bom: d.bom, quantity: 250 });
    expect(wo.status).toBe(201);
    d.wo = wo.json._id;
    const view = (await outputs(d.wo)).json;
    expect(view).toMatchObject({ recorded: false, basis: 250, basisIs: 'PLANNED' });
    expect(view.lines.map((l: any) => [l.sku, l.kind, l.expectedQty, l.uom])).toEqual([['BP-BRAN', 'BY_PRODUCT', 50, 'kg'], ['SC-DUST', 'SCRAP', 7.5, 'kg']]);
    expect((await outputs(d.wo, { lines: [] })).status).toBe(409);
  });

  it('will not complete the work order until they are recorded, QC override or not', async () => {
    await setStatus(d.wo, 'IN_PROGRESS');
    await m.WorkOrder.updateOne({ _id: d.wo }, { qcStatus: 'PASSED', fgReceivedQty: 240 });
    const res = await call(r.wo.PATCH, 'PATCH', { status: 'COMPLETED', overrideQcGate: true, overrideReason: 'try' }, { id: d.wo });
    expect(res.status).toBe(422);
    expect(res.json.reason).toBe('OUTPUTS_NOT_RECORDED');
    // expected now follows what was actually made
    expect((await outputs(d.wo)).json).toMatchObject({ basis: 240, basisIs: 'MADE' });
  });

  it('needs a quantity for every line, zero allowed, and puts the stock where it belongs', async () => {
    asRole('QUALITY_INSPECTOR');
    expect((await outputs(d.wo, { lines: [] })).status).toBe(403);
    asRole('STAFF', 'Line Operator');
    expect((await outputs(d.wo, { lines: [{ product: id(d.bran), quantity: 47 }] })).json.error).toMatch(/SC-DUST|0 if none/);
    expect((await outputs(d.wo, { lines: [{ product: id(d.bran), quantity: -1 }, { product: id(d.dust), quantity: 0 }] })).status).toBe(400);

    const rec = await outputs(d.wo, { lines: [{ product: id(d.bran), quantity: 47 }, { product: id(d.dust), quantity: 9.2 }], notes: 'Damp wheat' });
    expect(rec.status).toBe(201);
    expect(rec.json).toMatchObject({ recorded: true, recordedBy: 'Line Operator', notes: 'Damp wheat' });
    const line = (sku: string) => rec.json.lines.find((l: any) => l.sku === sku);
    expect(line('BP-BRAN')).toMatchObject({ expectedQty: 48, actualQty: 47 });
    expect(line('SC-DUST')).toMatchObject({ expectedQty: 7.2, actualQty: 9.2 });

    const bran: any = await m.Batch.findOne({ product: d.bran._id }).lean();
    expect(bran).toMatchObject({ currentQuantity: 47, store: 'FG', qualityStatus: 'PENDING_QC', purchasePrice: 0 });
    const dust: any = await m.Batch.findOne({ product: d.dust._id }).lean();
    expect(dust).toMatchObject({ currentQuantity: 9.2, store: 'SCRAP' });
    expect(line('SC-DUST').batchNumber).toBe(dust.batchNumber);

    // only once
    expect((await outputs(d.wo, { lines: [{ product: id(d.bran), quantity: 1 }, { product: id(d.dust), quantity: 1 }] })).status).toBe(409);
    expect(await m.Batch.countDocuments({ product: { $in: [d.bran._id, d.dust._id] } })).toBe(2);
  });

  it('then completes, and the job card shows expected against actual', async () => {
    asAdmin();
    expect((await setStatus(d.wo, 'COMPLETED')).json.status).toBe('COMPLETED');
    const card = (await call(r.card.GET, 'GET', undefined, { id: d.wo })).json;
    expect(card.otherOutputs.map((o: any) => [o.sku, o.expected, o.actual])).toEqual([['BP-BRAN', 50, 47], ['SC-DUST', 7.5, 9.2]]);
  });

  it('leaves work orders whose BOM has no such lines as they were', async () => {
    const plain = await call(r.bomList.POST, 'POST', { product: id(d.bran), components: [{ product: id(d.wheat), quantity: 1 }] });
    await bomPatch(plain.json._id, { action: 'activate' });
    const wo = await call(r.wos.POST, 'POST', { product: id(d.bran), bom: plain.json._id, quantity: 5 });
    await setStatus(wo.json._id, 'IN_PROGRESS');
    await m.WorkOrder.updateOne({ _id: wo.json._id }, { qcStatus: 'PASSED' });
    expect((await outputs(wo.json._id)).json.lines).toEqual([]);
    expect((await outputs(wo.json._id, { lines: [] })).status).toBe(400);
    expect((await setStatus(wo.json._id, 'COMPLETED')).json.status).toBe('COMPLETED');
  });
});
