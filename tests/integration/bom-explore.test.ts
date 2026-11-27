import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// The BOM screen's data: the tree with stock at every level, "can we build N?" netted like MRP (sub-assemblies from
// stock first, one shared pool of parts), the most that can be made today, the material balance and where an item is used.
describe('BOM explorer', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const explore = (bomId: string, q = '') => call(r.explore.GET, 'GET', undefined, { id: bomId }, q);

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'BillOfMaterials', 'Batch']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.list = await import('@/app/api/production/bom/route');
    r.one = await import('@/app/api/production/bom/[id]/route');
    r.explore = await import('@/app/api/production/bom/[id]/explore/route');
    asAdmin();
    const item = (sku: string, uom: string, extra: any = {}) => m.Product.create({ name: sku, sku, category: oid(), uom, ...extra });
    const stock = (p: any, qty: number) => m.Batch.create({ product: p._id, batchNumber: `B-${p.sku}`, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'MAIN' });
    const bom = async (body: any) => { const made = await call(r.list.POST, 'POST', body); await call(r.one.PATCH, 'PATCH', { action: 'activate' }, { id: made.json._id }); return made.json._id; };

    d.bike = await item('FG-BIKE', 'pcs', { productType: 'FINISHED_GOOD' });
    d.frame = await item('SF-FRAME', 'pcs', { productType: 'SEMI_FINISHED' });
    d.tube = await item('RM-TUBE', 'pcs', { productType: 'RAW_MATERIAL' });
    d.tyre = await item('RM-TYRE', 'pcs', { productType: 'RAW_MATERIAL' });
    await stock(d.frame, 2); await stock(d.tube, 10); await stock(d.tyre, 20);
    d.frameBom = await bom({ product: id(d.frame), components: [{ product: id(d.tube), quantity: 3 }] });
    // the bike needs frames (made from tubes) and also one tube of its own: both draw on the same 10 tubes
    d.bikeBom = await bom({ product: id(d.bike), components: [{ product: id(d.frame), quantity: 1 }, { product: id(d.tyre), quantity: 2 }, { product: id(d.tube), quantity: 1 }] });

    d.masala = await item('FG-MASALA', 'kg', { productType: 'FINISHED_GOOD' });
    d.chilli = await item('RM-CHILLI', 'kg', { productType: 'RAW_MATERIAL' });
    d.salt = await item('RM-SALT', 'kg', { productType: 'RAW_MATERIAL' });
    d.dust = await item('SC-DUST', 'kg', { productType: 'RAW_MATERIAL', isScrap: true });
    d.husk = await item('BP-HUSK', 'kg', { productType: 'FINISHED_GOOD' });
    d.masalaBom = await bom({ product: id(d.masala), baseQuantity: 100, components: [{ product: id(d.chilli), quantity: 60, wastagePercentage: 5 }, { product: id(d.salt), quantity: 42 }],
      outputs: [{ product: id(d.dust), kind: 'SCRAP', quantity: 3 }, { product: id(d.husk), kind: 'BY_PRODUCT', quantity: 1 }] });
  }, 120000);
  afterAll(stopDb);

  it('shows every level for the quantity asked, with the stock free to use beside each item', async () => {
    const { json } = await explore(d.bikeBom, '?qty=5');
    expect(json.quantity).toBe(5);
    const [frame, tyre, tube] = json.tree.children;
    expect(frame).toMatchObject({ sku: 'SF-FRAME', perParent: 1, need: 5, available: 2, bomVersion: '1' });
    expect(frame.children[0]).toMatchObject({ sku: 'RM-TUBE', perParent: 3, need: 15, available: 10 });
    expect(tyre).toMatchObject({ need: 10, available: 20 });
    expect(tube).toMatchObject({ need: 5, children: [] });
  });

  it('nets like MRP: frames from stock first, and both uses of the tube share the same 10', async () => {
    // 5 bikes: 2 frames in stock, 3 to make = 9 tubes, plus 5 tubes direct = 14 against 10
    const five = (await explore(d.bikeBom, '?build=5')).json;
    expect(five.ok).toBe(false);
    expect(five.shortages).toEqual([expect.objectContaining({ sku: 'RM-TUBE', need: 14, available: 10, short: 4 })]);
    // the most: 4 bikes = 2 frames from stock + 2 made (6 tubes) + 4 tubes = 10
    expect(five.maxNow).toBe(4);
    const four = (await explore(d.bikeBom, '?build=4')).json;
    expect(four).toMatchObject({ ok: true, shortages: [], maxNow: 4 });
    expect((await explore(d.bikeBom, '?build=0')).status).toBe(400);
  });

  it('adds up inputs and outputs when everything is in the same unit, and stays out of the way when not', async () => {
    const masala = (await explore(d.masalaBom)).json;
    // 63 kg chilli (60 + 5%) + 42 kg salt = 105 kg in; 100 kg masala + 3 kg dust + 1 kg husk out; 1 kg lost
    expect(masala.balance).toEqual({ comparable: true, unit: 'kg', input: 105, output: 100, scrap: 3, byProduct: 1, loss: 1 });
    expect((await explore(d.bikeBom)).json.balance).toEqual({ comparable: false });
    // part quantities: the most masala that can be made is not rounded to whole units (no chilli or salt in stock yet = 0)
    expect((await explore(d.masalaBom, '?build=50')).json).toMatchObject({ ok: false, maxNow: 0 });
  });

  it('says where an item is used, as a component or as scrap / by-product', async () => {
    const tube = (await explore(d.frameBom)).json; // the frame's own BOM: where is the frame used?
    expect(tube.whereUsed.map((w: any) => [w.sku, w.role, w.quantity])).toEqual([['FG-BIKE', 'COMPONENT', 1]]);
    // where the dust comes from: a BOM of its own item would show it, so look it up through a BOM made for the husk
    const huskBom = (await call(r.list.POST, 'POST', { product: id(d.husk), components: [{ product: id(d.salt), quantity: 1 }] })).json;
    const used = (await explore(huskBom._id)).json.whereUsed;
    expect(used).toEqual([expect.objectContaining({ sku: 'FG-MASALA', role: 'BY_PRODUCT', quantity: 1, isDefault: true })]);
  });

  it('lists every version of the item, newest first', async () => {
    await call(r.one.PATCH, 'PATCH', { action: 'new-version' }, { id: d.bikeBom });
    const versions = (await explore(d.bikeBom)).json.versions;
    expect(versions.map((v: any) => [v.version, v.status, v.isDefault])).toEqual([['2', 'DRAFT', false], ['1', 'ACTIVE', true]]);
    expect(versions[1].components[0].product.sku).toBe('SF-FRAME');
  });
});
